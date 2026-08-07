import { query, parseBody, withTransaction } from '../../_db.js'
import { requireAuth } from '../../_auth.js'
import {
  getRouteId, num, round2, hoje, fail,
  criarLancamentoCategorizado, registrarMovimentacao,
} from '../../_bem.js'

// POST /api/bem/[id]/registrar-entrada — registra a entrada à vista do bem.
//
// Cada item de `transferencias` é de um dos dois tipos:
//   • { transferencia_id } → vincula um lançamento/transferência já existente ao bem;
//   • { bem_origem_id }    → trade-in: um bem antigo dado como parte do pagamento.
//
// No trade-in o bem antigo é liquidado: perda/ganho = valor_venda − valor_nota_fiscal, o saldo
// é reduzido pelo valor negociado e a conta é marcada como vendida apontando para o bem novo.

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'POST') return fail(res, 405, 'Método não permitido')

  try {
    const body = await parseBody(req)
    const bemId = getRouteId(req, 1) || body.bem_id
    if (!bemId) return fail(res, 400, 'bem_id é obrigatório')

    const itens = Array.isArray(body.transferencias) ? body.transferencias : []
    if (itens.length === 0) return fail(res, 400, 'transferencias deve ser um array não vazio')

    const [bem] = await query(`SELECT * FROM contas WHERE id = $1`, [bemId])
    if (!bem) return fail(res, 404, `bem ${bemId} não encontrado`)

    const data = body.data && String(body.data).slice(0, 10) || hoje()

    // Valida tudo antes de escrever: um item inválido no meio não pode deixar entrada parcial.
    for (const [i, item] of itens.entries()) {
      const valor = Number(item?.valor)
      if (!Number.isFinite(valor) || valor <= 0) {
        return fail(res, 400, `transferencias[${i}].valor deve ser um número maior que zero`)
      }
      if (!item?.transferencia_id && !item?.bem_origem_id) {
        return fail(res, 400, `transferencias[${i}] precisa de transferencia_id ou bem_origem_id`)
      }
      if (item.transferencia_id) {
        const [tx] = await query(`SELECT id FROM lancamentos WHERE id = $1`, [item.transferencia_id])
        if (!tx) return fail(res, 404, `transferência ${item.transferencia_id} não encontrada`)
      }
      if (item.bem_origem_id) {
        const [antigo] = await query(`SELECT id, foi_vendido FROM contas WHERE id = $1`, [item.bem_origem_id])
        if (!antigo) return fail(res, 404, `bem de origem ${item.bem_origem_id} não encontrado`)
        if (antigo.foi_vendido) return fail(res, 400, `bem de origem ${item.bem_origem_id} já foi vendido`)
      }
    }

    const resultado = await withTransaction(async (q) => {
      let entradaTotal = 0
      const bensAntigos = []

      for (const item of itens) {
        const valor = round2(Number(item.valor))
        entradaTotal = round2(entradaTotal + valor)

        if (item.transferencia_id) {
          await q(
            `UPDATE lancamentos SET bem_id = $2, category_id = COALESCE($3, category_id)
               WHERE id = $1`,
            [item.transferencia_id, bemId, item.categoria_id || null],
          )
          await registrarMovimentacao(q, {
            bemId,
            tipo: 'entrada_venda',
            data,
            descricao: item.descricao || 'Entrada à vista',
            valor,
            categoriaId: item.categoria_id || null,
            lancamentoId: item.transferencia_id,
          })
          continue
        }

        const [antigo] = await q(`SELECT * FROM contas WHERE id = $1`, [item.bem_origem_id])
        const valorNF = num(antigo.valor_nota_fiscal)
        // Sinal contábil: negativo = perda, positivo = ganho.
        const perdaGanho = round2(valor - valorNF)
        const isGanho = perdaGanho > 0

        const categoriaResultado = item.categoria_id
          || (isGanho
            ? (antigo.categoria_ganho_bem_id || bem.categoria_ganho_bem_id)
            : (antigo.categoria_perda_bem_id || bem.categoria_perda_bem_id))

        let lancamentoId = null
        if (perdaGanho !== 0 && categoriaResultado) {
          lancamentoId = await criarLancamentoCategorizado(q, {
            categoriaId: categoriaResultado,
            valor: Math.abs(perdaGanho),
            descricao: `${isGanho ? 'Ganho' : 'Perda'} de venda de bem — ${antigo.name}`,
            bemId,
            data,
            tipo: isGanho ? 'income' : 'expense',
            origin: 'patrimonio_auto',
          })
        }

        const saldoAnterior = num(antigo.balance)
        const saldoNovo = round2(saldoAnterior - valor)
        await q(
          `UPDATE contas SET balance = $2, foi_vendido = TRUE, data_venda = $3, bem_destino_id = $4
             WHERE id = $1`,
          [antigo.id, saldoNovo, data, bemId],
        )

        const movimentacaoId = await registrarMovimentacao(q, {
          bemId,
          tipo: 'entrada_trade_in',
          data,
          descricao: item.descricao || `Recebido ${antigo.name} como entrada`,
          bemOrigemId: antigo.id,
          valor,
          perdaGanho,
          categoriaId: categoriaResultado || null,
          lancamentoId,
        })

        bensAntigos.push({
          id: antigo.id,
          nome: antigo.name,
          valor_nota_fiscal: valorNF,
          valor_entrada: valor,
          saldo_anterior: saldoAnterior,
          saldo_reducido: saldoNovo,
          foi_vendido: true,
          data_venda: data,
          perda_ganho: perdaGanho,
          perda: isGanho ? 0 : Math.abs(perdaGanho),
          ganho: isGanho ? perdaGanho : 0,
          categoria_id: categoriaResultado || null,
          lancamento_id: lancamentoId,
          movimentacao_id: movimentacaoId,
        })
      }

      const saldoBemAnterior = num(bem.balance)
      const saldoBemNovo = round2(saldoBemAnterior + entradaTotal)
      await q(`UPDATE contas SET balance = $2 WHERE id = $1`, [bemId, saldoBemNovo])

      return { entradaTotal, saldoBemAnterior, saldoBemNovo, bensAntigos }
    })

    return res.json({
      success: true,
      entrada_total: resultado.entradaTotal,
      bem: {
        id: bemId,
        nome: bem.name,
        saldo_anterior: resultado.saldoBemAnterior,
        saldo: resultado.saldoBemNovo,
      },
      bens_antigos: resultado.bensAntigos,
      // Conveniência para o caso mais comum (um único trade-in).
      bem_antigo: resultado.bensAntigos[0] || null,
    })
  } catch (err) {
    console.error('[api/bem/[id]/registrar-entrada]', err.message)
    return fail(res, 500, err.message)
  }
}
