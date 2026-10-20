import { query } from './_db.js'
import { requireAuth } from './_auth.js'
import { comAmbiente } from './_ambiente.js'
import { queryParam } from './_plataforma.js'
import { exigirModulo } from './_contratos.js'

// ÍNDICES DE REAJUSTE (IPCA e IGP-M) da API pública SGS do Banco Central, com cache em indices_cache.
//   GET ?indice=IPCA|IGPM → { indice, competencia, valor_mensal, acumulado_12m, atualizado_em, fonte, aviso? }
// O cache é renovado no máximo a cada 12 h; sem o BC (fora do ar, lento), responde com o cache.

export const SERIES_SGS = { IPCA: 433, IGPM: 189 }
const VALIDADE_MS = 12 * 3600 * 1000
const TIMEOUT_MS = 8000

// [{ data: 'dd/MM/aaaa', valor: '0.44' }] → [{ competencia: 'AAAA-MM', valor_mensal }], por competência.
export function lerSerieSgs(json) {
  if (!Array.isArray(json)) return []
  const out = []
  for (const r of json) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(r?.data || ''))
    const v = Number(String(r?.valor ?? '').replace(',', '.'))
    if (m && Number.isFinite(v)) out.push({ competencia: `${m[3]}-${m[2]}`, valor_mensal: v })
  }
  return out.sort((a, b) => a.competencia.localeCompare(b.competencia))
}

// Acumulado de 12 meses (%, 4 casas) de cada competência que tem os 11 meses anteriores na série.
export function comAcumulado12m(serie) {
  return serie.map((s, i) => {
    if (i < 11) return { ...s, acumulado_12m: null }
    let f = 1
    for (let j = i - 11; j <= i; j++) f *= 1 + serie[j].valor_mensal / 100
    return { ...s, acumulado_12m: Math.round((f - 1) * 1e6) / 1e4 }
  })
}

async function buscarNoBc(indice, fetcher = fetch) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${SERIES_SGS[indice]}/dados/ultimos/24?formato=json`
    const r = await fetcher(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
    if (!r.ok) throw new Error(`BC respondeu ${r.status}`)
    return comAcumulado12m(lerSerieSgs(await r.json()))
  } finally {
    clearTimeout(t)
  }
}

const ULTIMO = `SELECT indice, competencia, valor_mensal::float8 AS valor_mensal, acumulado_12m::float8 AS acumulado_12m, atualizado_em
  FROM indices_cache WHERE indice = $1 AND acumulado_12m IS NOT NULL ORDER BY competencia DESC LIMIT 1`

export async function indiceAtual(indice, { fetcher = fetch, agora = Date.now() } = {}) {
  const [cache] = await query(ULTIMO, [indice])
  const [{ ultima } = {}] = await query('SELECT max(atualizado_em) AS ultima FROM indices_cache WHERE indice = $1', [indice])
  if (cache && ultima && agora - new Date(ultima).getTime() < VALIDADE_MS) return { ...cache, fonte: 'cache' }
  try {
    const serie = await buscarNoBc(indice, fetcher)
    for (const s of serie) {
      await query(
        `INSERT INTO indices_cache (indice, competencia, valor_mensal, acumulado_12m, atualizado_em) VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (indice, competencia) DO UPDATE SET valor_mensal = EXCLUDED.valor_mensal,
           acumulado_12m = COALESCE(EXCLUDED.acumulado_12m, indices_cache.acumulado_12m), atualizado_em = now()`,
        [indice, s.competencia, s.valor_mensal, s.acumulado_12m],
      )
    }
    const [novo] = await query(ULTIMO, [indice])
    return novo ? { ...novo, fonte: 'bcb' } : { indice, competencia: null, acumulado_12m: null, fonte: 'bcb', aviso: 'Série sem dados' }
  } catch (err) {
    console.warn('[api/indices] BC indisponível:', err.message)
    if (cache) return { ...cache, fonte: 'cache', aviso: 'Banco Central indisponível: valor do cache' }
    return { indice, competencia: null, acumulado_12m: null, fonte: null, aviso: 'Banco Central indisponível e sem cache' }
  }
}

async function handler(req, res) {
  if (!requireAuth(req, res)) return
  res.setHeader('Cache-Control', 'no-store')
  if (!exigirModulo(req, res, 'ver')) return
  if (req.method !== 'GET') return res.status(405).end()
  const indice = String(queryParam(req, 'indice') || '').toUpperCase()
  if (!SERIES_SGS[indice]) return res.status(400).json({ error: 'Índice inválido (IPCA ou IGPM)' })
  try {
    return res.json(await indiceAtual(indice))
  } catch (err) {
    console.error('[api/indices]', err.message)
    res.status(500).json({ error: err.message })
  }
}

export default comAmbiente(handler)
