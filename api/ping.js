import { query } from './_db.js'
import { requireAuth } from './_auth.js'
import { comAmbiente } from './_ambiente.js'
import { responderErro } from './_erro.js'

async function handler(req, res) {
  if (!requireAuth(req, res)) return
  try {
    await query('SELECT 1')
    res.json({ ok: true })
  } catch (err) {
    responderErro(res, err, 'api/ping', { extra: { ok: false } })
  }
}

export default comAmbiente(handler)
