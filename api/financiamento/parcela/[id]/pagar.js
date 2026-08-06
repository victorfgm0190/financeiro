import { query, parseBody, withTransaction } from '../../../_db.js'
import { requireAuth } from '../../../_auth.js'
import {
  ensureBemSchema, getRouteId, num, round2, hoje, isIsoDate, fail,
  calcularRateio, criarLancamentoCategorizado, registrarMovimentacao,
} from '../../../_bem.js'

// POST /api/financiamento/parcela/[id]/pagar — baixa (total ou parcial) de uma parcela.
//
// O rateio quita o PRINCIPAL primeiro; os juros ficam com a sobra e o que faltar vira desvio.
// Em pagamentos parciais sucessivos o rateio é recalculado sobre o ACUMULADO da parcela — a
// fórmula é stateless, então aplicá-la só sobre a parcela do dia daria principal/juros errados
// no segundo aporte. Os lançamentos e os saldos usam apenas o DELTA deste pagamento.
//
// A conta de origem não é debitada aqui de propósito: o agendamento da parcela é uma
// transferência conta corrente → conta de dívida e é ela que move o dinheiro da conta corrente.
// Debitar nos dois lugares contaria a saída duas vezes.

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  if (req.method !== 'POST') return fail(res, 405, 'Método não permitido')

  try {
    await ensureBemSchema()
    const body = await parseBody(req)
    const parcelaId = getRouteId(req, 1) || body.parcela_id
    if (!parcelaId) return fail(res, 400, 'parcela_id é obrigatório')

    const valorPago = Number(body.valor_pago)
    if (!Number.isFinite(valorPago) || valorPago <= 0) {
      return fail(res, 400, 'valor_pago deve ser um número maior que zero')
    }
    if (body.data_pagamento != null && !isIsoDate(body.data_pagamento)) {
      return fail(res, 400, 'data_pagamento deve estar no formato YYYY-MM-DD')
    }
    const dataPagamento = body.data_pagamento ? String(body.data_pagamento).slice(0, 10) : hoje()

    const [parcela] = await query(
      `SELECT *, to_char(data_vencimento, 'YYYY-MM-DD') AS venc_iso
         FROM financing_installments WHERE id = $1`, [parcelaId],
    )
    if (!parcela) return fail(res, 404, `parcela ${parcelaId} não encontrada`)
    if (parcela.status === 'paid') {
      return fail(res, 400, `parcela ${parcelaId} já está quitada`)
    }

    const [fin] = await query(`SELECT * FROM financing WHERE id = $1`, [parcela.financing_id])
    if (!fin) return fail(res, 404, `financiamento ${parcela.financing_id} não encontrado`)

    const [bem] = await query(`SELECT * FROM contas WHERE id = $1`, [fin.bem_id])
    if (!bem) return fail(res, 404, `bem ${fin.bem_id} não encontrado`)

    const [divida] = await query(`SELECT * FROM contas WHERE id = $1`, [fin.conta_divida_id])
    if (!divida) return fail(res, 404, `conta de dívida ${fin.conta_divida_id} não encontrada`)

    if (body.conta_origem_id) {
      const [origem] = await query(`SELECT id FROM contas WHERE id = $1`, [body.conta_origem_id])
      if (!origem) return fail(res, 404, `conta de origem ${body.conta_origem_id} não encontrada`)
    }

    const catPrestacao = bem.categoria_prestacao_id
    const catTaxa = bem.categoria_taxa_finan_id
    if (!catPrestacao || !catTaxa) {
      return fail(res, 400,
        'bem sem categoria_prestacao_id/categoria_taxa_finan_id parametrizadas — refaça POST /api/bem/criar')
    }

    const principalPrev = num(parcela.principal_provisioned)
    const jurosPrev = num(parcela.juros_provisioned)
    const principalAntes = num(parcela.principal_pago)
    const jurosAntes = num(parcela.juros_pago)
    const totalAntes = num(parcela.total_pago)

    const pagoAcumulado = round2(totalAntes + valorPago)
    const rateio = calcularRateio(pagoAcumulado, principalPrev, jurosPrev)

    const deltaPrincipal = round2(rateio.principalPago - principalAntes)
    const deltaJuros = round2(rateio.jurosPago - jurosAntes)
    const totalNovo = round2(rateio.principalPago + rateio.jurosPago)
    const statusNovo = totalNovo >= round2(num(parcela.total_provisioned)) ? 'paid' : 'partial'

    const resultado = await withTransaction(async (q) => {
      const descricaoBase = `Parcela ${parcela.numero_parcela}/${num(fin.num_parcelas)} - ${bem.name}`
      const lancamentos = []

      if (deltaPrincipal > 0) {
        const id = await criarLancamentoCategorizado(q, {
          categoriaId: catPrestacao,
          valor: deltaPrincipal,
          descricao: descricaoBase,
          bemId: bem.id,
          data: dataPagamento,
          tipo: 'expense',
          origin: 'pagamento_divida',
        })
        lancamentos.push({
          id, categoria_id: catPrestacao, valor: deltaPrincipal, descricao: descricaoBase,
        })
      }
      if (deltaJuros > 0) {
        const desc = `${descricaoBase} - Juros`
        const id = await criarLancamentoCategorizado(q, {
          categoriaId: catTaxa,
          valor: deltaJuros,
          descricao: desc,
          bemId: bem.id,
          data: dataPagamento,
          tipo: 'expense',
          origin: 'pagamento_divida',
        })
        lancamentos.push({ id, categoria_id: catTaxa, valor: deltaJuros, descricao: desc })
      }

      const saldoBemAnterior = num(bem.balance)
      const saldoBemNovo = round2(saldoBemAnterior + valorPago)
      await q(`UPDATE contas SET balance = $2 WHERE id = $1`, [bem.id, saldoBemNovo])

      const saldoDividaAnterior = num(divida.balance)
      const saldoDividaNovo = round2(saldoDividaAnterior + valorPago)
      await q(`UPDATE contas SET balance = $2 WHERE id = $1`, [divida.id, saldoDividaNovo])

      await q(
        `UPDATE financing_installments SET
           principal_pago = $2, juros_pago = $3, total_pago = $4,
           desvio_juros = $5, data_pagamento = $6, status = $7
         WHERE id = $1`,
        [parcelaId, rateio.principalPago, rateio.jurosPago, totalNovo,
          rateio.desvioJuros, dataPagamento, statusNovo],
      )

      // Agendamento da parcela: marca a ocorrência como registrada quando a parcela fecha, para
      // ela sair da lista de pendentes do painel de agendamentos.
      if (statusNovo === 'paid' && parcela.schedule_id) {
        await q(
          `UPDATE agendamentos
              SET registered = CASE
                    WHEN COALESCE(registered, '[]'::jsonb) @> to_jsonb($2::text) THEN registered
                    ELSE COALESCE(registered, '[]'::jsonb) || to_jsonb($2::text)
                  END,
                  next_occurrence = NULL
            WHERE id = $1`,
          [parcela.schedule_id, parcela.venc_iso],
        )
      }

      const movimentacaoId = await registrarMovimentacao(q, {
        bemId: bem.id,
        tipo: 'pagamento_parcela',
        data: dataPagamento,
        descricao: descricaoBase,
        valor: valorPago,
        principal: deltaPrincipal,
        juros: deltaJuros,
        categoriaId: catPrestacao,
        parcelaId,
        lancamentoId: lancamentos[0]?.id ?? null,
      })

      // Status do financiamento derivado do conjunto das parcelas.
      const [agg] = await q(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status = 'paid')::int AS pagas,
                COUNT(*) FILTER (WHERE status <> 'open')::int AS tocadas
           FROM financing_installments WHERE financing_id = $1`,
        [fin.id],
      )
      const statusFin = agg.pagas === agg.total ? 'completed' : (agg.tocadas > 0 ? 'partial' : 'open')
      if (statusFin !== fin.status) {
        await q(`UPDATE financing SET status = $2 WHERE id = $1`, [fin.id, statusFin])
      }

      return {
        lancamentos, movimentacaoId, statusFin,
        saldoBemAnterior, saldoBemNovo, saldoDividaAnterior, saldoDividaNovo,
      }
    })

    const catRows = await query(
      `SELECT id, name FROM categorias WHERE id = ANY($1)`, [[catPrestacao, catTaxa]],
    )
    const nomeCat = Object.fromEntries(catRows.map(c => [c.id, c.name]))

    return res.json({
      success: true,
      parcela: {
        id: parcelaId,
        numero: num(parcela.numero_parcela),
        status: statusNovo,
        principal_provisioned: principalPrev,
        juros_provisioned: jurosPrev,
        total_provisioned: num(parcela.total_provisioned),
        principal_pago: rateio.principalPago,
        juros_pago: rateio.jurosPago,
        total_pago: totalNovo,
        desvio_juros: rateio.desvioJuros,
        data_vencimento: parcela.venc_iso,
        data_pagamento: dataPagamento,
      },
      rateio: {
        valor_disponivel: round2(valorPago),
        total_pago_anterior: totalAntes,
        total_pago_acumulado: pagoAcumulado,
        principal_esperado: principalPrev,
        principal_pagos: rateio.principalPago,
        principal_neste_pagamento: deltaPrincipal,
        juros_esperado: jurosPrev,
        juros_pagos: rateio.jurosPago,
        juros_neste_pagamento: deltaJuros,
        juros_em_falta: rateio.desvioJuros,
      },
      lancamentos_criados: resultado.lancamentos.map(l => ({
        id: l.id,
        categoria_id: l.categoria_id,
        categoria_nome: nomeCat[l.categoria_id] ?? null,
        valor: l.valor,
        descricao: l.descricao,
      })),
      movimentacao_id: resultado.movimentacaoId,
      financiamento: { id: fin.id, status: resultado.statusFin },
      saldos_atualizados: {
        bem: {
          id: bem.id,
          saldo_anterior: resultado.saldoBemAnterior,
          saldo_novo: resultado.saldoBemNovo,
        },
        divida: {
          id: divida.id,
          saldo_anterior: resultado.saldoDividaAnterior,
          saldo_novo: resultado.saldoDividaNovo,
        },
      },
    })
  } catch (err) {
    console.error('[api/financiamento/parcela/[id]/pagar]', err.message)
    return fail(res, 500, err.message)
  }
}
