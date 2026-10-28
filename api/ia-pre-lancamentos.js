import { query, parseBody } from './_db.js'
import { requireAuth } from './_auth.js'
import { comAmbiente } from './_ambiente.js'
import { contextoPerfis } from './_permissoesApi.js'
import { ensureIaSchema } from './_ia.js'

// PRÉ-LANÇAMENTOS do Assistente IA: prévia fechada sem confirmar. Ficam só nesta tabela — não entram
// em saldo, fatura, grupos gerenciais nem relatórios (o /api/load não lê ia_pre_lancamentos).
//   GET                                   → pendentes (só os das contas dos perfis permitidos)
//   POST { tipo, payload, texto_original } → cria (status 'pendente'); tipo lancamento | agendamento | baixa
//   PUT  { id, status, lancamento_id? }    → 'efetivado' (com o id gravado pelo app) ou 'descartado'

const COLS = 'id, tipo, payload, texto_original, status, lancamento_id, created_at, updated_at'
const MAX_PAYLOAD = 20_000
const TIPOS = ['lancamento', 'agendamento', 'baixa']
// Conta do pré-lançamento (recorte por perfis): a sugerida ou, na baixa, a do agendamento escolhido.
const contaDo = (payload) => payload?.conta_id || payload?.candidato?.conta_id || null

async function handler(req, res) {
  if (!requireAuth(req, res)) return
  res.setHeader('Cache-Control', 'no-store')
  try {
    await ensureIaSchema()

    if (req.method === 'GET') {
      const rows = await query(`SELECT ${COLS} FROM ia_pre_lancamentos WHERE status = 'pendente' ORDER BY created_at DESC LIMIT 200`)
      const ctx = await contextoPerfis(query, req.user)
      const visiveis = ctx ? rows.filter(r => !contaDo(r.payload) || ctx.contas.has(contaDo(r.payload))) : rows
      return res.json({ itens: visiveis })
    }

    if (req.method === 'POST') {
      const body = await parseBody(req)
      const tipo = TIPOS.includes(body?.tipo) ? body.tipo : null
      if (!tipo) return res.status(400).json({ error: "tipo deve ser 'lancamento', 'agendamento' ou 'baixa'" })
      const payload = body?.payload && typeof body.payload === 'object' ? body.payload : null
      if (!payload) return res.status(400).json({ error: 'payload é obrigatório' })
      const json = JSON.stringify(payload)
      if (json.length > MAX_PAYLOAD) return res.status(413).json({ error: 'payload muito grande' })
      const texto = typeof body?.texto_original === 'string' ? body.texto_original.slice(0, 1000) : null
      const [row] = await query(
        `INSERT INTO ia_pre_lancamentos (tipo, payload, texto_original) VALUES ($1, $2::jsonb, $3) RETURNING ${COLS}`,
        [tipo, json, texto])
      return res.json({ ok: true, item: row })
    }

    if (req.method === 'PUT') {
      const body = await parseBody(req)
      const id = String(body?.id || '').trim()
      const status = ['efetivado', 'descartado'].includes(body?.status) ? body.status : null
      if (!id || !status) return res.status(400).json({ error: "id e status ('efetivado' | 'descartado') são obrigatórios" })
      // Conferência antes do UPDATE: só um pré-lançamento ainda pendente muda de status.
      const [atual] = await query('SELECT id, status, payload FROM ia_pre_lancamentos WHERE id = $1', [id])
      if (!atual) return res.status(404).json({ error: 'Pré-lançamento não encontrado' })
      if (atual.status !== 'pendente') return res.status(409).json({ error: 'Pré-lançamento já foi revisado' })
      const ctx = await contextoPerfis(query, req.user)
      if (ctx && contaDo(atual.payload) && !ctx.contas.has(contaDo(atual.payload))) return res.status(403).json({ error: 'Sem permissão para esta conta' })
      const lancId = status === 'efetivado' && body?.lancamento_id ? String(body.lancamento_id).slice(0, 100) : null
      const [row] = await query(
        `UPDATE ia_pre_lancamentos SET status = $2, lancamento_id = $3, updated_at = now()
          WHERE id = $1 AND status = 'pendente' RETURNING ${COLS}`, [id, status, lancId])
      return res.json({ ok: true, item: row || null })
    }

    return res.status(405).end()
  } catch (err) {
    console.error('[api/ia-pre-lancamentos]', err.message)
    res.status(500).json({ error: err.message })
  }
}

export default comAmbiente(handler)
