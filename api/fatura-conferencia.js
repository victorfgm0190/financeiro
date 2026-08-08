import { query, parseBody } from './_db.js'
import { requireAuth } from './_auth.js'

// Conferência pós-importação de uma fatura de cartão: soma o que REALMENTE está gravado no
// Neon para (cartão, fatura) e devolve despesas, estornos, total e quantidades. O frontend
// compara com o total lido do arquivo e acusa qualquer diferença acima de R$ 0,01 — sem isto
// um lançamento que se perde no caminho (estorno filtrado como duplicata, colisão de parcela,
// sync que falhou) some em silêncio e só aparece na conferência manual do extrato.
//
// A fatura é identificada pelos DOIS formatos que convivem na tabela: fatura_month_year
// (YYYY-MM, o campo novo) e fatura_ref (MM/YYYY, o legado, ainda único em linhas antigas).
// Lançamentos espelho ficam de fora: vivem na conta-espelho e nunca compõem o valor da fatura.
export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'POST') return res.status(405).end()
  try {
    const { accountId, faturaMonthYear } = await parseBody(req)
    if (!accountId || !/^\d{4}-\d{2}$/.test(String(faturaMonthYear || ''))) {
      return res.status(400).json({ error: 'accountId e faturaMonthYear (YYYY-MM) são obrigatórios.' })
    }
    const [y, m] = String(faturaMonthYear).split('-')
    const faturaRef = `${m}/${y}`

    const rows = await query(
      `SELECT type,
              COUNT(*)::int AS qtd,
              COALESCE(SUM(amount), 0)::float8 AS total
         FROM lancamentos
        WHERE account_id = $1
          AND type IN ('expense', 'income')
          AND COALESCE(is_espelho, false) = false
          AND (fatura_month_year = $2
               OR (fatura_month_year IS NULL AND fatura_ref = $3))
        GROUP BY type`,
      [accountId, faturaMonthYear, faturaRef],
    )

    const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100
    const of = (t) => rows.find(r => r.type === t) || { qtd: 0, total: 0 }
    const despesas = of('expense')
    const estornos = of('income')

    res.json({
      accountId,
      faturaMonthYear,
      despesas: round2(despesas.total),
      qtdDespesas: despesas.qtd,
      estornos: round2(estornos.total),
      qtdEstornos: estornos.qtd,
      total: round2(despesas.total - estornos.total),
      qtd: despesas.qtd + estornos.qtd,
    })
  } catch (err) {
    console.error('[api/fatura-conferencia]', err.message)
    res.status(500).json({ error: err.message })
  }
}
