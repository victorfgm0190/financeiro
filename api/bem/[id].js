import { query } from '../_db.js'
import { requireAuth } from '../_auth.js'
import { getRouteId, num, fail, serializarBem } from '../_bem.js'

// GET /api/bem/[id] — bem com saldo atual, categorias parametrizadas, status de venda e o
// financiamento vinculado (null se ainda não houver).

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'GET') return fail(res, 405, 'Método não permitido')

  try {
    const id = getRouteId(req)
    if (!id) return fail(res, 400, 'id é obrigatório')

    const [conta] = await query(`SELECT * FROM contas WHERE id = $1`, [id])
    if (!conta) return fail(res, 404, `bem ${id} não encontrado`)

    const catIds = [
      conta.categoria_perda_bem_id, conta.categoria_ganho_bem_id,
      conta.categoria_prestacao_id, conta.categoria_taxa_finan_id,
    ].filter(Boolean)
    const catRows = catIds.length
      ? await query(`SELECT id, name FROM categorias WHERE id = ANY($1)`, [catIds])
      : []
    const catsById = Object.fromEntries(catRows.map(c => [c.id, c]))

    const [fin] = await query(
      `SELECT * FROM financing WHERE bem_id = $1 ORDER BY created_at DESC LIMIT 1`, [id],
    )

    return res.json({
      success: true,
      bem: {
        ...serializarBem(conta, catsById),
        financiamento: fin ? {
          id: fin.id,
          valor_principal: num(fin.valor_principal),
          juros_totais: num(fin.juros_totais),
          valor_total: num(fin.valor_total),
          num_parcelas: num(fin.num_parcelas),
          valor_parcela: num(fin.valor_parcela),
          banco: fin.banco ?? null,
          status: fin.status,
          conta_divida_id: fin.conta_divida_id ?? null,
        } : null,
      },
    })
  } catch (err) {
    console.error('[api/bem/[id]]', err.message)
    return fail(res, 500, err.message)
  }
}
