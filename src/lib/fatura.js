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
 * Retorna a data (YYYY-MM-DD) do dia `financialStartDay` do mês ANTERIOR ao mês de
 * vencimento da fatura. Usado nas transferências gerenciais das parcelas 2..N do Grupo G
 * (a provisão é feita no início do ciclo anterior ao ciclo da fatura da parcela).
 * Trata a virada de ano (faturaRef de janeiro → dezembro do ano anterior).
 */
export function prevMonthScheduleDate(faturaRef, financialStartDay) {
  const [mm, yyyy] = faturaRef.split('/')
  // mm é 1-indexed; new Date com (mm - 2) já recua um mês (e -1 a mais p/ o índice 0-based).
  const prev = new Date(Number(yyyy), Number(mm) - 2, 1)
  const pM = String(prev.getMonth() + 1).padStart(2, '0')
  const pY = prev.getFullYear()
  return `${pY}-${pM}-${String(financialStartDay).padStart(2, '0')}`
}

/**
 * Chave única de um agendamento gerencial: identifica fatura + cartão.
 */
export function gerencialKey(cardId, faturaRef) {
  return `ger_${cardId}_${faturaRef.replace('/', '_')}`
}

/**
 * Data (objeto Date) do dia `day` no mês (year, monthIndex 0-based), com o dia CLAMPADO ao
 * último dia daquele mês.
 *
 * new Date(y, mo, day) não rejeita um dia inexistente: `new Date(2026, 1, 31)` faz rollover
 * SILENCIOSO para 03/03. Um cartão com dueDay 31 (o AccountForm aceita até 31) tinha o
 * vencimento de fevereiro contado como se fosse em março, deslocando os dias-até-vencer dos
 * alertas. Aqui fevereiro dá 28 (ou 29 em bissexto), como esperado.
 */
export function dueDateInMonth(year, monthIndex, day) {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate()
  return new Date(year, monthIndex, Math.min(day, lastDay))
}
