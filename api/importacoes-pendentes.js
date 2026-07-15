import { query, upsertRows, parseBody } from './_db.js'
import { requireAuth } from './_auth.js'

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
    fonte TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  )`)
  await query(`ALTER TABLE importacoes_pendentes ADD COLUMN IF NOT EXISTS fonte TEXT`)
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
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

      // Confirma um conjunto de ids: grava em lancamentos (origin='importacao_dindin') e marca
      // a linha de staging como 'confirmado'. Só confirma linhas com conta resolvida.
      if (action === 'confirm') {
        const { ids } = body
        if (!Array.isArray(ids) || ids.length === 0) return res.json({ ok: true, inserted: 0 })
        const rows = await query(
          `SELECT * FROM importacoes_pendentes WHERE id = ANY($1) AND status <> 'confirmado'`, [ids]
        )
        const typeMap = { receita: 'income', despesa: 'expense', transferencia: 'transfer' }
        const lanc = []
        const okIds = []
        for (const r of rows) {
          const type = typeMap[r.tipo] || 'expense'
          // receita entra na conta destino; despesa sai da origem; transferência usa ambas.
          const accountId = type === 'income' ? (r.conta_destino_finup || null) : (r.conta_origem_finup || null)
          const toAccountId = type === 'transfer' ? (r.conta_destino_finup || null) : null
          if (!accountId && !toAccountId) continue // sem conta resolvida → não confirma
          lanc.push({
            id: 'tx_dindin_' + r.id,
            type,
            account_id: accountId,
            to_account_id: toAccountId,
            from_account_id: null,
            amount: Number(r.valor) || 0,
            date: r.data,
            description: r.descricao,
            category_id: r.categoria_id || null,
            origin: 'importacao_dindin',
          })
          okIds.push(r.id)
        }
        if (lanc.length > 0) {
          await upsertRows('lancamentos', lanc)
          await query(`UPDATE importacoes_pendentes SET status='confirmado' WHERE id = ANY($1)`, [okIds])
        }
        return res.json({ ok: true, inserted: lanc.length, skipped: rows.length - lanc.length })
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
