import { upsertRows, deleteRows, parseBody, query, ErroIdentificador } from './_db.js'
import { requireAuth } from './_auth.js'
import { autorizarSync } from './_permissoesApi.js'
import { ErroHttp } from './_usuarios.js'
import { comAmbiente } from './_ambiente.js'
import { AMBIENTE_PRINCIPAL } from '../src/lib/ambienteHost.js'
import { filtrarConfiguracoes, conferirExclusaoEmMassa, logRecusa, TABELAS_DO_SYNC } from './_syncTrava.js'

// POST /api/sync — único caminho de escrita do app para o Neon. O cliente manda uma "section"
// (tabela + linhas a inserir/atualizar + ids a apagar) e este endpoint aplica.
//
// A resposta devolve o que foi RECEBIDO e o que foi GRAVADO, por tabela. Antes era só
// `{ ok: true }`, e aí um sync que gravava zero linhas era indistinguível de um que gravava
// todas — as duas coisas terminavam em 200. Diagnosticar "salvei e sumiu no F5" virava adivinhação:
// não dava para saber se o problema estava na escrita, na leitura ou no estado do app.
//
// Com os contadores, a aba Network já responde: `written.upserted = 0` com `received.upsert > 0`
// significa que as linhas chegaram e nada foi gravado; `upserted > 0` e o dado sumindo mesmo
// assim aponta para a leitura (/api/load) ou para o app sobrescrevendo depois.
function logSync(rotulo, recebido, gravado) {
  // Só contadores e nomes de tabela — nunca o conteúdo das linhas, que é dado financeiro.
  console.log(`[api/sync] ${rotulo}`, JSON.stringify({ recebido, gravado }))
}

// Exclusão em massa sem confirmação (api/_syncTrava.js): 409 com os contadores, que o app usa para
// perguntar ao usuário e reenviar com confirmarExclusaoEmMassa.
function recusarExclusao(res, bloqueio) {
  logRecusa('exclusao_em_massa', bloqueio)
  return res.status(409).json({
    error: `Exclusão em massa recusada: ${bloqueio.apagar} de ${bloqueio.total} linhas de ${bloqueio.tabela}`,
    codigo: 'exclusao_em_massa',
    ...bloqueio,
  })
}

async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const corpo = await parseBody(req)
    // O nome da tabela vem do navegador e entra no SQL: fora da lista fechada → 400, antes de
    // qualquer consulta (a autorização abaixo já lê a tabela). `table` ausente também é 400.
    if (corpo?.type === 'section') {
      const { table } = corpo
      if (!table || typeof table !== 'string') {
        return res.status(400).json({ error: 'sync section sem `table`' })
      }
      if (!TABELAS_DO_SYNC.has(table)) {
        logRecusa('tabela_fora_da_lista', { tabela: String(table).slice(0, 60) })
        return res.status(400).json({ error: 'Tabela não permitida no sync', codigo: 'tabela_nao_permitida' })
      }
    }
    // Permissão do módulo da tabela (e perfis permitidos): grava só o que o usuário pode; nada
    // permitido → 403 (api/_permissoesApi.js).
    const body = await autorizarSync(query, req.user, corpo)
    const { type } = body
    const confirmado = body.confirmarExclusaoEmMassa === true

    if (type === 'section') {
      // Sync genérico: upsert + delete por id
      const { table, upsert, delete: toDelete } = body
      // De-para Dindin só existe no ambiente principal (api/account-mapping.js).
      if (table === 'account_mapping' && req.ambiente?.sigla !== AMBIENTE_PRINCIPAL) {
        return res.status(403).json({ error: 'De-para Dindin disponível só no ambiente principal' })
      }
      const bloqueio = await conferirExclusaoEmMassa(query, table, toDelete, { confirmado })
      if (bloqueio) return recusarExclusao(res, bloqueio)
      const recebido = { table, upsert: upsert?.length ?? 0, delete: toDelete?.length ?? 0 }
      const [deleted, upserted] = await Promise.all([
        deleteRows(table, toDelete),
        upsertRows(table, upsert),
      ])
      const gravado = { upserted, deleted }
      logSync(`section ${table}`, recebido, gravado)
      return res.json({ ok: true, ...recebido, written: gravado })

    } else if (type === 'accounts') {
      // Contas + cartões (tabelas separadas)
      const { upsert, delete: toDelete, cards, deleteCards } = body
      const bloqueio = await conferirExclusaoEmMassa(query, 'contas', toDelete, { confirmado })
        || await conferirExclusaoEmMassa(query, 'cartoes', deleteCards, { confirmado })
      if (bloqueio) return recusarExclusao(res, bloqueio)
      const [contasDeleted, contasUpserted] = await Promise.all([
        deleteRows('contas', toDelete),
        upsertRows('contas', upsert),
      ])
      // Cartões dependem das contas → executa em sequência
      const [cardsDeleted, cardsUpserted] = await Promise.all([
        deleteRows('cartoes', deleteCards),
        upsertRows('cartoes', cards),
      ])
      const gravado = {
        contas: { upserted: contasUpserted, deleted: contasDeleted },
        cartoes: { upserted: cardsUpserted, deleted: cardsDeleted },
      }
      logSync('accounts', {
        contas: { upsert: upsert?.length ?? 0, delete: toDelete?.length ?? 0 },
        cartoes: { upsert: cards?.length ?? 0, delete: deleteCards?.length ?? 0 },
      }, gravado)
      return res.json({ ok: true, written: gravado })

    } else if (type === 'payees') {
      // Favorecidos usam name como PK
      const { add, remove } = body
      const bloqueio = await conferirExclusaoEmMassa(query, 'favorecidos', remove, { coluna: 'name', confirmado })
      if (bloqueio) return recusarExclusao(res, bloqueio)
      const [deleted, upserted] = await Promise.all([
        deleteRows('favorecidos', remove, 'name'),
        upsertRows('favorecidos', (add || []).map(name => ({ name })), 'name'),
      ])
      const gravado = { upserted, deleted }
      logSync('payees', { add: add?.length ?? 0, remove: remove?.length ?? 0 }, gravado)
      return res.json({ ok: true, written: gravado })

    } else if (type === 'settings') {
      // Linha única na tabela configuracoes (id = 1)
      // Valor preenchido não vira vazio/padrão sem camposAlterados (api/_syncTrava.js).
      const [atual] = await query('SELECT * FROM configuracoes WHERE id = 1')
      const { data, recusados } = filtrarConfiguracoes(atual, body.data, body.camposAlterados)
      if (recusados.length) logRecusa('settings', { campos: recusados, recebidos: Object.keys(body.data || {}).length })
      const upserted = Object.keys(data).length ? await upsertRows('configuracoes', [{ id: 1, ...data }], 'id') : 0
      logSync('settings', { keys: Object.keys(body.data || {}).length }, { upserted })
      return res.json({ ok: true, written: { upserted }, recusados })
    }

    return res.status(400).json({ error: `Unknown sync type: ${type}` })
  } catch (err) {
    if (err instanceof ErroHttp || err instanceof ErroIdentificador) return res.status(err.status).json({ error: err.message })
    console.error('[api/sync]', err.message)
    res.status(500).json({ error: err.message })
  }
}

export default comAmbiente(handler)
