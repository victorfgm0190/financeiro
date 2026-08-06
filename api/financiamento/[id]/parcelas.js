import { query } from '../../_db.js'
import { requireAuth } from '../../_auth.js'
import {
  ensureBemSchema, getRouteId, round2, fail, SELECT_PARCELAS, serializarParcela,
} from '../../_bem.js'

// GET /api/financiamento/[id]/parcelas?page=1&limit=20 — lista paginada das parcelas.
// Sem query params devolve todas (limit padrão = total).

const MAX_LIMIT = 500

function readQuery(req, key) {
  if (req.query?.[key] != null) return req.query[key]
  try { return new URL(req.url, 'http://x').searchParams.get(key) } catch { return null }
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'GET') return fail(res, 405, 'Método não permitido')

  try {
    await ensureBemSchema()
    const financingId = getRouteId(req, 1)
    if (!financingId) return fail(res, 400, 'id do financiamento é obrigatório')

    const [fin] = await query(`SELECT id, num_parcelas FROM financing WHERE id = $1`, [financingId])
    if (!fin) return fail(res, 404, `financiamento ${financingId} não encontrado`)

    const [{ total }] = await query(
      `SELECT COUNT(*)::int AS total FROM financing_installments WHERE financing_id = $1`,
      [financingId],
    )

    const rawPage = Number(readQuery(req, 'page'))
    const rawLimit = Number(readQuery(req, 'limit'))
    const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1
    const limit = Number.isInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_LIMIT)
      : Math.max(total, 1)
    const offset = (page - 1) * limit

    const rows = await query(
      `${SELECT_PARCELAS} WHERE financing_id = $1 ORDER BY numero_parcela LIMIT $2 OFFSET $3`,
      [financingId, limit, offset],
    )

    return res.json({
      success: true,
      financing_id: financingId,
      total_parcelas: total,
      page,
      limit,
      total_pages: Math.max(1, Math.ceil(total / limit)),
      parcelas: rows.map(p => {
        const s = serializarParcela(p)
        return { ...s, desvio_juros: round2(s.desvio_juros) }
      }),
    })
  } catch (err) {
    console.error('[api/financiamento/[id]/parcelas]', err.message)
    return fail(res, 500, err.message)
  }
}
