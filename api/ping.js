import { query } from './_db.js'

export default async function handler(req, res) {
  try {
    await query('SELECT 1')
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
}
