import { query, parseBody, withTransaction } from './_db.js'
import { requireAuth } from './_auth.js'
import { ensureTiposDocumentoSchema, SQL_TIPO_EM_MASSA_AGENDAMENTOS } from './_tiposDocumento.js'
import { ensureHistoricoSchema, inserirHistorico } from './_historico.js'
import { comAmbiente } from './_ambiente.js'
import { exigirLinhasPermitidas } from './_permissoesApi.js'

// Escritas em massa de agendamentos que não passam pelo /api/sync.
//   PUT { ids: [...], tipo_documento_id, lote_id?, motivo? }
//       → define (ou remove, com null) o tipo de documento de todos os ids e grava o histórico
//         (1 linha por agendamento que mudou, mesmo lote_id) — tudo numa única transação.
// O app espelha a mudança no estado logo depois; o sync seguinte manda o mesmo valor.
export async function aplicarTipoEmMassa(q, { ids, tipoId, loteId, motivo }) {
  if (tipoId) {
    const [t] = await q('SELECT id FROM tipos_documento WHERE id = $1', [tipoId])
    if (!t) throw Object.assign(new Error('Tipo de documento não encontrado'), { status: 400 })
  }
  const rows = await q(SQL_TIPO_EM_MASSA_AGENDAMENTOS, [ids, tipoId])
  const mudaram = rows.filter(r => (r.antes || null) !== (tipoId || null))
  await inserirHistorico(q, mudaram.map(r => ({
    entidade: 'agendamento', entidade_id: r.id, ocorrencia_data: null, serie_key: null,
    lote_id: loteId, escopo: 'parcela', campo: 'tipoDocumentoId',
    valor_anterior: r.antes || null, valor_novo: tipoId || null, motivo: motivo || null,
  })))
  return { updated: rows.length, ids: rows.map(r => r.id), historico: mudaram.length }
}

async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'PUT') return res.status(405).end()
  try {
    const body = await parseBody(req)
    const ids = Array.isArray(body?.ids) ? [...new Set(body.ids.filter(Boolean).map(String))] : []
    if (ids.length === 0) return res.status(400).json({ error: 'ids vazio' })
    if (!('tipo_documento_id' in (body || {}))) return res.status(400).json({ error: 'tipo_documento_id é obrigatório (use null para remover)' })
    const tipoId = body.tipo_documento_id ? String(body.tipo_documento_id) : null
    const loteId = body.lote_id ? String(body.lote_id) : `lote_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const motivo = body.motivo ? String(body.motivo).trim().slice(0, 500) || null : null

    // Perfis permitidos: agendamento de conta fora deles → 403, nada é alterado.
    await exigirLinhasPermitidas(query, req.user, 'agendamentos', ids)
    await ensureTiposDocumentoSchema()
    await ensureHistoricoSchema()
    const r = await withTransaction(q => aplicarTipoEmMassa(q, { ids, tipoId, loteId, motivo }))
    res.json({ ok: true, ...r, lote_id: loteId })
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    console.error('[api/agendamentos]', err.message)
    res.status(err.status || 500).json({ error: err.message })
  }
}

export default comAmbiente(handler)
