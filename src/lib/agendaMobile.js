// Agenda no MOBILE (abas Pendentes | Atrasados | Pagos, agrupamento por semana e total a pagar
// no mês). Só exibição: particiona as linhas que o SchedulesTable já monta (buildScheduleGroups)
// com a MESMA regra do bucket "Em atraso" (displayDate < hoje). Sem React — testável.
import { addDays, format, startOfWeek } from 'date-fns'
import { occEfetiva } from './fluxoCaixa.js'

const d12 = (s) => new Date(String(s).slice(0, 10) + 'T12:00:00')
const ddmm = (dt) => format(dt, 'dd/MM')

// Semana (segunda a domingo) de uma data 'YYYY-MM-DD' → { key: segunda, label }.
export function semanaDe(dateStr) {
  const seg = startOfWeek(d12(dateStr), { weekStartsOn: 1 })
  return { key: format(seg, 'yyyy-MM-dd'), label: `Semana de ${ddmm(seg)} – ${ddmm(addDays(seg, 6))}` }
}

// items → [{ key, label, items }] na ordem das semanas (asc; desc com `desc`). A ordem dos itens
// dentro da semana é a de entrada.
export function agruparPorSemana(items, dataDe, { desc = false } = {}) {
  const map = new Map()
  for (const it of items) {
    const d = dataDe(it)
    if (!d) continue
    const { key, label } = semanaDe(d)
    if (!map.has(key)) map.set(key, { key, label, items: [] })
    map.get(key).items.push(it)
  }
  return [...map.values()].sort((a, b) => (desc ? b.key.localeCompare(a.key) : a.key.localeCompare(b.key)))
}

// rows (buildScheduleGroups) → { pendentes, atrasados, concluidos }. Atrasado = displayDate < hoje
// (mesma regra do "Em atraso" da tabela); concluído = sem próxima ocorrência.
export function particionarAgenda(rows, today) {
  const porData = (a, b) => a.displayDate.localeCompare(b.displayDate)
  return {
    atrasados: rows.filter(r => r.displayDate && r.displayDate < today).sort(porData),
    pendentes: rows.filter(r => r.displayDate && r.displayDate >= today).sort(porData),
    concluidos: rows.filter(r => !r.nextDate),
  }
}

// Ocorrências registradas (pagas) nos últimos `dias` até hoje, mais recentes primeiro.
// → [{ schedule, date (data original), dataEfetiva, amount }]
export function pagosRecentes(schedules, today, dias = 60) {
  const desde = format(addDays(d12(today), -dias), 'yyyy-MM-dd')
  const out = []
  for (const s of schedules) {
    for (const occ of s.registered || []) {
      const { date, amount } = occEfetiva(s, occ)
      if (date < desde || date > today) continue
      out.push({ schedule: s, date: occ, dataEfetiva: date, amount: Number(amount) || 0 })
    }
  }
  return out.sort((a, b) => b.dataEfetiva.localeCompare(a.dataEfetiva))
}

// Total a pagar no mês de `today`: Σ valor EFETIVO das ocorrências PENDENTES de despesa cuja data
// efetiva cai no mês corrente. `incluir(s)` filtra agendamentos (ex.: fora os sintéticos).
export function totalAPagarNoMes(schedules, getNextOccurrences, today, incluir = () => true) {
  const ym = today.slice(0, 7)
  let total = 0
  for (const s of schedules) {
    if (s.transactionType !== 'expense' || !incluir(s)) continue
    for (const occ of getNextOccurrences(s, 400)) {
      const { date, amount } = occEfetiva(s, occ)
      if (date.slice(0, 7) === ym) total += Number(amount) || 0
    }
  }
  return Math.round(total * 100) / 100
}
