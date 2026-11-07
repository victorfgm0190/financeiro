import { proximaEfetiva } from './fluxoCaixa'
import { diasEntre } from './dashboardHoje'

// Lembretes de agendamentos (página de Alertas e contador do menu): próxima ocorrência EFETIVA
// (override) de cada agendamento que cai de hoje até `remindDaysBefore` dias de calendário à frente
// (padrão 3; 0 ou menos = sem lembrete). Dias contados data contra data (diasEntre), sem hora:
// amanhã = 1, hoje = 0. `hoje` = YYYY-MM-DD (useHoje). → [{ schedule, next, dias }].
export function lembretesAgendamentos(schedules, getNextOccurrences, hoje) {
  const out = []
  for (const schedule of schedules) {
    const remindDays = schedule.remindDaysBefore ?? 3
    if (remindDays <= 0) continue
    const next = proximaEfetiva(schedule, getNextOccurrences)
    if (!next) continue
    const dias = diasEntre(hoje, next.date.slice(0, 10))
    if (dias < 0 || dias > remindDays) continue
    out.push({ schedule, next, dias })
  }
  return out
}
