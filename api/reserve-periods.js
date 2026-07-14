import { query, parseBody } from './_db.js'
import { requireAuth } from './_auth.js'

// Histórico de períodos de saldo inicial por função de reserva.
//   GET    → lista todos os períodos (todas as funções)
//   POST   → insere/atualiza { id, function_id, data_inicio, saldo_inicial }
//   DELETE → remove por id (?id=xxx)
// O período ativo de uma função é o de data_inicio mais recente (ver ReservasPanel).
// Neon nunca é acessado direto do browser — sempre via este endpoint.

// id do query string, com fallback via URL (robusto entre runtimes da Vercel).
function queryId(req) {
  if (req.query?.id) return req.query.id
  try { return new URL(req.url, 'http://x').searchParams.get('id') } catch { return null }
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  try {
    if (req.method === 'GET') {
      const rows = await query(
        `SELECT id, function_id,
                to_char(data_inicio, 'YYYY-MM-DD') AS data_inicio,
                saldo_inicial, created_at
           FROM reserve_periods
          ORDER BY function_id, data_inicio DESC`,
      )
      return res.json({ periods: rows })
    }

    if (req.method === 'POST') {
      const { id, function_id, data_inicio, saldo_inicial } = await parseBody(req)
      if (!id || !function_id || !data_inicio) {
        return res.status(400).json({ error: 'id, function_id e data_inicio são obrigatórios' })
      }
      await query(
        `INSERT INTO reserve_periods (id, function_id, data_inicio, saldo_inicial)
              VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET
              function_id   = EXCLUDED.function_id,
              data_inicio   = EXCLUDED.data_inicio,
              saldo_inicial = EXCLUDED.saldo_inicial`,
        [id, function_id, data_inicio, Number(saldo_inicial) || 0],
      )
      return res.json({ ok: true, id })
    }

    if (req.method === 'DELETE') {
      const id = queryId(req)
      if (!id) return res.status(400).json({ error: 'id é obrigatório' })
      await query(`DELETE FROM reserve_periods WHERE id = $1`, [id])
      return res.json({ ok: true, id })
    }

    return res.status(405).end()
  } catch (err) {
    console.error('[api/reserve-periods]', err.message)
    res.status(500).json({ error: err.message })
  }
}
