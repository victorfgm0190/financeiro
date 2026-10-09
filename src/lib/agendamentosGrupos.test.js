import { describe, it, expect } from 'vitest'
import { buildScheduleGroups, seriesKeyOf } from './agendamentosGrupos'

// getNextOccurrences simplificado: devolve as próximas datas pendentes declaradas no fixture.
const getNext = (s, n = 1) => (s._next || []).slice(0, n)
const linhas = (groups) => groups.map(g => ({ id: g.schedule.id, n: g.futureItems.length }))

// Dois resgates AVULSOS ("Será pago com reserva"): agendamentos distintos, mesma data, mesma rota.
const resgate = (id, description, amount) => ({
  id, description, amount, tipo: 'resgate_reserva', transactionType: 'transfer',
  accountId: 'acc_res_ca', toAccountId: 'acc_itau', frequency: 'once',
  startDate: '2026-10-14', _next: ['2026-10-14'], sourceTxId: `tx_${id}`, overrides: {},
})
const salao = resgate('sch_salao', 'Resgate Reserva - Salão Gl', 500)
const aniversario = resgate('sch_aniv', 'Resgate Reserva - Aniversário Gl e Victor', 123)

// Série de fatura: um agendamento por fatura do MESMO cartão/origem (ids fsch_*).
const fatura = (yyyymm, date, amount) => ({
  id: `fsch_acc_card_${yyyymm}_resgate_reserva_acc_res_ca`, tipo: 'resgate_reserva', transactionType: 'transfer',
  accountId: 'acc_res_ca', toAccountId: 'acc_itau', cardId: 'acc_card', frequency: 'once',
  description: `Resgate Reserva Card - Fatura ${yyyymm}`, amount, startDate: date, _next: [date],
})

describe('buildScheduleGroups — resgates avulsos', () => {
  it('dois resgates de agendamentos diferentes, mesma data e rota → 2 linhas distintas', () => {
    const g = buildScheduleGroups([salao, aniversario], getNext)
    expect(linhas(g)).toEqual([{ id: 'sch_salao', n: 0 }, { id: 'sch_aniv', n: 0 }])
    expect(g.map(x => x.schedule.amount)).toEqual([500, 123])
  })

  it('resgate avulso (sem cartão) não tem chave de série', () => {
    expect(seriesKeyOf(salao)).toBeNull()
    expect(seriesKeyOf(aniversario)).toBeNull()
  })
})

describe('buildScheduleGroups — agrupamentos que continuam', () => {
  it('agendamento recorrente com várias ocorrências continua numa linha com as próximas', () => {
    const aluguel = {
      id: 'sch_aluguel', description: 'Aluguel', amount: 2000, transactionType: 'expense',
      frequency: 'monthly', startDate: '2026-10-05', overrides: {},
      _next: ['2026-10-05', '2026-11-05', '2026-12-05', '2027-01-05'],
    }
    const g = buildScheduleGroups([aluguel], getNext)
    expect(linhas(g)).toEqual([{ id: 'sch_aluguel', n: 3 }])
    expect(g[0].futureItems.map(i => i.date)).toEqual(['2026-11-05', '2026-12-05', '2027-01-05'])
  })

  it('série de fatura do mesmo cartão continua agrupada; resgates avulsos ficam fora dela', () => {
    const out = fatura('202610', '2026-10-10', 300)
    const nov = fatura('202611', '2026-11-10', 450)
    const g = buildScheduleGroups([out, nov, salao, aniversario], getNext)
    expect(linhas(g)).toEqual([
      { id: out.id, n: 1 },
      { id: 'sch_salao', n: 0 },
      { id: 'sch_aniv', n: 0 },
    ])
  })

  it('faturas de cartões diferentes não se misturam', () => {
    const outroCartao = { ...fatura('202610', '2026-10-10', 90), id: 'fsch_acc_outro_202610_resgate_reserva_acc_res_ca', cardId: 'acc_outro' }
    const g = buildScheduleGroups([fatura('202610', '2026-10-10', 300), outroCartao], getNext)
    expect(g).toHaveLength(2)
  })

  it('série legada sem cardId no topo, com o cartão em overrides._gerencial, ainda agrupa', () => {
    const legado = (id, date) => ({
      id, tipo: 'resgate_reserva', transactionType: 'transfer', accountId: 'acc_res_ca', toAccountId: 'acc_itau',
      frequency: 'once', amount: 10, startDate: date, _next: [date],
      overrides: { _gerencial: { cardId: 'acc_card' } },
    })
    const g = buildScheduleGroups([legado('a', '2026-10-10'), legado('b', '2026-11-10')], getNext)
    expect(linhas(g)).toEqual([{ id: 'a', n: 1 }])
  })
})
