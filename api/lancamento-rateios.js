import { query, parseBody } from './_db.js'

async function ensureTable() {
  await query(`CREATE TABLE IF NOT EXISTS lancamento_rateios (
    id TEXT PRIMARY KEY,
    lancamento_id TEXT,
    categoria_id TEXT,
    valor NUMERIC DEFAULT 0,
    descricao TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  )`)
  await query(`CREATE INDEX IF NOT EXISTS idx_rateios_lancamento ON lancamento_rateios (lancamento_id)`)
}

export default async function handler(req, res) {
  try {
    await ensureTable()

    if (req.method === 'GET') {
      const { lancamento_id } = req.query || {}
      if (!lancamento_id) return res.json([])
      const rows = await query('SELECT * FROM lancamento_rateios WHERE lancamento_id = $1 ORDER BY created_at', [lancamento_id])
      return res.json(rows)
    }

    if (req.method === 'POST') {
      const body = await parseBody(req)
      const { action, lancamentoId } = body
      if (!lancamentoId) return res.status(400).json({ error: 'lancamentoId obrigatório' })

      // Remove todos os rateios do lançamento.
      if (action === 'delete') {
        await query('DELETE FROM lancamento_rateios WHERE lancamento_id = $1', [lancamentoId])
        return res.json({ ok: true })
      }

      // 'save' (padrão): substitui todos os rateios do lançamento pela lista enviada.
      const rateios = Array.isArray(body.rateios) ? body.rateios : []
      await query('DELETE FROM lancamento_rateios WHERE lancamento_id = $1', [lancamentoId])
      for (const r of rateios) {
        await query(
          'INSERT INTO lancamento_rateios (id, lancamento_id, categoria_id, valor, descricao) VALUES ($1,$2,$3,$4,$5)',
          [r.id, lancamentoId, r.categoriaId ?? r.categoria_id ?? null, Number(r.valor) || 0, r.descricao || null],
        )
      }
      return res.json({ ok: true, count: rateios.length })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[api/lancamento-rateios]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
