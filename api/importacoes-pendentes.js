import { query, upsertRows, parseBody } from './_db.js'

// Garante a tabela de staging (idempotente) — não depende da ordem de /api/load.
async function ensureTable() {
  await query(`CREATE TABLE IF NOT EXISTS importacoes_pendentes (
    id TEXT PRIMARY KEY,
    origem TEXT NOT NULL DEFAULT 'DINDIN',
    data TEXT,
    descricao TEXT,
    valor NUMERIC DEFAULT 0,
    tipo TEXT,
    conta_origem_dindin TEXT,
    conta_destino_dindin TEXT,
    conta_origem_finup TEXT,
    conta_destino_finup TEXT,
    categoria_id TEXT,
    status TEXT NOT NULL DEFAULT 'pendente',
    created_at TIMESTAMPTZ DEFAULT now()
  )`)
}

export default async function handler(req, res) {
  try {
    await ensureTable()

    if (req.method === 'GET') {
      const { status, origem } = req.query || {}
      const where = []
      const params = []
      if (origem) { params.push(origem); where.push(`origem = $${params.length}`) }
      if (status) { params.push(status); where.push(`status = $${params.length}`) }
      const sql = `SELECT * FROM importacoes_pendentes
                   ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                   ORDER BY data, created_at`
      const rows = await query(sql, params)
      return res.json(rows)
    }

    if (req.method === 'POST') {
      const body = await parseBody(req)
      const { action } = body

      // Insere/atualiza linhas de staging (rows já em snake_case, com id).
      if (action === 'insert') {
        const rows = body.rows || []
        await upsertRows('importacoes_pendentes', rows)
        return res.json({ ok: true, count: rows.length })
      }

      // Atualiza status (confirmado/ignorado/pendente) de um conjunto de ids.
      if (action === 'updateStatus') {
        const { ids, status } = body
        if (Array.isArray(ids) && ids.length > 0 && status) {
          await query(`UPDATE importacoes_pendentes SET status = $1 WHERE id = ANY($2)`, [status, ids])
        }
        return res.json({ ok: true })
      }

      // Remove staging (de uma origem, ou tudo) — útil para reimportar do zero.
      if (action === 'clear') {
        const { origem, status } = body
        if (origem && status) await query(`DELETE FROM importacoes_pendentes WHERE origem = $1 AND status = $2`, [origem, status])
        else if (origem) await query(`DELETE FROM importacoes_pendentes WHERE origem = $1`, [origem])
        else await query(`DELETE FROM importacoes_pendentes`)
        return res.json({ ok: true })
      }

      return res.status(400).json({ error: 'Ação desconhecida: ' + action })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('[api/importacoes-pendentes]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
