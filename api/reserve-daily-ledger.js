import { query, parseBody } from './_db.js'
import { requireAuth } from './_auth.js'
import { comAmbiente } from './_ambiente.js'
import { recalcularRazaoNoBanco } from './_viradaReservaServidor.js'

// Razão diário das funções de reserva — uma linha por função por dia.
//
//   GET  ?months=1            → meses distintos com dados: { months: ['2026-09', …] }
//   GET  ?before=YYYY-MM-DD   → ÚLTIMA data ESTRITAMENTE anterior a `before` + as linhas
//                               dela: { date, rows: [...] }. `date` é null se não houver.
//   GET  (sem parâmetros)     → resumo { min_date, max_date, days, rows }
//   POST { hoje?, desde? }    → recalcula no servidor (dados do banco) e grava por upsert
//
// Um único arquivo (e não três) porque é o padrão do repo: um endpoint por recurso, com
// switch por método/query — ver reserve-periods.js. Neon nunca é acessado do browser.

function qp(req, key) {
  if (req.query?.[key] != null) return req.query[key]
  try { return new URL(req.url, 'http://x').searchParams.get(key) } catch { return null }
}


async function handler(req, res) {
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

      // Sem parâmetros: resumo + as linhas dos últimos `days` dias COM registro (default 60,
      // teto 400 = a janela que o razão cobre). O corte é por dias distintos existentes, não
      // por data corrida: um intervalo sem gravação não come a janela.
      const [summary] = await query(
        `SELECT to_char(MIN(snapshot_date), 'YYYY-MM-DD') AS min_date,
                to_char(MAX(snapshot_date), 'YYYY-MM-DD') AS max_date,
                COUNT(DISTINCT snapshot_date)::int AS days,
                COUNT(*)::int AS total_rows
           FROM reserve_daily_ledger`,
      )
      const wanted = Math.min(Math.max(parseInt(qp(req, 'days'), 10) || 60, 1), 400)
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
          WHERE l.snapshot_date >= (
                  SELECT MIN(d) FROM (
                    SELECT DISTINCT snapshot_date AS d
                      FROM reserve_daily_ledger
                     ORDER BY d DESC
                     LIMIT $1
                  ) recentes)
          ORDER BY l.snapshot_date DESC, f.ordem, f.name`,
        [wanted],
      )
      return res.json({ ...(summary || { min_date: null, max_date: null, days: 0, total_rows: 0 }), rows })
    }

    if (req.method === 'POST') {
      // O razão é calculado AQUI, com os dados gravados no banco (fórmula única + saldo da conta pelos
      // lançamentos). Linhas mandadas pela tela (versão antiga do app) são ignoradas: o razão não pode
      // depender do aparelho nem do "Saldo Real" guardado no navegador.
      const body = await parseBody(req)
      const upserted = await recalcularRazaoNoBanco({ hoje: body?.hoje, desde: body?.desde || null })
      return res.json({ ok: true, upserted })
    }

    return res.status(405).end()
  } catch (err) {
    console.error('[api/reserve-daily-ledger]', err.message)
    res.status(500).json({ error: err.message })
  }
}

export default comAmbiente(handler)
