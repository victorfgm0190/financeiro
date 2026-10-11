import { parseBody, withTransaction } from './_db.js'
import { requireAuth } from './_auth.js'
import { ensureTiposDocumentoSchema, SQL_TIPO_EM_MASSA_AGENDAMENTOS } from './_tiposDocumento.js'

// Escritas em massa de agendamentos que não passam pelo /api/sync.
//   PUT { ids: [...], tipo_documento_id }  → define (ou remove, com null) o tipo de documento de
//                                            todos os ids numa única transação.
// O app espelha a mudança no estado logo depois; o sync seguinte manda o mesmo valor.
export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'PUT') return res.status(405).end()
  try {
    const body = await parseBody(req)
    const ids = Array.isArray(body?.ids) ? [...new Set(body.ids.filter(Boolean).map(String))] : []
    if (ids.length === 0) return res.status(400).json({ error: 'ids vazio' })
    if (!('tipo_documento_id' in (body || {}))) return res.status(400).json({ error: 'tipo_documento_id é obrigatório (use null para remover)' })
    const tipoId = body.tipo_documento_id ? String(body.tipo_documento_id) : null

    await ensureTiposDocumentoSchema()
    const rows = await withTransaction(async (q) => {
      if (tipoId) {
        const [t] = await q('SELECT id FROM tipos_documento WHERE id = $1', [tipoId])
        if (!t) throw Object.assign(new Error('Tipo de documento não encontrado'), { status: 400 })
      }
      return q(SQL_TIPO_EM_MASSA_AGENDAMENTOS, [ids, tipoId])
    })
    res.json({ ok: true, updated: rows.length, ids: rows.map(r => r.id) })
  } catch (err) {
    console.error('[api/agendamentos]', err.message)
    res.status(err.status || 500).json({ error: err.message })
  }
}
