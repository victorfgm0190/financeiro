import { query, parseBody, withTransaction } from '../_db.js'
import { requireAuth } from '../_auth.js'
import {
  genId, num, round2, fail, serializarBem,
  categoriasInexistentes, ACCOUNT_TYPE_BEM, TIPO_BEM,
} from '../_bem.js'

// POST /api/bem/criar — cadastro inicial de um bem imobilizado.
// Cria (ou converte) a conta do bem e parametriza as 4 categorias usadas pelo módulo:
// perda/ganho de venda, prestação e taxa de financiamento.

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'POST') return fail(res, 405, 'Método não permitido')

  try {
    const body = await parseBody(req)
    const {
      nome, valor_nota_fiscal, conta_id, descricao,
      categoria_perda_bem_id, categoria_ganho_bem_id,
      categoria_prestacao_id, categoria_taxa_finan_id,
    } = body

    if (!nome || typeof nome !== 'string') return fail(res, 400, 'nome é obrigatório')
    if (!Number.isFinite(Number(valor_nota_fiscal)) || Number(valor_nota_fiscal) <= 0) {
      return fail(res, 400, 'valor_nota_fiscal deve ser um número maior que zero')
    }

    const cats = {
      perda: categoria_perda_bem_id,
      ganho: categoria_ganho_bem_id,
      prestacao: categoria_prestacao_id,
      taxa_finan: categoria_taxa_finan_id,
    }
    const faltando = Object.entries(cats).filter(([, v]) => !v).map(([k]) => k)
    if (faltando.length) {
      return fail(res, 400, `categorias obrigatórias não informadas: ${faltando.join(', ')}`)
    }
    const invalidas = await categoriasInexistentes(query, Object.values(cats))
    if (invalidas.length) {
      return fail(res, 400, `categorias inexistentes: ${invalidas.join(', ')}`)
    }

    if (conta_id) {
      const existe = await query(`SELECT id FROM contas WHERE id = $1`, [conta_id])
      if (existe.length === 0) return fail(res, 404, `conta ${conta_id} não encontrada`)
    }

    const bemId = conta_id || genId('acc_bem')
    const valorNF = round2(num(valor_nota_fiscal))

    const conta = await withTransaction(async (q) => {
      if (conta_id) {
        // valor_nota_fiscal é imutável: só grava se a conta ainda não tiver um valor definido.
        await q(
          `UPDATE contas SET
             name = $2, type = $3, tipo_bem = $4, descricao = COALESCE($5, descricao),
             valor_nota_fiscal = COALESCE(valor_nota_fiscal, $6),
             categoria_perda_bem_id = $7, categoria_ganho_bem_id = $8,
             categoria_prestacao_id = $9, categoria_taxa_finan_id = $10
           WHERE id = $1`,
          [bemId, nome, ACCOUNT_TYPE_BEM, TIPO_BEM, descricao ?? null, valorNF,
            cats.perda, cats.ganho, cats.prestacao, cats.taxa_finan],
        )
      } else {
        await q(
          `INSERT INTO contas
             (id, name, type, tipo_bem, balance, initial_balance, valor_nota_fiscal, descricao,
              foi_vendido, categoria_perda_bem_id, categoria_ganho_bem_id,
              categoria_prestacao_id, categoria_taxa_finan_id)
           VALUES ($1, $2, $3, $4, 0, 0, $5, $6, FALSE, $7, $8, $9, $10)`,
          [bemId, nome, ACCOUNT_TYPE_BEM, TIPO_BEM, valorNF, descricao ?? null,
            cats.perda, cats.ganho, cats.prestacao, cats.taxa_finan],
        )
      }
      const rows = await q(`SELECT * FROM contas WHERE id = $1`, [bemId])
      return rows[0]
    })

    const bem = serializarBem(conta)
    return res.json({
      success: true,
      bem: {
        ...bem,
        // A spec devolve só os ids nesta rota; GET /api/bem/[id] devolve id + nome.
        categorias: {
          perda: cats.perda,
          ganho: cats.ganho,
          prestacao: cats.prestacao,
          taxa_finan: cats.taxa_finan,
        },
      },
    })
  } catch (err) {
    console.error('[api/bem/criar]', err.message)
    return fail(res, 500, err.message)
  }
}
