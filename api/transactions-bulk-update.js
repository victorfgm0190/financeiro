import { query, parseBody } from './_db.js'
import { requireAuth } from './_auth.js'

// Atualização em lote de lançamentos: altera date e/ou category_id de vários
// registros (id = ANY) numa única operação. Campos ausentes não são tocados.
export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'POST') return res.status(405).end()
  try {
    const { ids, date, categoryId } = await parseBody(req)
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids vazio' })
    }

    const sets = []
    const params = [ids]
    let i = 2
    if (date) { sets.push(`date = $${i}`); params.push(date); i++ }
    if (categoryId !== undefined && categoryId !== null) {
      sets.push(`category_id = $${i}`); params.push(categoryId || null); i++
    }
    if (sets.length === 0) return res.json({ ok: true, updated: 0 })

    const rows = await query(
      `UPDATE lancamentos SET ${sets.join(', ')} WHERE id = ANY($1) RETURNING id`,
      params,
    )
    res.json({ ok: true, updated: rows.length })
  } catch (err) {
    console.error('[api/transactions-bulk-update]', err.message)
    res.status(500).json({ error: err.message })
  }
}
