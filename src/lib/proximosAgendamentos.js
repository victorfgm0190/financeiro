import { occEfetiva } from './fluxoCaixa'

// Somar dias a uma data YYYY-MM-DD no calendário local (sem UTC).
export function somarDias(iso, n) {
  const [y, m, d] = iso.split('-').map(Number)
  const r = new Date(y, m - 1, d + n)
  return `${r.getFullYear()}-${String(r.getMonth() + 1).padStart(2, '0')}-${String(r.getDate()).padStart(2, '0')}`
}

// Card "Próximos agendamentos" do Dashboard: atrasados + próximos 7 dias a partir de `hoje`
// (das 2 próximas ocorrências de cada agendamento), até 8 itens, por data. Data e valor EFETIVOS
// (override da ocorrência): a movida aparece no dia novo.
export function proximosAgendamentos(schedules, getNextOccurrences, hoje) {
  const in7 = somarDias(hoje, 7)
  const items = []
  for (const s of schedules) {
    for (const base of getNextOccurrences(s, 2)) {
      const { date, amount } = occEfetiva(s, base)
      if (date <= in7) items.push({ schedule: s, date, amount })
    }
  }
  return items.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8)
}
