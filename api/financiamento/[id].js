import { query } from '../_db.js'
import { requireAuth } from '../_auth.js'
import {
  ensureBemSchema, getRouteId, num, round2, fail, SELECT_PARCELAS, serializarParcela,
} from '../_bem.js'

// GET /api/financiamento/[id] — financiamento completo: provisão × realizado, desvios e as
// N parcelas. `desvio_juros` acumulado é a diferença entre os juros provisionados das parcelas
// já baixadas e os juros efetivamente pagos nelas.

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'GET') return fail(res, 405, 'Método não permitido')

  try {
    await ensureBemSchema()
    const id = getRouteId(req)
    if (!id) return fail(res, 400, 'id é obrigatório')

    const [fin] = await query(`SELECT * FROM financing WHERE id = $1`, [id])
    if (!fin) return fail(res, 404, `financiamento ${id} não encontrado`)

    const [bem] = await query(`SELECT id, name FROM contas WHERE id = $1`, [fin.bem_id])
    const rows = await query(
      `${SELECT_PARCELAS} WHERE financing_id = $1 ORDER BY numero_parcela`, [id],
    )
    const parcelas = rows.map(serializarParcela)

    const realizado = parcelas.reduce((acc, p) => ({
      principal: round2(acc.principal + p.principal_pago),
      juros: round2(acc.juros + p.juros_pago),
      total: round2(acc.total + p.total_pago),
    }), { principal: 0, juros: 0, total: 0 })

    const provisao = {
      principal: num(fin.valor_principal),
      juros: num(fin.juros_totais),
      total: num(fin.valor_total),
    }

    // Só as parcelas já tocadas entram no desvio — as ainda abertas não são "juros a menos",
    // são juros que ainda nem venceram.
    const desvioJuros = round2(
      parcelas.filter(p => p.status !== 'open').reduce((s, p) => s + p.desvio_juros, 0),
    )

    return res.json({
      success: true,
      financiamento: {
        id: fin.id,
        bem_id: fin.bem_id,
        bem_nome: bem?.name ?? null,
        valor_principal: provisao.principal,
        juros_totais: provisao.juros,
        valor_total: provisao.total,
        num_parcelas: num(fin.num_parcelas),
        valor_parcela: num(fin.valor_parcela),
        banco: fin.banco ?? null,
        status: fin.status,
        conta_divida_id: fin.conta_divida_id ?? null,
        conta_origem_id: fin.conta_origem_id ?? null,
        provisao,
        realizado,
        analise: {
          principal_restante: round2(provisao.principal - realizado.principal),
          juros_restantes: round2(provisao.juros - realizado.juros),
          desvio_juros: desvioJuros,
          total_restante: round2(provisao.total - realizado.total),
        },
        parcelas,
      },
    })
  } catch (err) {
    console.error('[api/financiamento/[id]]', err.message)
    return fail(res, 500, err.message)
  }
}
