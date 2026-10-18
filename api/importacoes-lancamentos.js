import { query, parseBody } from './_db.js'
import { requireAuth } from './_auth.js'
import { comAmbiente } from './_ambiente.js'
import { ErroHttp, ehTabelaInexistente } from './_usuarios.js'
import { contasPermitidas } from './_permissoesApi.js'
import { pode, temTodosPerfis } from '../src/lib/permissoes.js'

// IMPORTAÇÃO PADRÃO DE LANÇAMENTOS — registro dos lotes e de-para de categoria (banco do ambiente).
// Os LANÇAMENTOS em si são gravados pelo app (addTransaction → /api/sync, com importacao_id e
// fitid), para o saldo da conta seguir o mecanismo de sempre; desfazer = o app apaga cada um
// (deleteTransaction) e só então marca o lote como desfeito aqui.
//   GET                          → últimas importações (com quantos lançamentos do lote existem)
//   GET  ?acao=lote&id=          → { lote, gravados }
//   GET  ?acao=ofx-conta&banco=&conta= → contas em que esse extrato OFX já foi importado
//   POST { id, conta_id, formato, arquivo, qtd, total_entradas, total_saidas, ofx_banco, ofx_conta }
//        → registra o lote (status em_andamento)                       [incluir lançamentos]
//   POST ?acao=concluir { id }   → status concluida, só se TODOS os lançamentos já estão no banco
//   POST ?acao=desfazer { id }   → status desfeita, só se NENHUM lançamento do lote sobrou [excluir]
//   GET/POST/PATCH/DELETE ?acao=depara → de-para nome de origem → categoria  [incluir lançamentos]

const FORMATOS = ['xlsx', 'csv', 'ofx']
const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const texto = (v, max) => { const s = String(v ?? '').trim(); return s ? s.slice(0, max) : null }
const numero = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0 }

function queryParam(req, nome) {
  if (req.query?.[nome] != null) return req.query[nome]
  try { return new URL(req.url, 'http://x').searchParams.get(nome) } catch { return null }
}

function exigir(user, acao) {
  if (!pode(user, 'lancamentos', acao)) {
    throw new ErroHttp(403, acao === 'excluir' ? 'Seu nível de acesso não permite excluir lançamentos' : 'Seu nível de acesso não permite incluir lançamentos')
  }
}

// A conta tem de existir, ser de lançamento comum (sem cartão) e estar nos perfis do usuário.
async function exigirConta(user, contaId) {
  const [c] = await query('SELECT id, type, profile_id FROM contas WHERE id = $1', [String(contaId || '')])
  if (!c) throw new ErroHttp(404, 'Conta não encontrada')
  if (!['checking', 'savings', 'cash'].includes(c.type)) throw new ErroHttp(400, 'Importe cartão de crédito pelo Importar Fatura')
  if (!temTodosPerfis(user.perfis)) {
    const permitidas = new Set(await contasPermitidas(query, user.perfis))
    if (!permitidas.has(c.id)) throw new ErroHttp(403, 'Conta fora dos seus perfis')
  }
  return c
}

const gravadosDoLote = async (id) => (await query('SELECT count(*)::int AS n FROM lancamentos WHERE importacao_id = $1', [id]))[0].n

