// Classificação de receita/despesa dos totais do mês (KPIs "Receitas do Mês" / "Despesas do Mês"
// do Painel e card do Início mobile). As duas telas usam esta mesma função para mostrar os mesmos números.
import {
  aplicacaoAccountIds, isEntradaDeBem, isInvestimentoSombra, isReservaMovimentoExcluido, isResgateReservaSombra, reservaDespesaFuncIds,
} from '../components/shared/utils.js'
import { isInvestAutoOrigin } from './origins.js'
import { isoLocal } from './hoje.js'

// reserveFunctions + contas do perfil → predicados de classificação.
export function criarClassificadores(reserveFunctions, accounts) {
  // Depósitos em reserva de funções marcadas "exibir como despesa" contam como despesa.
  const reservaDespesaFuncSet = reservaDespesaFuncIds(reserveFunctions)
  // category_ids das funções com exibir_como_despesa = true — reconhece sombras legadas
  // (reservaFuncaoId = null) pelo category_id, mantendo-as nas despesas (fora do card Reservas).
  const reservaDespesaCategorySet = new Set(
    (reserveFunctions || []).filter(f => f.exibirComoDespesa).map(f => f.categoryId).filter(Boolean)
  )
  const reservaSet = new Set((accounts || []).filter(a => a.isReserva).map(a => a.id))
  const aplicSet = aplicacaoAccountIds(accounts)
  // Sombra de reserva de função com exibir_como_despesa = FALSE (ou sem função vinculada) → entra
  // no card "Reservas", não em Receitas/Despesas. Funções com exibir_como_despesa = TRUE seguem
  // dentro das despesas (reconhecidas por reservaFuncaoId ou pelo category_id da função).
  const isReservaGerSombra = (t) =>
    t.reservaAuto === true && !isInvestimentoSombra(t) && !reservaDespesaFuncSet.has(t.reservaFuncaoId) && !(t.reservaFuncaoId == null && reservaDespesaCategorySet.has(t.categoryId))
  const isExpenseTx = (t) => {
    // Movimento de reserva sem categoria → card Reservas, fora das despesas.
    if (isReservaGerSombra(t)) return false
    // Prioridade: movimento de reserva de função não-despesa nunca conta como despesa.
    if (isReservaMovimentoExcluido(t, reservaDespesaFuncSet, reservaSet)) return false
    // Perna de despesa do RESGATE de reserva não conta (o resgate é receita de compensação).
    if (isResgateReservaSombra(t)) return false
    // O depósito na reserva conta UMA vez: pelo espelho "Reserva: X" (despesa, na categoria da
    // função). A transferência conta → reserva não entra (contava de novo, sem categoria).
    // A entrada em dinheiro de um bem sem espelho também é despesa, como no Demonstrativo.
    return t.type === 'expense' || isEntradaDeBem(t, aplicSet)
  }
  // Resgate de função "despesa": no líquido abate as despesas; no bruto soma nas receitas.
  const isCompensacaoTx = (t) => t.type === 'income' && isResgateReservaSombra(t)
    && !isReservaGerSombra(t) && !isReservaMovimentoExcluido(t, reservaDespesaFuncSet, reservaSet)
  // Receita sem o resgate; o resgate entra por modo em totaisDoPeriodo.
  const isIncomeTx = (t) =>
    t.type === 'income' && !isReservaGerSombra(t) && !isReservaMovimentoExcluido(t, reservaDespesaFuncSet, reservaSet)
    && !isResgateReservaSombra(t)
  return { isReservaGerSombra, isExpenseTx, isIncomeTx, isCompensacaoTx }
}

// Lançamentos do período (sem investAuto, invisíveis nos relatórios/totais) e seus totais.
// modo 'cheio' (bruto): despesa inteira e resgate nas receitas. 'liquido': despesa − resgate e o resgate
// fora das receitas. O saldo (income − expense) é o mesmo nos dois modos.
export function totaisDoPeriodo(transactions, { start, end }, { isIncomeTx, isExpenseTx, isCompensacaoTx }, modo = 'cheio') {
  const periodTxs = (transactions || []).filter(tx => tx.date >= start && tx.date <= end && !isInvestAutoOrigin(tx))
  const soma = (lista) => lista.reduce((s, t) => s + t.amount, 0)
  const resgates = isCompensacaoTx ? periodTxs.filter(isCompensacaoTx) : []
  const compensTxs = modo === 'liquido' ? resgates : []
  const resgatesEmReceita = modo === 'liquido' ? [] : resgates
  const income = soma(periodTxs.filter(isIncomeTx)) + soma(resgatesEmReceita)
  const expense = soma(periodTxs.filter(isExpenseTx)) - soma(compensTxs)
  return { periodTxs, income, expense, compensTxs, resgatesEmReceita }
}

// Período financeiro (getFinancialPeriod) → { start, end } em 'YYYY-MM-DD', como o Painel usa.
export function periodoStr(period) {
  return { start: isoLocal(period.start), end: isoLocal(period.end) }
}
