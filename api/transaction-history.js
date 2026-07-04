import { query, parseBody } from './_db.js'
import { requireAuth } from './_auth.js'

// Histórico do fornecedor: últimas ocorrências de um lançamento cuja descrição CORRESPONDA
// (busca por similaridade — mesma ideia do front: normaliza e checa correspondência parcial).
// JOIN em categorias (nome), reservas_funcoes (grupo gerencial) e reserve_functions (função
// de reserva). Recebe { description, limit=5 }.

function normText(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim().replace(/\s+/g, ' ')
}
function tokensOf(s) {
  return normText(s).split(' ').filter(w => w.length >= 3)
}
// 1 = idêntico; 0.9 = um contém o outro; senão Jaccard de palavras (0..1).
function similarity(a, b) {
  const x = normText(a), y = normText(b)
  if (!x || !y) return 0
  if (x === y) return 1
  if (x.includes(y) || y.includes(x)) return 0.9
  const wx = x.split(' ').filter(Boolean), wy = y.split(' ').filter(Boolean)
  const sx = new Set(wx), sy = new Set(wy)
  let inter = 0
  for (const w of sx) if (sy.has(w)) inter++
  const union = new Set([...wx, ...wy]).size
  return union ? inter / union : 0
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'POST') return res.status(405).end()
  try {
    const { description, limit } = await parseBody(req)
    const desc = (description || '').trim()
    const lim = Math.min(Math.max(parseInt(limit, 10) || 5, 1), 20)
    if (!desc) return res.json({ transactions: [] })

    // Candidatos por ILIKE de qualquer token significativo (ou o texto todo se não houver).
    const patterns = (tokensOf(desc).length ? tokensOf(desc) : [desc]).map(p => `%${p}%`)
    const ors = patterns.map((_, i) => `l.description ILIKE $${i + 1}`).join(' OR ')

    const rows = await query(
      `SELECT l.id, l.date, l.amount, l.description, l.type,
              c.name  AS categoria_nome,
              g.name  AS grupo_nome,
              rf.name AS reserva_funcao_nome
       FROM lancamentos l
       LEFT JOIN categorias c        ON c.id  = l.category_id
       LEFT JOIN reservas_funcoes g  ON g.id  = l.grupo_gerencial
       LEFT JOIN reserve_functions rf ON rf.id = l.reserva_funcao_id
       WHERE ${ors}
       ORDER BY l.date DESC NULLS LAST
       LIMIT ${lim * 8}`,
      patterns,
    )

    // Refina pela similaridade (≥0,70) e mantém os mais recentes.
    const matched = rows.filter(r => similarity(desc, r.description) >= 0.7).slice(0, lim)
    res.json({ transactions: matched })
  } catch (err) {
    console.error('[api/transaction-history]', err.message)
    res.status(500).json({ error: err.message })
  }
}
