import { query, parseBody } from './_db.js'
import { requireAuth } from './_auth.js'

// Snapshots das viradas de saldo (histórico de períodos fechados por função).
//   GET  → lista todos os snapshots (data_fim DESC)
//   POST → insere um lote { snapshots: [...] } com ON CONFLICT (id) DO NOTHING
// Neon nunca é acessado direto do browser — sempre via este endpoint.

const COLS = [
  'id', 'periodo_id', 'data_inicio', 'data_fim', 'function_id', 'function_name',
  'saldo_inicial', 'entradas', 'saidas', 'ajuste', 'saldo', 'saldo_atualizado',
]

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  try {
    if (req.method === 'GET') {
      const rows = await query(
        `SELECT id, periodo_id,
                to_char(data_inicio, 'YYYY-MM-DD') AS data_inicio,
                to_char(data_fim,    'YYYY-MM-DD') AS data_fim,
                function_id, function_name,
                saldo_inicial, entradas, saidas, ajuste, saldo, saldo_atualizado, created_at
           FROM reserve_period_snapshots
          ORDER BY data_fim DESC, function_name`,
      )
      return res.json({ snapshots: rows })
    }

    if (req.method === 'POST') {
      const { snapshots } = await parseBody(req)
      if (!Array.isArray(snapshots) || snapshots.length === 0) {
        return res.json({ ok: true, inserted: 0 })
      }
      // Um único INSERT com múltiplas linhas: monta os placeholders ($1..$N) por linha.
      const values = []
      const params = []
      let i = 1
      for (const s of snapshots) {
        if (!s?.id || !s?.function_id || !s?.data_inicio || !s?.data_fim) continue
        values.push(`(${COLS.map(() => `$${i++}`).join(', ')})`)
        params.push(
          s.id, s.periodo_id ?? 'legacy', s.data_inicio, s.data_fim, s.function_id, s.function_name ?? '',
          Number(s.saldo_inicial) || 0, Number(s.entradas) || 0, Number(s.saidas) || 0,
          Number(s.ajuste) || 0, Number(s.saldo) || 0, Number(s.saldo_atualizado) || 0,
        )
      }
      if (values.length === 0) return res.json({ ok: true, inserted: 0 })
      await query(
        `INSERT INTO reserve_period_snapshots (${COLS.join(', ')})
              VALUES ${values.join(', ')}
         ON CONFLICT (id) DO NOTHING`,
        params,
      )
      return res.json({ ok: true, inserted: values.length })
    }

    return res.status(405).end()
  } catch (err) {
    console.error('[api/reserve-snapshots]', err.message)
    res.status(500).json({ error: err.message })
  }
}