async function buscarLote(id) {
  const [l] = await query('SELECT * FROM importacoes_lancamentos WHERE id = $1', [String(id || '')])
  if (!l) throw new ErroHttp(404, 'Importação não encontrada')
  return l
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  if (!requireAuth(req, res)) return
  const user = req.user
  const acao = queryParam(req, 'acao')
  try {
    if (acao === 'depara') {
      if (req.method === 'GET') return res.json({ depara: await query('SELECT id, nome_origem, nome_exibicao, categoria_id, atualizado_em FROM importacao_depara ORDER BY nome_origem') })
      exigir(user, 'incluir')
      const body = (await parseBody(req)) || {}
      if (req.method === 'DELETE') {
        const id = String(body.id || queryParam(req, 'id') || '')
        const [r] = await query('SELECT id FROM importacao_depara WHERE id = $1', [id])
        if (!r) throw new ErroHttp(404, 'De-para não encontrado')
        await query('DELETE FROM importacao_depara WHERE id = $1', [id])
        return res.json({ ok: true })
      }
      const categoria = texto(body.categoria_id, 100)
      if (!categoria) throw new ErroHttp(400, 'Escolha a categoria')
      const [cat] = await query('SELECT id FROM categorias WHERE id = $1', [categoria])
      if (!cat) throw new ErroHttp(400, 'Categoria inexistente')
      if (req.method === 'PATCH') {
        const [r] = await query('UPDATE importacao_depara SET categoria_id = $2, atualizado_em = now() WHERE id = $1 RETURNING *', [String(body.id || ''), categoria])
        if (!r) throw new ErroHttp(404, 'De-para não encontrado')
        return res.json({ ok: true, item: r })
      }
      if (req.method === 'POST') {
        const origem = normalizar(body.nome_origem)
        if (!origem) throw new ErroHttp(400, 'Informe o nome de origem')
        const [r] = await query(
          `INSERT INTO importacao_depara (nome_origem, nome_exibicao, categoria_id) VALUES ($1, $2, $3)
           ON CONFLICT (nome_origem) DO UPDATE SET categoria_id = EXCLUDED.categoria_id, nome_exibicao = EXCLUDED.nome_exibicao, atualizado_em = now()
           RETURNING *`,
          [origem, texto(body.nome_origem, 200), categoria],
        )
        return res.json({ ok: true, item: r })
      }
      return res.status(405).end()
    }

    if (req.method === 'GET') {
      if (acao === 'lote') {
        const lote = await buscarLote(queryParam(req, 'id'))
        return res.json({ lote, gravados: await gravadosDoLote(lote.id) })
      }
      if (acao === 'ofx-conta') {
        const banco = texto(queryParam(req, 'banco'), 50)
        const conta = texto(queryParam(req, 'conta'), 80)
        if (!conta) return res.json({ contas: [] })
        const rows = await query(
          `SELECT conta_id, max(criado_em) AS ultima FROM importacoes_lancamentos
            WHERE ofx_conta = $1 AND ofx_banco IS NOT DISTINCT FROM $2 AND status <> 'desfeita'
            GROUP BY conta_id ORDER BY ultima DESC`, [conta, banco])
        return res.json({ contas: rows.map(r => r.conta_id) })
      }
      const lotes = await query(
        `SELECT l.*, (SELECT count(*)::int FROM lancamentos t WHERE t.importacao_id = l.id) AS gravados
           FROM importacoes_lancamentos l ORDER BY l.criado_em DESC LIMIT 20`)
      let visiveis = lotes
      if (!temTodosPerfis(user.perfis)) {
        const permitidas = new Set(await contasPermitidas(query, user.perfis))
        visiveis = lotes.filter(l => permitidas.has(l.conta_id))
      }
      return res.json({ lotes: visiveis.map(l => ({ ...l, total_entradas: Number(l.total_entradas), total_saidas: Number(l.total_saidas) })) })
    }

    if (req.method !== 'POST') return res.status(405).end()
    const body = (await parseBody(req)) || {}

    if (acao === 'concluir') {
      exigir(user, 'incluir')
      const lote = await buscarLote(body.id)
      if (lote.status === 'desfeita') throw new ErroHttp(409, 'Importação já desfeita')
      const gravados = await gravadosDoLote(lote.id)
      if (gravados < lote.qtd) return res.status(409).json({ error: `Ainda faltam lançamentos no banco (${gravados} de ${lote.qtd})`, gravados, qtd: lote.qtd })
      await query("UPDATE importacoes_lancamentos SET status = 'concluida', concluida_em = now() WHERE id = $1 AND status = 'em_andamento'", [lote.id])
      return res.json({ ok: true, gravados })
    }

    if (acao === 'desfazer') {
      exigir(user, 'excluir')
      const lote = await buscarLote(body.id)
      await exigirConta(user, lote.conta_id)
      if (lote.status === 'desfeita') return res.json({ ok: true, jaDesfeita: true })
      const restantes = await gravadosDoLote(lote.id)
      if (restantes > 0) return res.status(409).json({ error: `Ainda há ${restantes} lançamento(s) desta importação no banco`, restantes })
      await query("UPDATE importacoes_lancamentos SET status = 'desfeita', desfeita_em = now(), desfeita_por = $2 WHERE id = $1", [lote.id, user.username || user.id])
      return res.json({ ok: true })
    }

    if (acao) return res.status(400).json({ error: 'Ação inválida' })
    exigir(user, 'incluir')
    const id = texto(body.id, 100)
    if (!id) throw new ErroHttp(400, 'id é obrigatório')
    if (!FORMATOS.includes(body.formato)) throw new ErroHttp(400, 'Formato inválido')
    await exigirConta(user, body.conta_id)
    const qtd = Math.max(0, Math.floor(Number(body.qtd) || 0))
    const [lote] = await query(
      `INSERT INTO importacoes_lancamentos (id, conta_id, formato, arquivo, qtd, total_entradas, total_saidas, ofx_banco, ofx_conta, criado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO NOTHING RETURNING *`,
      [id, String(body.conta_id), body.formato, texto(body.arquivo, 200), qtd, numero(body.total_entradas), numero(body.total_saidas),
        texto(body.ofx_banco, 50), texto(body.ofx_conta, 80), user.username || user.id],
    )
    return res.json({ ok: true, lote: lote || await buscarLote(id) })
  } catch (err) {
    if (err instanceof ErroHttp) return res.status(err.status).json({ error: err.message })
    if (ehTabelaInexistente(err)) return res.status(503).json({ error: 'Importação ainda não instalada neste ambiente (migração pendente)' })
    console.error('[api/importacoes-lancamentos]', err.message)
    return res.status(500).json({ error: 'Falha ao processar a importação' })
  }
}

export default comAmbiente(handler)
