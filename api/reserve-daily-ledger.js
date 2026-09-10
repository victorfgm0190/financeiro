import { query, parseBody } from './_db.js'
import { requireAuth } from './_auth.js'

// Razão diário das funções de reserva — uma linha por função por dia.
//
//   GET  ?months=1            → meses distintos com dados: { months: ['2026-09', …] }
//   GET  ?before=YYYY-MM-DD   → ÚLTIMA data ESTRITAMENTE anterior a `before` + as linhas
//                               dela: { date, rows: [...] }. `date` é null se não houver.
//   GET  (sem parâmetros)     → resumo { min_date, max_date, days, rows }
//   POST { rows: [...] }      → upsert em lote por (function_id, snapshot_date)
//
// Um único arquivo (e não três) porque é o padrão do repo: um endpoint por recurso, com
// switch por método/query — ver reserve-periods.js. Neon nunca é acessado do browser.

const COLS = [
  'function_id', 'snapshot_date', 'account_id', 'periodo_id',
  'entrada_dia', 'saida_dia', 'ajuste_dia',
  'saldo_acumulado', 'saldo_atualizado',
  'saldo_real_conta', 'fator_rateio', 'divergencia', 'divergencia_pct',
]

// Postgres limita a 65.535 bind-params por comando; 13 colunas × 500 linhas = 6.500.
const CHUNK = 500

function qp(req, key) {
  if (req.query?.[key] != null) return req.query[key]
  try { return new URL(req.url, 'http://x').searchParams.get(key) } catch { return null }
}

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v))
const num0 = (v) => Number(v) || 0

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  try {
    if (req.method === 'GET') {
      if (qp(req, 'months')) {
        const rows = await query(
          `SELECT DISTINCT to_char(snapshot_date, 'YYYY-MM') AS month
             FROM reserve_daily_ledger
            ORDER BY month DESC`,
        )
        return res.json({ months: rows.map(r => r.month) })
      }

      const before = qp(req, 'before')
      if (before) {
        // ESTRITAMENTE anterior (<), não <=: a virada com corte em 14/08 tem de usar o
        // fechamento de 13/08. Com <= ela pegaria o próprio 14/08 quando esse dia existisse.
        const [maxRow] = await query(
          `SELECT to_char(MAX(snapshot_date), 'YYYY-MM-DD') AS date
             FROM reserve_daily_ledger
            WHERE snapshot_date < $1`,
          [before],
        )
        const date = maxRow?.date || null
        if (!date) return res.json({ date: null, rows: [] })
        const rows = await query(
          `SELECT l.function_id,
                  to_char(l.snapshot_date, 'YYYY-MM-DD') AS snapshot_date,
                  l.account_id, l.periodo_id,
                  l.entrada_dia, l.saida_dia, l.ajuste_dia,
                  l.saldo_acumulado, l.saldo_atualizado,
                  l.saldo_real_conta, l.fator_rateio, l.divergencia, l.divergencia_pct,
                  f.name AS function_name
             FROM reserve_daily_ledger l
             LEFT JOIN reserve_functions f ON f.id = l.function_id
            WHERE l.snapshot_date = $1
            ORDER BY f.ordem, f.name`,
          [date],
        )
        return res.json({ date, rows })
      }

      const [summary] = await query(
        `SELECT to_char(MIN(snapshot_date), 'YYYY-MM-DD') AS min_date,
                to_char(MAX(snapshot_date), 'YYYY-MM-DD') AS max_date,
                COUNT(DISTINCT snapshot_date)::int AS days,
                COUNT(*)::int AS rows
           FROM reserve_daily_ledger`,
      )
      return res.json(summary || { min_date: null, max_date: null, days: 0, rows: 0 })
    }

    if (req.method === 'POST') {
      const { rows } = await parseBody(req)
      if (!Array.isArray(rows) || rows.length === 0) return res.json({ ok: true, upserted: 0 })

      const valid = rows.filter(r => r?.function_id && r?.snapshot_date)
      let upserted = 0
      for (let off = 0; off < valid.length; off += CHUNK) {
        const chunk = valid.slice(off, off + CHUNK)
        let i = 1
        const values = chunk.map(() => `(${COLS.map(() => `$${i++}`).join(', ')})`).join(', ')
        const params = chunk.flatMap(r => [
          r.function_id, r.snapshot_date, r.account_id ?? null, r.periodo_id ?? null,
          num0(r.entrada_dia), num0(r.saida_dia), num0(r.ajuste_dia),
          num0(r.saldo_acumulado), num0(r.saldo_atualizado),
          num(r.saldo_real_conta), num(r.fator_rateio), num(r.divergencia), num(r.divergencia_pct),
        ])
        const updates = COLS
          .filter(c => c !== 'function_id' && c !== 'snapshot_date')
          .map(c => `${c} = EXCLUDED.${c}`)
          .join(', ')
        const { length } = chunk
        await query(
          `INSERT INTO reserve_daily_ledger (${COLS.join(', ')})
                VALUES ${values}
           ON CONFLICT (function_id, snapshot_date) DO UPDATE SET ${updates}, updated_at = now()`,
          params,
        )
        upserted += length
      }
      return res.json({ ok: true, upserted })
    }

    return res.status(405).end()
  } catch (err) {
    console.error('[api/reserve-daily-ledger]', err.message)
    res.status(500).json({ error: err.message })
  }
}
