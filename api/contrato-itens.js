import { query, parseBody, withTransaction } from './_db.js'
import { requireAuth } from './_auth.js'
import { comAmbiente } from './_ambiente.js'
import { queryParam } from './_plataforma.js'
import { normalizarItem, exigirModulo, contratoVisivel, substituirItens, comNumeros } from './_contratos.js'

// ITENS PREVISTOS DO CONTRATO (IPTU, seguro, itens fixos do condomínio, com o responsável).
//   GET ?contrato_id=x                → { itens }
//   PUT { contrato_id, itens: [...] } → substitui a lista inteira (transação)

async function handler(req, res) {
  if (!requireAuth(req, res)) return
  res.setHeader('Cache-Control', 'no-store')
  if (!exigirModulo(req, res, 'ver')) return
  try {
    if (req.method === 'GET') {
      const id = queryParam(req, 'contrato_id')
      if (!(await contratoVisivel(query, id, req.user))) return res.status(404).json({ error: 'Contrato não encontrado' })
      const itens = await query('SELECT * FROM contrato_itens WHERE contrato_id = $1 ORDER BY grupo, descricao', [id])
      return res.json({ itens: itens.map(comNumeros) })
    }
    if (req.method === 'PUT') {
      const body = await parseBody(req)
      const c = await contratoVisivel(query, body?.contrato_id, req.user)
      if (!c) return res.status(404).json({ error: 'Contrato não encontrado' })
      const itens = []
      for (const it of Array.isArray(body?.itens) ? body.itens.slice(0, 50) : []) {
        const r = normalizarItem(it)
        if (r.erro) return res.status(400).json({ error: r.erro })
        itens.push(r.item)
      }
      const rows = await withTransaction((q) => substituirItens(q, c.id, itens))
      return res.json({ ok: true, itens: rows.map(comNumeros) })
    }
    return res.status(405).end()
  } catch (err) {
    console.error('[api/contrato-itens]', err.message)
    res.status(500).json({ error: err.message })
  }
}

export default comAmbiente(handler)
