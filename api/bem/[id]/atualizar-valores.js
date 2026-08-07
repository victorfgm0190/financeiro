import { query, parseBody } from '../../_db.js'
import { requireAuth } from '../../_auth.js'
import {
  getRouteId, num, round2, fail, explicarErro, serializarBem,
  METODOS_PATRIMONIO, METODO_PATRIMONIO_PADRAO,
} from '../../_bem.js'

// POST /api/bem/[id]/atualizar-valores — edita os dois valores do bem e escolhe qual deles
// representa o bem no Patrimônio.
//
// A edição dos VALORES só vale para bem sem movimentação registrada. Num bem que já tem
// histórico esses números não são digitados, são consequência: a nota fiscal é a base de que a
// perda/ganho de um trade-in já feito foi calculada (mexer nela reescreveria um resultado
// contábil que já virou lançamento) e o valor pago é o saldo, somado entrada por entrada. A
// trava mora aqui, no servidor, não só no botão — a UI esconde os inputs, mas quem garante é
// este 409.
//
// O MÉTODO é sempre editável, com ou sem movimentação: escolher qual número entra no Patrimônio
// não reescreve nada, só troca a leitura.

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'POST') return fail(res, 405, 'Método não permitido')

  try {
    const body = await parseBody(req)
    const bemId = getRouteId(req, 1) || body.bem_id
    if (!bemId) return fail(res, 400, 'bem_id é obrigatório')

    const [bem] = await query(`SELECT * FROM contas WHERE id = $1`, [bemId])
    if (!bem) return fail(res, 404, `bem ${bemId} não encontrado`)

    // `undefined` = campo ausente no payload (não mexe). `null` = pedido explícito de limpar.
    const temNF = 'valor_nota_fiscal' in body
    const temPago = 'valor_pago_manual' in body
    const temMetodo = 'patrimonio_use_method' in body
    if (!temNF && !temPago && !temMetodo) {
      return fail(res, 400, 'informe ao menos um campo para atualizar')
    }

    const validarValor = (rotulo, v) => {
      if (v === null || v === '') return null
      const n = Number(v)
      if (!Number.isFinite(n) || n < 0) return { erro: `${rotulo} deve ser um número maior ou igual a zero` }
      return round2(n)
    }

    let valorNF
    if (temNF) {
      valorNF = validarValor('valor_nota_fiscal', body.valor_nota_fiscal)
      if (valorNF?.erro) return fail(res, 400, valorNF.erro)
    }
    let valorPago
    if (temPago) {
      valorPago = validarValor('valor_pago_manual', body.valor_pago_manual)
      if (valorPago?.erro) return fail(res, 400, valorPago.erro)
    }

    let metodo
    if (temMetodo) {
      metodo = body.patrimonio_use_method || METODO_PATRIMONIO_PADRAO
      if (!METODOS_PATRIMONIO.includes(metodo)) {
        return fail(res, 400, `patrimonio_use_method deve ser ${METODOS_PATRIMONIO.join(' ou ')}`)
      }
    }

    if (temNF || temPago) {
      // `OR bem_origem_id` cobre os dois papéis que um bem tem no histórico. Como destino, os
      // valores vêm das entradas somadas. Como ORIGEM de um trade-in, a nota fiscal dele foi a
      // base da perda/ganho que já virou lançamento em OUTRO bem — reescrevê-la deixaria aquele
      // resultado sem explicação, mesmo o bem não tendo movimentação própria.
      const [{ n: movimentacoes }] = await query(
        `SELECT COUNT(*)::int AS n FROM bem_movimentacoes
          WHERE bem_id = $1 OR bem_origem_id = $1`,
        [bemId],
      )
      if (movimentacoes > 0) {
        return fail(
          res, 409,
          `este bem tem ${movimentacoes} movimentação(ões) registrada(s): a nota fiscal e o valor `
          + 'pago passam a ser calculados pelo histórico e não podem ser editados à mão. Estorne '
          + 'a entrada para voltar a editá-los. Só a escolha de qual valor usar no Patrimônio '
          + 'continua liberada.',
        )
      }
    }

    // COALESCE não serve: ele não distingue "não mandou o campo" de "mandou null para limpar".
    // Montamos o SET só com o que veio, e cada valor vai como parâmetro próprio.
    const sets = []
    const params = [bemId]
    if (temNF) { params.push(valorNF); sets.push(`valor_nota_fiscal = $${params.length}`) }
    if (temPago) { params.push(valorPago); sets.push(`valor_pago_manual = $${params.length}`) }
    if (temMetodo) { params.push(metodo); sets.push(`patrimonio_use_method = $${params.length}`) }

    const [atualizado] = await query(
      `UPDATE contas SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, params,
    )

    // Mesmo recorte de GET /api/bem/[id]: serializarBem resolve o nome das categorias por id.
    const catIds = [
      atualizado.categoria_perda_bem_id, atualizado.categoria_ganho_bem_id,
      atualizado.categoria_prestacao_id, atualizado.categoria_taxa_finan_id,
    ].filter(Boolean)
    const catRows = catIds.length
      ? await query(`SELECT id, name FROM categorias WHERE id = ANY($1)`, [catIds])
      : []

    return res.json({
      success: true,
      bem: serializarBem(atualizado, Object.fromEntries(catRows.map(c => [c.id, c]))),
      // Espelho direto para o estado React, sem o resto do payload do bem.
      valores: {
        valor_nota_fiscal: atualizado.valor_nota_fiscal == null ? null : num(atualizado.valor_nota_fiscal),
        valor_pago_manual: atualizado.valor_pago_manual == null ? null : num(atualizado.valor_pago_manual),
        patrimonio_use_method: atualizado.patrimonio_use_method || METODO_PATRIMONIO_PADRAO,
      },
    })
  } catch (err) {
    console.error('[api/bem/[id]/atualizar-valores]', err.message)
    return fail(res, 500, explicarErro(err))
  }
}
