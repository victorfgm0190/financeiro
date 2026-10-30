import { requireAuth } from './_auth.js'
import { comAmbiente } from './_ambiente.js'
import { buscarPtax } from '../src/lib/ptax.js'

// GET /api/cotacao?data=YYYY-MM-DD → { data, venda } (PTAX venda do dólar; recua até 7 dias sem
// cotação). 404 = sem cotação nos 7 dias; 502 = Banco Central fora. O app então deixa o valor em R$
// para o usuário digitar. Cache por data na instância (a PTAX de um dia passado não muda).
const cache = new Map()
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/

async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'GET') return res.status(405).end()
  const data = String(req.query?.data || new URL(req.url, 'http://x').searchParams.get('data') || '')
  if (!DATA_ISO.test(data)) return res.status(400).json({ error: 'Data inválida (use YYYY-MM-DD).' })
  try {
    const r = await buscarPtax(data, { cache, fetchFn: (url) => fetch(url, { signal: AbortSignal.timeout(8000) }) })
    if (!r) return res.status(404).json({ error: 'Sem cotação do dólar nos 7 dias antes da compra.' })
    res.setHeader('Cache-Control', 'private, max-age=86400')
    return res.json(r)
  } catch (err) {
    console.error('[api/cotacao]', err.message)
    return res.status(502).json({ error: 'Não consegui a cotação no Banco Central.' })
  }
}

export default comAmbiente(handler)
