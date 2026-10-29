// Regra de DESPESA POR CATEGORIA do Demonstrativo Financeiro — fonte única, usada também pelo
// Orçamento (os dois mostram o mesmo número por categoria no mesmo período):
//   • despesa = countsAsReportExpense (despesas, aportes categorizados, espelho "Reserva: X" do
//     depósito em função "exibir como despesa"); a perna de despesa do resgate não conta;
//   • receita de compensação do resgate ("Resgate Reserva: X", perna receita) ABATE a categoria
//     (pode ficar negativa);
//   • espelhos de funções que NÃO são "exibir como despesa" (Reservas Gerais, Fundos de
//     Investimento…) ficam fora (bloco Reservas do Demonstrativo).
import {
  aplicacaoAccountIds, countsAsReportExpense, countsAsReportIncome, isResgateReservaSombra, reservaDespesaFuncIds,
} from '../components/shared/utils.js'
import { isInvestAutoOrigin } from './origins.js'

// Perfil ativo: espelhos de reserva (reservaAuto) ficam só quando a conta da FUNÇÃO é do perfil;
// os demais, quando uma das contas é do perfil. profileAccountIds null ("Todos") → todos.
export function filtrarPerfilDemonstrativo(transactions, reserveFunctions, profileAccountIds) {
  if (!profileAccountIds) return transactions
  const funcAccById = new Map((reserveFunctions || []).map(f => [f.id, f.accountId]))
  return transactions.filter(tx => {
    if (tx.reservaAuto === true) {
      const fAcc = funcAccById.get(tx.reservaFuncaoId)
      return fAcc != null && profileAccountIds.has(fAcc)
    }
    return profileAccountIds.has(tx.accountId) || profileAccountIds.has(tx.toAccountId)
  })
}

export function criarRegraDemonstrativo(reserveFunctions, accounts) {
  return regraDosConjuntos({
    reserveFunctions,
    aplicSet: aplicacaoAccountIds(accounts || []),
    reservaSet: new Set((accounts || []).filter(a => a.isReserva).map(a => a.id)),
    reservaDespesaFuncSet: reservaDespesaFuncIds(reserveFunctions),
  })
}

// Mesma regra a partir dos conjuntos já calculados (o Demonstrativo os recebe prontos).
export function regraDosConjuntos({ reserveFunctions, aplicSet, reservaSet, reservaDespesaFuncSet }) {
  // Espelhos legados (reservaFuncaoId null) de funções "despesa" reconhecidos pela categoria.
  const reservaDespesaCategorySet = new Set(
    (reserveFunctions || []).filter(f => f.exibirComoDespesa).map(f => f.categoryId).filter(Boolean)
  )
  const isReservaGerSombra = (tx) =>
    tx.reservaAuto === true &&
    !reservaDespesaFuncSet.has(tx.reservaFuncaoId) &&
    !(tx.reservaFuncaoId == null && reservaDespesaCategorySet.has(tx.categoryId))
  const ehDespesa = (tx) => !isReservaGerSombra(tx) && countsAsReportExpense(tx, aplicSet, reservaDespesaFuncSet, reservaSet)
  const ehCompensacao = (tx) => !isReservaGerSombra(tx) && tx.type === 'income' && isResgateReservaSombra(tx)
    && countsAsReportIncome(tx, reservaDespesaFuncSet, reservaSet)
  return { isReservaGerSombra, ehDespesa, ehCompensacao }
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
