// Motor de ocorrências dos agendamentos — funções PURAS, sem React e sem I/O.
// Extraído de AppContext.jsx (sem alteração de comportamento) para permitir teste
// direto: o contexto arrasta o grafo inteiro de db/api e não é importável isolado.
// `next_occurrence` re-ancora a série (dia de vencimento atual); null → desde start_date.
import { addDays, addWeeks, addMonths, addYears, format } from 'date-fns'

// Constrói uma Date ao MEIO-DIA local a partir de uma string de data (usa só os 10 primeiros
// chars 'YYYY-MM-DD'). Evita o off-by-one de fuso: parseISO/new Date de uma string com hora 'Z'
// (ex.: start_date lido como '2026-06-28T00:00:00Z') recuaria 1 dia em fusos negativos (BRT).
export function parseScheduleDate(dateStr) {
  return new Date(String(dateStr).slice(0, 10) + 'T12:00:00')
}

// Retorna todas as ocorrências pendentes de um agendamento até upToDateStr (inclusive)
export function computePendingUpTo(schedule, upToDateStr) {
  const allDone = new Set([...(schedule.registered || []), ...(schedule.skipped || [])])
  const pending = []
  // next_occurrence re-ancora a série (dia de vencimento atual); null → desde start_date.
  let current = parseScheduleDate(schedule.nextOccurrence || schedule.startDate)
  const maxInstallments = schedule.occurrenceType === 'installment' ? (schedule.installments || 1) : 9999
  // Parcelas já consumidas (registradas OU puladas) anteriores ao ponto de partida (next_occurrence)
  // não são iteradas no laço — pré-contamos para que `maxInstallments` reflita o total REAL
  // consumido. Sem isso, um parcelado com autoRegister e ocorrências já registradas/puladas
  // recomeçava a contagem do zero e auto-gerava uma parcela FANTASMA além do total (mesmo bug de
  // computeOccurrences, corrigido em 6ba73c6).
  const startStr = format(current, 'yyyy-MM-dd')
  let count = [...allDone].filter(d => d < startStr).length
  while (count < maxInstallments) {
    const dateStr = format(current, 'yyyy-MM-dd')
    if (dateStr > upToDateStr) break
    if (!allDone.has(dateStr)) pending.push(dateStr)
    count++
    switch (schedule.frequency) {
      case 'daily':         current = addDays(current, 1); break
      case 'weekly':        current = addWeeks(current, 1); break
      case 'biweekly':      current = addWeeks(current, 2); break
      case 'monthly':       current = addMonths(current, 1); break
      case 'bimonthly':     current = addMonths(current, 2); break
      case 'quarterly':     current = addMonths(current, 3); break
      case 'quadrimestral': current = addMonths(current, 4); break
      case 'semiannual':    current = addMonths(current, 6); break
      case 'annual':        current = addYears(current, 1); break
      default: break
    }
    if (schedule.frequency === 'once') break
  }
  return pending
}

// Avança uma data (YYYY-MM-DD) por UM intervalo da frequência informada (ex.: semanal → +7d).
// Usado ao efetivar uma provisão recorrente: a série reinicia em data_real + 1 intervalo.
export function advanceByFrequency(dateStr, frequency) {
  let d = parseScheduleDate(dateStr)
  switch (frequency) {
    case 'daily':         d = addDays(d, 1); break
    case 'weekly':        d = addWeeks(d, 1); break
    case 'biweekly':      d = addWeeks(d, 2); break
    case 'monthly':       d = addMonths(d, 1); break
    case 'bimonthly':     d = addMonths(d, 2); break
    case 'quarterly':     d = addMonths(d, 3); break
    case 'quadrimestral': d = addMonths(d, 4); break
    case 'semiannual':    d = addMonths(d, 6); break
    case 'annual':        d = addYears(d, 1); break
    default: break
  }
  return format(d, 'yyyy-MM-dd')
}

// Próximas `count` ocorrências PENDENTES de um agendamento (exclui registered/skipped).
// Puro — reusado por getNextOccurrences (contexto) e pelo avanço no registro. next_occurrence
// re-ancora a série (dia de vencimento atual); null → desde start_date.
export function computeOccurrences(schedule, count = 12) {
  const occurrences = []
  const registered = schedule.registered || []
  const skipped = schedule.skipped || []
  let current = parseScheduleDate(schedule.nextOccurrence || schedule.startDate)
  const maxInstallments = schedule.occurrenceType === 'installment' ? schedule.installments : Infinity
  const allDone = [...registered, ...skipped]
  // Parcelas já consumidas (registradas OU puladas) que ficam ANTES do ponto de partida
  // (next_occurrence) não são iteradas no laço — pré-contamos para que `maxInstallments` reflita
  // o total REAL consumido. Sem isso, registrar/pular a parcela N reancorava next_occurrence e a
  // contagem recomeçava do zero, gerando uma parcela FANTASMA além do total (ex.: 2x virava 3x).
  const startStr = format(current, 'yyyy-MM-dd')
  let totalOccurrences = allDone.filter(d => d < startStr).length

  while (occurrences.length < count && totalOccurrences < maxInstallments) {
    const dateStr = format(current, 'yyyy-MM-dd')
    totalOccurrences++
    if (!allDone.includes(dateStr)) occurrences.push(dateStr)
    if (occurrences.length >= count) break
    switch (schedule.frequency) {
      case 'daily': current = addDays(current, 1); break
      case 'weekly': current = addWeeks(current, 1); break
      case 'biweekly': current = addWeeks(current, 2); break
      case 'monthly': current = addMonths(current, 1); break
      case 'bimonthly': current = addMonths(current, 2); break
      case 'quarterly': current = addMonths(current, 3); break
      case 'quadrimestral': current = addMonths(current, 4); break
      case 'semiannual': current = addMonths(current, 6); break
      case 'annual': current = addYears(current, 1); break
      default: break
    }
    if (schedule.frequency === 'once') break
  }
  return occurrences
}

// Aplica o novo array `registered` a um agendamento e, para RECORRENTES, AVANÇA next_occurrence
// p/ a próxima ocorrência pendente REAL (não o displayDueDate visual). Persistido no banco →
// destrava o "Em atraso" quando o agendamento tinha uma next_occurrence antiga fixada. Sem mais
// pendências → next_occurrence null. 'once' (inclui pagamento_fatura) mantém o comportamento
// original — só o array `registered` (montado pelo call site) e confirmado.
export function registerAndAdvance(s, registered) {
  if ((s.frequency || 'once') === 'once') return { ...s, registered, confirmado: false }
  const nextOccurrence = computeOccurrences({ ...s, registered }, 1)[0] ?? null
  return { ...s, registered, nextOccurrence, confirmado: false }
}
