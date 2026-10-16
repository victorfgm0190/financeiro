import { describe, it, expect } from 'vitest'
import { agendamentosPrevistosDaFatura } from './gerencialPrevistos'
import { totaisGerenciais } from './gerencialTotais'
import { computeOccurrences } from './occurrences'

// Mesma regra do getBillKey do CreditCardPanel: dia <= fechamento → fatura do mês; senão, a seguinte.
const billKeyOf = (closingDay) => (date) => {
  const [y, m, d] = date.split('-').map(Number)
  const dt = d <= closingDay ? new Date(y, m - 1, 1) : new Date(y, m, 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
}

// Caso real: MAYARA, NUBANK GI (fecha 15), 678,25 mensal contínuo desde 28/05/2026, grupo D;
// ocorrência de 28/09 movida para 16/10 (override só de data, sem amount).
const NUGI = 'acc_1780098885803'
const mayara = {
  id: 'sch_1781471551030', description: 'MAYARA', transactionType: 'expense', accountId: NUGI,
  amount: 678.25, frequency: 'monthly', occurrenceType: 'continuous', startDate: '2026-05-28',
  nextOccurrence: '2026-09-28', registered: ['2026-05-28', '2026-06-28', '2026-07-28', '2026-08-28'],
  skipped: [], overrides: { '2026-09-28': { date: '2026-10-16' } }, grupoGerencial: 'grp_D',
}
const prev = (schedules, billKey) => agendamentosPrevistosDaFatura({
  schedules, cardId: NUGI, billKey, getOccurrences: computeOccurrences, billKeyOf: billKeyOf(15),
})

describe('agendamentosPrevistosDaFatura — override de data/valor', () => {
  it('ocorrência 28/09 movida para 16/10 NÃO aparece na fatura de outubro', () => {
    expect(prev([mayara], '2026-10')).toEqual([])
  })

  it('aparece na fatura de novembro com a data efetiva 16/10 (sem dupla contagem com 28/10)', () => {
    const nov = prev([mayara], '2026-11')
    expect(nov.map(p => [p.date, p.dataBase, p.amount])).toEqual([
      ['2026-10-16', '2026-09-28', 678.25],
      ['2026-10-28', '2026-10-28', 678.25],
    ])
    // A data-base 28/09 não aparece em fatura nenhuma além desta.
    const todas = ['2026-09', '2026-10', '2026-11', '2026-12'].flatMap(k => prev([mayara], k))
    expect(todas.filter(p => p.dataBase === '2026-09-28')).toHaveLength(1)
  })

  it('override sem amount usa o valor da série (sem NaN)', () => {
    const [p] = prev([mayara], '2026-11')
    expect(Number.isFinite(p.amount)).toBe(true)
    expect(p.amount).toBe(678.25)
  })

  it('override de valor reflete no previsto e no total do grupo gerencial', () => {
    const comValor = { ...mayara, overrides: { '2026-09-28': { date: '2026-10-16', amount: 700 } } }
    const nov = prev([comValor], '2026-11')
    expect(nov.map(p => p.amount)).toEqual([700, 678.25])
    const grupos = [{ id: 'grp_D', number: 'D', name: 'D' }]
    const { items } = totaisGerenciais({ txs: [], previstos: nov, gerencialGroups: grupos })
    expect(items.find(i => i.g.id === 'grp_D').previsto).toBe(1378.25)
  })

  it('ocorrências registradas não entram como previstas', () => {
    expect(prev([mayara], '2026-09')).toEqual([]) // 28/08 registrada
  })
})
