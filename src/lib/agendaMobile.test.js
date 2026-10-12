import { describe, it, expect } from 'vitest'
import { semanaDe, agruparPorSemana, particionarAgenda, pagosRecentes, totalAPagarNoMes } from './agendaMobile'
import { computeOccurrences } from './occurrences'

describe('agendaMobile', () => {
  it('semanaDe: segunda a domingo', () => {
    expect(semanaDe('2026-10-14')).toEqual({ key: '2026-10-12', label: 'Semana de 12/10 – 18/10' })
    expect(semanaDe('2026-10-18').key).toBe('2026-10-12')
    expect(semanaDe('2026-10-19').key).toBe('2026-10-19')
  })

  it('agruparPorSemana mantém a ordem das semanas', () => {
    const g = agruparPorSemana([{ d: '2026-10-20' }, { d: '2026-10-13' }, { d: '2026-10-14' }], x => x.d)
    expect(g.map(s => s.key)).toEqual(['2026-10-12', '2026-10-19'])
    expect(g[0].items).toHaveLength(2)
    expect(agruparPorSemana([{ d: '2026-10-20' }, { d: '2026-10-13' }], x => x.d, { desc: true })[0].key).toBe('2026-10-19')
  })

  it('particionarAgenda: atrasado = displayDate < hoje', () => {
    const rows = [
      { schedule: { id: 'a' }, nextDate: '2026-10-05', displayDate: '2026-10-05' },
      { schedule: { id: 'b' }, nextDate: '2026-10-12', displayDate: '2026-10-12' },
      { schedule: { id: 'c' }, nextDate: '2026-10-01', displayDate: '2026-10-15' }, // adiada: não atrasa
      { schedule: { id: 'd' }, nextDate: null, displayDate: null },
    ]
    const p = particionarAgenda(rows, '2026-10-12')
    expect(p.atrasados.map(r => r.schedule.id)).toEqual(['a'])
    expect(p.pendentes.map(r => r.schedule.id)).toEqual(['b', 'c'])
    expect(p.concluidos.map(r => r.schedule.id)).toEqual(['d'])
  })

  it('pagosRecentes: registradas nos últimos 60 dias, mais recentes primeiro, valor efetivo', () => {
    const s = { id: 's', amount: 100, registered: ['2026-07-01', '2026-09-10', '2026-10-06'], overrides: { '2026-10-06': { amount: 120 } } }
    const p = pagosRecentes([s], '2026-10-12')
    expect(p.map(x => x.date)).toEqual(['2026-10-06', '2026-09-10'])
    expect(p[0].amount).toBe(120)
  })

  it('totalAPagarNoMes: só despesa pendente no mês corrente, com override', () => {
    const dia = { id: 'd', transactionType: 'expense', frequency: 'weekly', startDate: '2026-10-13', amount: 150, registered: [], skipped: [], overrides: { '2026-10-27': { amount: 200 } } }
    const rec = { id: 'r', transactionType: 'income', frequency: 'monthly', startDate: '2026-10-20', amount: 5000 }
    // 13, 20, 27 (200) de outubro; 03/11 fica de fora.
    expect(totalAPagarNoMes([dia, rec], computeOccurrences, '2026-10-12')).toBe(500)
    expect(totalAPagarNoMes([dia], computeOccurrences, '2026-10-12', () => false)).toBe(0)
  })
})
