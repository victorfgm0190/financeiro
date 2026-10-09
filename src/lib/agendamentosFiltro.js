// Data exibida e filtros da lista de Agendamentos. Sem React: usada pelo SchedulePanel e testável.
import { occEfetiva } from './fluxoCaixa.js'

// Data de vencimento EXIBIDA (e usada no particionamento da lista) para um agendamento
// RECORRENTE. Para 'once'/faturas e concluídos (nextDate null) devolve nextDate inalterado.
// É puramente visual: as ações (pagar/pular/estornar) continuam usando nextDate (a ocorrência
// pendente real).
export function scheduleDisplayDueDate(schedule, nextDate, getNextOccurrences, todayStr) {
  // Exceção da ocorrência ("Próximas ocorrências" do formulário) manda na data EXIBIDA.
  //
  // Ela é guardada em `overrides[dataOriginal].date` e NÃO altera a data original — que é a
  // chave de registered/skipped e continua sendo o que as ações usam (o `nextDate` deste
  // arquivo). Sem passar por occEfetiva aqui, mover uma ocorrência de 09/09 para 11/09 gravava
  // certo, sincronizava certo e não mudava nada na linha: o cabeçalho seguia em 09/09 enquanto
  // a sub-lista de próximas ocorrências (que já usa occEfetiva) mostrava 11/09.
  const efetiva = (d) => (d ? occEfetiva(schedule, d).date : d)

  const proxima = efetiva(nextDate)
  if (!proxima || (schedule.frequency || 'once') === 'once') return proxima
  // Ocorrência pendente EM ATRASO manda: ela é a próxima NÃO PAGA e tem de aparecer com a
  // própria data. Preferir a próxima futura (comportamento anterior) tirava a linha do bucket
  // "Em atraso" — particionado por displayDate — enquanto o pagamento seguia em aberto.
  //
  // O teste é sobre a data EFETIVA: uma ocorrência vencida que foi adiada para o futuro não
  // está mais em atraso, e cair no bucket "Em atraso" exibindo uma data futura seria pior que
  // o bug original.
  if (proxima < todayStr) return proxima
  // Sem atraso: "Data de Vencimento Atual" do formulário, desde que ela mesma não seja uma data
  // já consumida (nextOccurrence pode ficar para trás de registered/skipped).
  const ancora = efetiva(schedule.nextOccurrence)
  if (ancora && ancora >= todayStr) return ancora
  return efetiva(getNextOccurrences(schedule, 24).find(d => efetiva(d) >= todayStr)) || proxima
}

// Dia 'YYYY-MM-DD' de um valor de data. String ISO (com ou sem hora) → os 10 primeiros caracteres
// (o dia como foi gravado, sem converter fuso). Date → dia LOCAL. Nunca new Date('YYYY-MM-DD'),
// que é lido como UTC e no Brasil (UTC-3) cai no dia anterior.
export function diaLocal(v) {
  if (!v) return ''
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return ''
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
  }
  const s = String(v)
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : ''
}

// Data que a coluna "Data" mostra para o agendamento (mesma regra da linha): ocorrência pendente
// com override de data aplicado (scheduleDisplayDueDate); sem pendente, a data de início.
export function dataExibidaAgendamento(s, getNextOccurrences, todayStr) {
  const next = getNextOccurrences(s, 1)[0] || null
  return diaLocal(scheduleDisplayDueDate(s, next, getNextOccurrences, todayStr) || s.startDate)
}

// Filtros em tempo real da lista. Cada filtro é independente (nenhum zera outro). Data De/Até são
// inclusivos e comparados como dia 'YYYY-MM-DD' contra a data EXIBIDA.
export function filtrarAgendamentos(schedules, { desc = '', payee = '', categoryId = '', from = '', to = '', min = null, max = null }, getNextOccurrences, todayStr) {
  const d = desc.trim().toLowerCase()
  const p = payee.trim().toLowerCase()
  const de = diaLocal(from)
  const ate = diaLocal(to)
  if (!d && !p && !categoryId && !de && !ate && min === null && max === null) return schedules
  return schedules.filter(s => {
    if (d && !(s.description || '').toLowerCase().includes(d)) return false
    if (p && !(s.payee || '').toLowerCase().includes(p)) return false
    if (categoryId && s.categoryId !== categoryId) return false
    if (min !== null || max !== null) {
      // Passa se o valor BASE OU o valor EFETIVO da próxima ocorrência (override) cair no range.
      const baseAmt = Number(s.amount) || 0
      const nextDate = getNextOccurrences(s, 1)[0] || null
      const effAmt = nextDate ? Number(occEfetiva(s, nextDate).amount) : baseAmt
      const inRange = (a) => (min === null || a >= min) && (max === null || a <= max)
      if (!inRange(baseAmt) && !inRange(effAmt)) return false
    }
    if (de || ate) {
      const dia = dataExibidaAgendamento(s, getNextOccurrences, todayStr)
      if (de && dia < de) return false
      if (ate && dia > ate) return false
    }
    return true
  })
}
