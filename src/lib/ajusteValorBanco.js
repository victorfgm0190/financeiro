// VALE O VALOR DA FATURA DO BANCO — o que acompanha o ajuste de UMA parcela (lib/revisaoImportacao
// ajusteDeValorDaLinha). Só a ocorrência ajustada muda; as outras parcelas, os outros resgates e o
// valor padrão do agendamento ficam como estão.
//   • Rateio do lançamento: reescalado para fechar no novo valor (lib/rateio ajustarRateio).
//   • Resgate da reserva da fatura (agendamento resgate_reserva gerado pelo motor, uma linha por
//     lançamento em schedule_reserva_funcoes):
//       – PENDENTE: o próprio motor recalcula (recalcularAgendamentosFatura → reconcileFaturaState)
//         o valor do resgate e a linha da função a partir do novo valor do lançamento;
//       – JÁ EXECUTADO: o motor nunca altera o executado; a diferença vira um complementar ou uma
//         devolução ligada ao resgate e à função — o MESMO lançamento do ajuste de resgate pago
//         (lib/ajusteResgate txAjusteResgate, origin 'resgate_ajuste').
//   • Etapa A / transferências gerenciais do lançamento: updateTransaction → applyEnsureGerencial.
import { ajustarRateio } from './rateio.js'
import { txAjusteResgate } from './ajusteResgate.js'

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// Resgate (resgate_reserva da fatura) que cobre o lançamento.
export function resgateDoLancamento(txId, schedules = []) {
  return (schedules || []).find(s => s.tipo === 'resgate_reserva' && (
    (Array.isArray(s.sourceExpenseIds) && s.sourceExpenseIds.includes(txId))
    || (Array.isArray(s.overrides?._sourceTxIds) && s.overrides._sourceTxIds.includes(txId))
  )) || null
}

// Executado = ocorrência registrada (geridos são frequency 'once').
export const resgateExecutado = (s) => (s?.registered || []).length > 0

// Linha do detalhamento por função do lançamento no resgate (ou null).
export function linhaDaFuncao(resgateId, txId, scheduleReservaFuncoes = []) {
  return (scheduleReservaFuncoes || []).find(l => l.scheduleId === resgateId
    && (l.sourceLancamentoId === txId || (Array.isArray(l.sourceIds) && l.sourceIds.includes(txId)))) || null
}

// Plano do que acompanha o ajuste do lançamento `tx` de `de` para `para`.
// → { rateio: linhas | null, resgate: null | { schedule, executado, funcaoId, de, para, txAjuste } }
export function planoDoAjuste({ tx, de, para, schedules = [], scheduleReservaFuncoes = [], rateios = null, hoje }) {
  const out = { rateio: null, resgate: null }
  if (!tx || Math.abs(r2(para) - r2(de)) <= 0.005) return out
  if (rateios?.length) out.rateio = ajustarRateio(rateios, r2(para))
  const s = resgateDoLancamento(tx.id, schedules)
  if (!s) return out
  const linha = linhaDaFuncao(s.id, tx.id, scheduleReservaFuncoes)
  const funcaoId = linha?.reservaFuncaoId || s.reservaFuncaoId || null
  const executado = resgateExecutado(s)
  // Parte deste lançamento no resgate: a linha da função; sem detalhamento, o valor antigo do lançamento.
  const parteDe = linha ? r2(linha.valor) : r2(de)
  const resgate = { schedule: s, executado, funcaoId, de: parteDe, para: r2(parteDe + (r2(para) - r2(de))), txAjuste: null }
  if (executado) {
    const diferenca = r2(r2(para) - r2(de))
    resgate.txAjuste = txAjusteResgate(
      { tipo: diferenca > 0 ? 'complementar' : 'devolver', resgate: { ...s, reservaFuncaoId: funcaoId }, diferenca: Math.abs(diferenca), chave: s.registered[0] },
      { data: hoje, contaDespesaId: s.toAccountId, descricaoDespesa: tx.description || '' },
    )
  }
  out.resgate = resgate
  return out
}
