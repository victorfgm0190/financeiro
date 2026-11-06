// Regra de DESPESA POR CATEGORIA do Demonstrativo Financeiro — fonte única, usada também pelo
// Orçamento (os dois mostram o mesmo número por categoria no mesmo período):
//   • despesa = countsAsReportExpense (despesas, aportes categorizados, espelho "Reserva: X" do
//     depósito em função "exibir como despesa", espelho "Investimento - X" do aporte em bem ou
//     investimento); a perna de despesa do resgate não conta;
//   • receita de compensação do resgate ("Resgate Reserva: X", perna receita) ABATE a categoria
//     (pode ficar negativa), desde que a função já tenha recebido depósito (criarTesteAbatimento);
//   • espelhos de funções que NÃO são "exibir como despesa" (Reservas Gerais, Fundos de
//     Investimento…) ficam fora (bloco Reservas do Demonstrativo).
import {
  aplicacaoAccountIds, countsAsReportExpense, countsAsReportIncome, isInvestimentoSombra, isResgateReservaSombra, reservaDespesaFuncIds,
} from '../components/shared/utils.js'
import { contaDonaDoEspelho } from './espelhoReserva.js'
import { isInvestAutoOrigin, lancamentoNasContas } from './origins.js'

// Perfil ativo: espelhos de reserva (reservaAuto) ficam só quando a conta da FUNÇÃO é do perfil;
// o espelho de investimento não tem função: vale a conta da transferência que o gerou. Os demais,
// quando uma das contas é do perfil (ganho/perda de venda de bem: a conta do bem).
// profileAccountIds null ("Todos") → todos.
export function filtrarPerfilDemonstrativo(transactions, reserveFunctions, profileAccountIds) {
  if (!profileAccountIds) return transactions
  const funcAccById = new Map((reserveFunctions || []).map(f => [f.id, f.accountId]))
  const txById = new Map((transactions || []).map(t => [t.id, t]))
  return transactions.filter(tx => {
    if (isInvestimentoSombra(tx)) {
      const dono = contaDonaDoEspelho(tx, txById, funcAccById)
      return dono != null && profileAccountIds.has(dono)
    }
    if (tx.reservaAuto === true) {
      const fAcc = funcAccById.get(tx.reservaFuncaoId)
      return fAcc != null && profileAccountIds.has(fAcc)
    }
    return lancamentoNasContas(tx, profileAccountIds)
  })
}

// O resgate abate a categoria porque o depósito já contou como despesa nela (depósito + gasto −
// resgate = a despesa uma vez só). Função sem depósito até a data do resgate não tem o que abater:
// a despesa só apareceu no gasto, e abater a faria sumir. Sem função (espelho legado): abate.
export function criarTesteAbatimento(transactions, reserveFunctions) {
  if (!transactions) return () => true
  const funcPorCategoria = new Map()
  for (const f of reserveFunctions || []) {
    if (f.categoryId && !funcPorCategoria.has(f.categoryId)) funcPorCategoria.set(f.categoryId, f.id)
  }
  const primeiroDeposito = new Map()
  for (const tx of transactions || []) {
    if (tx.reservaAuto !== true || tx.type !== 'expense' || isResgateReservaSombra(tx) || isInvestimentoSombra(tx)) continue
    const func = tx.reservaFuncaoId || funcPorCategoria.get(tx.categoryId)
    if (!func) continue
    const atual = primeiroDeposito.get(func)
    if (!atual || tx.date < atual) primeiroDeposito.set(func, tx.date)
  }
  return (tx) => {
    if (!tx.reservaFuncaoId) return true
    const primeiro = primeiroDeposito.get(tx.reservaFuncaoId)
    return !!primeiro && tx.date >= primeiro
  }
}

// `transactions` = todos os lançamentos, sem filtro de período (o depósito pode ser de meses antes).
export function criarRegraDemonstrativo(reserveFunctions, accounts, transactions) {
  return regraDosConjuntos({
    reserveFunctions,
    aplicSet: aplicacaoAccountIds(accounts || []),
    reservaSet: new Set((accounts || []).filter(a => a.isReserva).map(a => a.id)),
    reservaDespesaFuncSet: reservaDespesaFuncIds(reserveFunctions),
    transactions,
  })
}

// Mesma regra a partir dos conjuntos já calculados (o Demonstrativo os recebe prontos).
export function regraDosConjuntos({ reserveFunctions, aplicSet, reservaSet, reservaDespesaFuncSet, transactions }) {
  // Espelhos legados (reservaFuncaoId null) de funções "despesa" reconhecidos pela categoria.
  const reservaDespesaCategorySet = new Set(
    (reserveFunctions || []).filter(f => f.exibirComoDespesa).map(f => f.categoryId).filter(Boolean)
  )
  const resgateAbate = criarTesteAbatimento(transactions, reserveFunctions)
  const isReservaGerSombra = (tx) =>
    tx.reservaAuto === true &&
    !isInvestimentoSombra(tx) &&
    !reservaDespesaFuncSet.has(tx.reservaFuncaoId) &&
    !(tx.reservaFuncaoId == null && reservaDespesaCategorySet.has(tx.categoryId))
  const ehDespesa = (tx) => !isReservaGerSombra(tx) && countsAsReportExpense(tx, aplicSet, reservaDespesaFuncSet, reservaSet)
  const ehCompensacao = (tx) => !isReservaGerSombra(tx) && tx.type === 'income' && isResgateReservaSombra(tx)
    && countsAsReportIncome(tx, reservaDespesaFuncSet, reservaSet) && resgateAbate(tx)
  // O resgate nunca é receita: quando abate, abate a despesa; quando não abate, some.
  const ehReceita = (tx) => !isReservaGerSombra(tx) && tx.type === 'income' && !isResgateReservaSombra(tx)
    && countsAsReportIncome(tx, reservaDespesaFuncSet, reservaSet)
  return { isReservaGerSombra, ehDespesa, ehCompensacao, ehReceita }
}

// Receita e despesa do período pela regra do Demonstrativo, para o gráfico dos 6 meses mostrar os
// mesmos números do relatório.
export function totaisDoDemonstrativo(transactions, { start, end }, regra) {
  let receita = 0
  let despesa = 0
  for (const tx of transactions || []) {
    if (!(tx.date >= start && tx.date <= end) || isInvestAutoOrigin(tx)) continue
    if (regra.ehReceita(tx)) receita += tx.amount
    else if (regra.ehDespesa(tx)) despesa += tx.amount
    else if (regra.ehCompensacao(tx)) despesa -= tx.amount
  }
  return { receita: Math.round(receita * 100) / 100, despesa: Math.round(despesa * 100) / 100 }
}

// { [categoryId | '']: valor } no período (despesa +, compensação do resgate −).
export function despesaPorCategoria(transactions, { start, end }, regra) {
  const out = {}
  for (const tx of transactions || []) {
    if (!(tx.date >= start && tx.date <= end) || isInvestAutoOrigin(tx)) continue
    const v = regra.ehDespesa(tx) ? tx.amount : regra.ehCompensacao(tx) ? -tx.amount : 0
    if (!v) continue
    const k = tx.categoryId || ''
    out[k] = Math.round(((out[k] || 0) + v) * 100) / 100
  }
  return out
}
