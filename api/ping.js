import { query } from './_db.js'
import { requireAuth } from './_auth.js'

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  try {
    await query('SELECT 1')
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}
