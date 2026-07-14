import { query, parseBody } from './_db.js'
import { requireAuth } from './_auth.js'

// Histórico de ajustes por função de reserva (data + valor ± + observação).
//   GET    → lista todos os ajustes (todas as funções)
//   POST   → insere/atualiza { id, function_id, data, valor, observacao }
//   PUT    → atualiza { id, valor, observacao }
//   DELETE → remove por id (?id=xxx)
// Substitui o ajuste_override JSONB (mantido como fallback legado no ReservasPanel).
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
                to_char(data, 'YYYY-MM-DD') AS data,
                valor, observacao, created_at
           FROM reserve_adjustments
          ORDER BY function_id, data DESC`,
      )
      return res.json({ adjustments: rows })
    }

    if (req.method === 'POST') {
      const { id, function_id, data, valor, observacao } = await parseBody(req)
      if (!id || !function_id || !data) {
        return res.status(400).json({ error: 'id, function_id e data são obrigatórios' })
      }
      await query(
        `INSERT INTO reserve_adjustments (id, function_id, data, valor, observacao)
              VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
              function_id = EXCLUDED.function_id,
              data        = EXCLUDED.data,
              valor       = EXCLUDED.valor,
              observacao  = EXCLUDED.observacao`,
        [id, function_id, data, Number(valor) || 0, observacao ?? null],
      )
      return res.json({ ok: true, id })
    }

    if (req.method === 'PUT') {
      const { id, valor, observacao } = await parseBody(req)
      if (!id) return res.status(400).json({ error: 'id é obrigatório' })
      await query(
        `UPDATE reserve_adjustments SET valor = $2, observacao = $3 WHERE id = $1`,
        [id, Number(valor) || 0, observacao ?? null],
      )
      return res.json({ ok: true, id })
    }

    if (req.method === 'DELETE') {
      const id = queryId(req)
      if (!id) return res.status(400).json({ error: 'id é obrigatório' })
      await query(`DELETE FROM reserve_adjustments WHERE id = $1`, [id])
      return res.json({ ok: true, id })
    }

    return res.status(405).end()
  } catch (err) {
    console.error('[api/reserve-adjustments]', err.message)
    res.status(500).json({ error: err.message })
  }
}
