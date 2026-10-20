import { query, parseBody } from './_db.js'
import { requireAuth } from './_auth.js'
import { comAmbiente } from './_ambiente.js'
import { queryParam } from './_plataforma.js'
import { normalizarEvento, exigirModulo, contratoVisivel, inserirEvento, comNumeros } from './_contratos.js'

// LINHA DO TEMPO DO CONTRATO (reajuste, vínculo, aditivo, renovação, rescisão, edição de parcela…).
//   GET ?contrato_id=x                         → { eventos } (mais recente primeiro)
//   POST { contrato_id, tipo, data_evento, ... } → registra um evento

async function handler(req, res) {
  if (!requireAuth(req, res)) return
  res.setHeader('Cache-Control', 'no-store')
  if (!exigirModulo(req, res, 'ver')) return
  try {
    if (req.method === 'GET') {
      const id = queryParam(req, 'contrato_id')
      if (!(await contratoVisivel(query, id, req.user))) return res.status(404).json({ error: 'Contrato não encontrado' })
      const eventos = await query('SELECT * FROM contrato_eventos WHERE contrato_id = $1 ORDER BY data_evento DESC, created_at DESC', [id])
      return res.json({ eventos: eventos.map(comNumeros) })
    }
    if (req.method === 'POST') {
      const body = await parseBody(req)
      const c = await contratoVisivel(query, body?.contrato_id, req.user)
      if (!c) return res.status(404).json({ error: 'Contrato não encontrado' })
      const { erro, evento } = normalizarEvento(body)
      if (erro) return res.status(400).json({ error: erro })
      const row = await inserirEvento(query, c.id, evento)
      return res.json({ ok: true, evento: comNumeros(row) })
    }
    return res.status(405).end()
  } catch (err) {
    console.error('[api/contrato-eventos]', err.message)
    res.status(500).json({ error: err.message })
  }
}

export default comAmbiente(handler)
