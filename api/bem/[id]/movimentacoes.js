import { query } from '../../_db.js'
import { requireAuth } from '../../_auth.js'
import { getRouteId, num, fail, explicarErro } from '../../_bem.js'

// GET /api/bem/[id]/movimentacoes — histórico do bem em ordem cronológica: entradas à vista,
// trade-ins (com perda/ganho) e pagamentos de parcela (principal × juros).

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'GET') return fail(res, 405, 'Método não permitido')

  try {
    const bemId = getRouteId(req, 1)
    if (!bemId) return fail(res, 400, 'id do bem é obrigatório')

    const [bem] = await query(`SELECT id, name FROM contas WHERE id = $1`, [bemId])
    if (!bem) return fail(res, 404, `bem ${bemId} não encontrado`)

    const rows = await query(
      `SELECT m.*,
              to_char(m.data, 'YYYY-MM-DD') AS data_iso,
              c.name  AS categoria_nome,
              o.name  AS bem_origem_nome,
              f.numero_parcela,
              fin.num_parcelas
         FROM bem_movimentacoes m
         LEFT JOIN categorias c              ON c.id  = m.categoria_id
         LEFT JOIN contas o                  ON o.id  = m.bem_origem_id
         LEFT JOIN financing_installments f  ON f.id  = m.parcela_id
         LEFT JOIN financing fin             ON fin.id = f.financing_id
        WHERE m.bem_id = $1
        ORDER BY m.data, m.created_at`,
      [bemId],
    )

    // A categoria de juros não fica na movimentação (ela guarda a de prestação); busca uma vez.
    const [conta] = await query(
      `SELECT categoria_taxa_finan_id FROM contas WHERE id = $1`, [bemId],
    )
    let categoriaJurosNome = null
    if (conta?.categoria_taxa_finan_id) {
      const [cj] = await query(`SELECT name FROM categorias WHERE id = $1`, [conta.categoria_taxa_finan_id])
      categoriaJurosNome = cj?.name ?? null
    }

    const movimentacoes = rows.map((m) => {
      const base = {
        movimentacao_id: m.id,
        tipo: m.tipo,
        data: m.data_iso,
        descricao: m.descricao,
        lancamento_id: m.lancamento_id ?? null,
      }

      if (m.tipo === 'entrada_trade_in') {
        return {
          ...base,
          bem_origem_id: m.bem_origem_id,
          bem_origem: m.bem_origem_nome ?? null,
          valor_entrada: num(m.valor),
          perda_ganho: m.perda_ganho === null ? null : num(m.perda_ganho),
          categoria: m.categoria_nome ?? null,
        }
      }

      if (m.tipo === 'pagamento_parcela') {
        return {
          ...base,
          parcela_id: m.parcela_id ?? null,
          numero_parcela: m.numero_parcela == null ? null : num(m.numero_parcela),
          num_parcelas: m.num_parcelas == null ? null : num(m.num_parcelas),
          principal: num(m.principal),
          juros: num(m.juros),
          total: num(m.valor),
          categoria_principal: m.categoria_nome ?? null,
          categoria_juros: categoriaJurosNome,
        }
      }

      return { ...base, valor: num(m.valor), categoria: m.categoria_nome ?? null }
    })

    return res.json({
      success: true,
      bem_id: bemId,
      bem_nome: bem.name,
      total: movimentacoes.length,
      movimentacoes,
    })
  } catch (err) {
    console.error('[api/bem/[id]/movimentacoes]', err.message)
    return fail(res, 500, explicarErro(err))
  }
}
