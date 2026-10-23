import { query, parseBody, withTransaction } from './_db.js'
import { requireAuth } from './_auth.js'
import { ensureHistoricoSchema, inserirHistorico } from './_historico.js'
import { comAmbiente } from './_ambiente.js'
import { exigirLinhasPermitidas } from './_permissoesApi.js'

// Atualização em lote de lançamentos: altera date e/ou category_id de vários
// registros (id = ANY) numa única transação, junto com o histórico de alterações
// (1 linha por campo e por lançamento que mudou, mesmo lote_id). Campos ausentes não são tocados.
export async function aplicarBulkLancamentos(q, { ids, date, categoryId, loteId, motivo }) {
  const sets = []
  const params = [ids]
  let i = 2
  if (date) { sets.push(`date = $${i}`); params.push(date); i++ }
  if (categoryId !== undefined && categoryId !== null) {
    sets.push(`category_id = $${i}`); params.push(categoryId || null)
  }
  if (sets.length === 0) return { updated: 0, historico: 0 }
  const rows = await q(
    `WITH antes AS (
        SELECT id, date::text AS date_antes, category_id AS cat_antes FROM lancamentos WHERE id = ANY($1) FOR UPDATE
      )
      UPDATE lancamentos l SET ${sets.join(', ')} FROM antes WHERE l.id = antes.id
      RETURNING l.id, antes.date_antes, antes.cat_antes, l.date::text AS date_novo, l.category_id AS cat_novo`,
    params,
  )
  const linhas = []
  for (const r of rows) {
    const base = { entidade: 'lancamento', entidade_id: r.id, ocorrencia_data: null, serie_key: null, lote_id: loteId, escopo: 'parcela', motivo: motivo || null }
    if (date && String(r.date_antes).slice(0, 10) !== String(r.date_novo).slice(0, 10)) {
      linhas.push({ ...base, campo: 'date', valor_anterior: String(r.date_antes).slice(0, 10), valor_novo: String(r.date_novo).slice(0, 10) })
    }
    if (categoryId !== undefined && categoryId !== null && (r.cat_antes || null) !== (r.cat_novo || null)) {
      linhas.push({ ...base, campo: 'categoryId', valor_anterior: r.cat_antes || null, valor_novo: r.cat_novo || null })
    }
  }
  await inserirHistorico(q, linhas)
  return { updated: rows.length, historico: linhas.length }
}

async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'POST') return res.status(405).end()
  try {
    const { ids, date, categoryId, lote_id: loteBody, motivo } = await parseBody(req)
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids vazio' })
    }
    // Perfis permitidos: lançamento de conta fora deles → 403, nada é alterado.
    await exigirLinhasPermitidas(query, req.user, 'lancamentos', ids)
    const loteId = loteBody ? String(loteBody) : `lote_${Date.now()}_${Math.random().toString(36).slice(2)}`
    await ensureHistoricoSchema()
    const r = await withTransaction(q => aplicarBulkLancamentos(q, {
      ids, date, categoryId, loteId,
      motivo: motivo ? String(motivo).trim().slice(0, 500) || null : null,
    }))
    res.json({ ok: true, ...r, lote_id: loteId })
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message })
    console.error('[api/transactions-bulk-update]', err.message)
    res.status(500).json({ error: err.message })
  }
}

export default comAmbiente(handler)
