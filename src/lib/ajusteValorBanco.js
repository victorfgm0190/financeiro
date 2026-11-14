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
//   • Grupo G (controle gerencial ligado) — decisão de 14/11/2026:
//       – a etapa A (Principal → Ger.) da compra passa a ter o novo valor;
//       – devolução gerencial da fatura PENDENTE: o motor a recalcula (nada mais a fazer);
//       – devolução JÁ EXECUTADA: não é alterada; UM lançamento de ajuste com a diferença, ligado à
//         devolução (source_schedule_id + data_ocorrencia), à fatura da COMPRA (fatura_ref) e à compra
//         (parent_tx_id), sai da Ger. (banco cobrou mais) ou entra nela (cobrou menos) — o saldo
//         gerencial daquela fatura volta a zero. Mesmo origin do ajuste do resgate executado.
import { ajustarRateio } from './rateio.js'
import { txAjusteResgate } from './ajusteResgate.js'
import { faturaDoLancamento } from './faturaCartao.js'
import { isGerencialAutoOrigin, ORIGIN } from './origins.js'

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const fmtBRL = (v) => r2(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const ymParaRef = (ym) => (ym ? `${ym.slice(5, 7)}/${ym.slice(0, 4)}` : null)

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

// Etapa A (Principal → Ger.) da compra: a automática (tx_gerA_<id>) ou a do "Executar Gerenciais".
export function etapaADaCompra(txId, transactions = []) {
  return (transactions || []).find(t => t.type === 'transfer' && (
    t.id === `tx_gerA_${txId}` || t.sourceExpenseId === txId || (isGerencialAutoOrigin(t) && t.parentTxId === txId)
  )) || null
}

// Devolução gerencial (gerencial_devolucao) da fatura da compra.
export function devolucaoDaCompra(tx, card, schedules = []) {
  const fatura = faturaDoLancamento(tx, card || {})
  return (schedules || []).find(s => s.tipo === 'gerencial_devolucao' && s.cardId === tx.accountId && s.faturaMesAno === fatura
    && (!Array.isArray(s.sourceExpenseIds) || !s.sourceExpenseIds.length || s.sourceExpenseIds.includes(tx.id))) || null
}

// Parte gerencial (grupo G) do ajuste da compra `tx` de `de` para `para`, ou null (sem gerencial, outro
// grupo, sem etapa A). → { etapa, etapaDe, etapaPara, devolucao, executada, txAjuste }
export function planoGerencialDoAjuste({ tx, de, para, card = null, transactions = [], schedules = [], gerencialGroups = [], gerencialLigado = true, hoje }) {
  if (!gerencialLigado || !tx) return null
  const diferenca = r2(r2(para) - r2(de))
  if (Math.abs(diferenca) <= 0.005) return null
  const grupo = (gerencialGroups || []).find(g => g.id === tx.grupoGerencial)
  if (grupo?.number !== 1) return null
  const etapa = etapaADaCompra(tx.id, transactions)
  if (!etapa) return null
  const devolucao = devolucaoDaCompra(tx, card, schedules)
  const executada = !!devolucao && resgateExecutado(devolucao)
  let txAjuste = null
  if (executada) {
    // Devolução = Ger. → Principal. Banco cobrou MAIS: a diferença também sai da Ger.; cobrou MENOS: volta a ela.
    const sai = diferenca > 0
    const fatura = devolucao.faturaMesAno || faturaDoLancamento(tx, card || {})
    txAjuste = {
      type: 'transfer',
      accountId: sai ? devolucao.accountId : devolucao.toAccountId,
      toAccountId: sai ? devolucao.toAccountId : devolucao.accountId,
      amount: Math.abs(diferenca),
      date: hoje,
      description: `Ajuste ao valor da fatura do banco — ${tx.description || ''} (${fmtBRL(de)} → ${fmtBRL(para)})`,
      cardId: tx.accountId, faturaRef: ymParaRef(fatura),
      sourceScheduleId: devolucao.id, dataOcorrencia: devolucao.registered[0],
      parentTxId: tx.id,
      categoryId: '', payee: '', costCenter: '',
      origin: ORIGIN.RESGATE_AJUSTE,
    }
  }
  return { etapa, etapaDe: r2(etapa.amount), etapaPara: r2(para), devolucao, executada, txAjuste }
}

// Plano do que acompanha o ajuste do lançamento `tx` de `de` para `para`.
// → { rateio: linhas | null, resgate: null | { schedule, executado, funcaoId, de, para, txAjuste },
//     gerencial: null | planoGerencialDoAjuste }
export function planoDoAjuste({ tx, de, para, schedules = [], scheduleReservaFuncoes = [], rateios = null, hoje, transactions = null, gerencialGroups = null, card = null, gerencialLigado = true }) {
  const out = { rateio: null, resgate: null, gerencial: null }
  if (!tx || Math.abs(r2(para) - r2(de)) <= 0.005) return out
  if (rateios?.length) out.rateio = ajustarRateio(rateios, r2(para))
  if (transactions && gerencialGroups) {
    out.gerencial = planoGerencialDoAjuste({ tx, de, para, card, transactions, schedules, gerencialGroups, gerencialLigado, hoje })
  }
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
