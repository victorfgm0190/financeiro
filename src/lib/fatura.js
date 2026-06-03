/**
 * Determina a faturaRef (MM/YYYY do mês de fechamento) de um gasto no cartão.
 *
 * Regra (a fatura do mês M fecha no dia `closingDay` de M e vai do dia F+1 de M-1 ao dia F de M):
 *   dia <= closingDay → fatura do mês corrente
 *   dia >  closingDay → fatura do mês seguinte
 */
export function computeFaturaRef(txDate, closingDay) {
  const day = txDate.getDate()
  let m, y
  if (day <= closingDay) {
    m = txDate.getMonth()       // 0-indexed
    y = txDate.getFullYear()
  } else {
    const next = new Date(txDate.getFullYear(), txDate.getMonth() + 1, 1)
    m = next.getMonth()
    y = next.getFullYear()
  }
  return `${String(m + 1).padStart(2, '0')}/${y}`
}

/**
 * Retorna a data (YYYY-MM-DD) do agendamento de devolução:
 * dia `financialStartDay` do mês de vencimento da fatura.
 */
export function computeScheduleDate(faturaRef, financialStartDay) {
  const [mm, yyyy] = faturaRef.split('/')
  const day = String(financialStartDay).padStart(2, '0')
  return `${yyyy}-${mm}-${day}`
}

/**
 * Retorna a data (YYYY-MM-DD) do agendamento de resgate parcelado:
 * dia `financialStartDay` do mês SEGUINTE ao mês de vencimento da fatura.
 */
export function nextMonthScheduleDate(faturaRef, financialStartDay) {
  const [mm, yyyy] = faturaRef.split('/')
  const next = new Date(Number(yyyy), Number(mm), 1)
  const nM = String(next.getMonth() + 1).padStart(2, '0')
  const nY = next.getFullYear()
  return `${nY}-${nM}-${String(financialStartDay).padStart(2, '0')}`
}

/**
 * Chave única de um agendamento gerencial: identifica fatura + cartão.
 */
export function gerencialKey(cardId, faturaRef) {
  return `ger_${cardId}_${faturaRef.replace('/', '_')}`
}
