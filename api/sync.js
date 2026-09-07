import { upsertRows, deleteRows, parseBody } from './_db.js'
import { requireAuth } from './_auth.js'

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

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const body = await parseBody(req)
    const { type } = body

    if (type === 'section') {
      // Sync genérico: upsert + delete por id
      const { table, upsert, delete: toDelete } = body
      // `table` ausente montaria `INSERT INTO undefined` e voltaria como 500 genérico, sem dizer
      // que o problema foi o payload. Sai como 400, que é o que de fato é.
      if (!table || typeof table !== 'string') {
        return res.status(400).json({ error: 'sync section sem `table`' })
      }
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
      const [deleted, upserted] = await Promise.all([
        deleteRows('favorecidos', remove, 'name'),
        upsertRows('favorecidos', (add || []).map(name => ({ name })), 'name'),
      ])
      const gravado = { upserted, deleted }
      logSync('payees', { add: add?.length ?? 0, remove: remove?.length ?? 0 }, gravado)
      return res.json({ ok: true, written: gravado })

    } else if (type === 'settings') {
      // Linha única na tabela configuracoes (id = 1)
      const { data } = body
      const upserted = await upsertRows('configuracoes', [{ id: 1, ...data }], 'id')
      logSync('settings', { keys: Object.keys(data || {}).length }, { upserted })
      return res.json({ ok: true, written: { upserted } })
    }

    return res.status(400).json({ error: `Unknown sync type: ${type}` })
  } catch (err) {
    console.error('[api/sync]', err.message)
    res.status(500).json({ error: err.message })
  }
}
