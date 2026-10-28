// Classificação de receita/despesa dos totais do mês (KPIs "Receitas do Mês" / "Despesas do Mês"
// do Painel e card do Início mobile). Extraído de DashboardPanel sem mudança de regra — as duas
// telas usam esta mesma função para mostrar os mesmos números.
import {
  isReservaDepositoDespesa, isReservaMovimentoExcluido, isResgateReservaSombra, reservaDespesaFuncIds,
} from '../components/shared/utils'
import { isInvestAutoOrigin } from './origins'
import { isoLocal } from './hoje'

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
  // Sombra de reserva de função com exibir_como_despesa = FALSE (ou sem função vinculada) → entra
  // no card "Reservas", não em Receitas/Despesas. Funções com exibir_como_despesa = TRUE seguem
  // dentro das despesas (reconhecidas por reservaFuncaoId ou pelo category_id da função).
  const isReservaGerSombra = (t) =>
    t.reservaAuto === true && !reservaDespesaFuncSet.has(t.reservaFuncaoId) && !(t.reservaFuncaoId == null && reservaDespesaCategorySet.has(t.categoryId))
  const isExpenseTx = (t) => {
    // Movimento de reserva sem categoria → card Reservas, fora das despesas.
    if (isReservaGerSombra(t)) return false
    // Prioridade: movimento de reserva de função não-despesa nunca conta como despesa.
    if (isReservaMovimentoExcluido(t, reservaDespesaFuncSet, reservaSet)) return false
    // Perna de despesa do RESGATE de reserva não conta (o resgate é receita de compensação).
    if (isResgateReservaSombra(t)) return false
    return t.type === 'expense' || isReservaDepositoDespesa(t, reservaDespesaFuncSet, reservaSet)
  }
  // Receita: exclui as sombras de reserva de função não-despesa (ex.: "Resgate Reserva: X"
  // income), mantendo o par receita+despesa neutro quando a reserva é poupança.
  const isIncomeTx = (t) =>
    t.type === 'income' && !isReservaGerSombra(t) && !isReservaMovimentoExcluido(t, reservaDespesaFuncSet, reservaSet)
  return { isReservaGerSombra, isExpenseTx, isIncomeTx }
}

// Lançamentos do período (sem investAuto, invisíveis nos relatórios/totais) e seus totais.
export function totaisDoPeriodo(transactions, { start, end }, { isIncomeTx, isExpenseTx }) {
  const periodTxs = (transactions || []).filter(tx => tx.date >= start && tx.date <= end && !isInvestAutoOrigin(tx))
  const income = periodTxs.filter(isIncomeTx).reduce((s, t) => s + t.amount, 0)
  const expense = periodTxs.filter(isExpenseTx).reduce((s, t) => s + t.amount, 0)
  return { periodTxs, income, expense }
}

// Período financeiro (getFinancialPeriod) → { start, end } em 'YYYY-MM-DD', como o Painel usa.
export function periodoStr(period) {
  return { start: isoLocal(period.start), end: isoLocal(period.end) }
}
