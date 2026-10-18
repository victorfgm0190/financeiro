import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { computeOccurrences } from './occurrences.js'
import { occEfetiva } from './fluxoCaixa.js'
import { buildScheduleGroups } from './agendamentosGrupos.js'
import { filtrarAgendamentos } from './agendamentosFiltro.js'
import { classificarAgendamento } from './resumoSelecao.js'
import {
  montarCalendario, gradeDoMes, somarMeses, limitesDoMes, chaveFatura, faturasSemAgendamento, ladoDoGrupo,
} from './agendaCalendario.js'

// Data fixa: buildScheduleGroups lê o "hoje" do relógio.
const HOJE = '2026-10-18'
beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 18, 12)) })
afterAll(() => { vi.useRealTimers() })

const gno = (s, n = 12) => computeOccurrences(s, n)
const r2 = (n) => Math.round(n * 100) / 100

const ACCOUNTS = [
  { id: 'acc_cc', name: 'Conta' },
  { id: 'acc_card', name: 'Cartão', type: 'credit' },
  { id: 'acc_card2', name: 'Cartão 2', type: 'credit' },
  { id: 'acc_ger', name: 'Ger. Cartão', grupoGerencial: 'grp_1' },
  { id: 'acc_poup', name: 'Poupança', type: 'savings', isReserva: true },
]
const base = (o) => ({ registered: [], skipped: [], overrides: {}, frequency: 'once', accountId: 'acc_cc', ...o })

// Uma "aba" de cada: os tipos de agendamento que cada aba da tela mostra.
const ABAS = {
  conta: [
    // Dia 31 fixo (_diaVencimento): cai no último dia dos meses curtos. Agosto e setembro já pagos.
    base({ id: 'aluguel', description: 'Aluguel', transactionType: 'expense', amount: 2000, frequency: 'monthly', startDate: '2026-08-31',
      registered: ['2026-08-31', '2026-09-30'], overrides: { _diaVencimento: 31 } }),
    base({ id: 'salario', description: 'Salário', transactionType: 'income', amount: 9000, frequency: 'monthly', startDate: '2026-09-05', registered: ['2026-09-05'] }),
    base({ id: 'iptu', description: 'IPTU', transactionType: 'expense', amount: 300, startDate: '2026-10-10' }), // atrasado
    // Ocorrência movida (override de data e valor): a lista mostra 22/10 com 180.
    base({ id: 'luz', description: 'Luz', transactionType: 'expense', amount: 150, frequency: 'monthly', startDate: '2026-10-20',
      overrides: { '2026-10-20': { date: '2026-10-22', amount: 180 } } }),
  ],
  cartao: ['202610', '202611', '202612'].map((ym, i) => base({
    id: `fsch_acc_card_${ym}_pagamento_fatura`, tipo: 'pagamento_fatura', transactionType: 'transfer',
    accountId: 'acc_cc', toAccountId: 'acc_card', cardId: 'acc_card', description: `Pagamento Fatura ${ym}`,
    amount: 1000 + i * 100, startDate: `${ym.slice(0, 4)}-${ym.slice(4)}-20`,
    overrides: { _gerencial: { cardId: 'acc_card', faturaRef: `${ym.slice(4)}/${ym.slice(0, 4)}` } },
  })),
  gerencial: ['2026-10-25', '2026-11-25'].map((d, i) => base({
    id: `dev_${i}`, tipo: 'gerencial_devolucao', transactionType: 'transfer', accountId: 'acc_ger', toAccountId: 'acc_cc',
    description: 'Devolução Gerencial', amount: 400 + i, startDate: d,
  })),
  anuais: [
    base({ id: 'aplic', description: 'Aplicação mensal', transactionType: 'transfer', accountId: 'acc_cc', toAccountId: 'acc_poup', amount: 500, frequency: 'monthly', startDate: '2026-10-28' }),
    base({ id: 'resg', description: 'Resgate IPVA', transactionType: 'transfer', accountId: 'acc_poup', toAccountId: 'acc_cc', amount: 1200, startDate: '2027-01-15' }),
  ],
}

// Soma da LISTA num dia: linha principal na data exibida (valor efetivo da próxima) + as
// ocorrências seguintes que a linha lista (futureItems) — exatamente o que a tela mostra.
function somaDaListaNoDia(schedules, dia) {
  const rows = buildScheduleGroups(schedules, gno, { agruparSeries: true })
  const t = { saida: 0, entrada: 0, neutro: 0 }
  const add = (s, v) => { const l = ladoDoGrupo(classificarAgendamento(s, ACCOUNTS)); t[l] = r2(t[l] + v) }
  for (const r of rows) {
    if (!r.nextDate) continue
    if (r.displayDate === dia) add(r.schedule, Number(occEfetiva(r.schedule, r.nextDate).amount) || 0)
    for (const f of r.futureItems) if (f.date === dia) add(r.schedule, Number(f.amount) || 0)
  }
  return t
}
// Como o painel monta o calendário: as mesmas linhas, sem agrupar séries de fatura.
const calendario = (schedules, ym, extra = {}) => montarCalendario({
  ym, status: 'apagar', rows: buildScheduleGroups(schedules, gno, { agruparSeries: false }),
  getNextOccurrences: gno, hoje: HOJE, accounts: ACCOUNTS, ...extra,
})

describe('calendário × lista: total do dia = soma da lista no mesmo dia', () => {
  for (const [aba, schedules] of Object.entries(ABAS)) {
    it(`aba ${aba}`, () => {
      for (const ym of ['2026-10', '2026-11', '2026-12', '2027-01']) {
        const cal = calendario(schedules, ym)
        const [ini, fim] = limitesDoMes(ym)
        for (const sem of cal.semanas) for (const { data } of sem) {
          if (data < ini || data > fim) continue
          const doCal = cal.dias.get(data)?.totais.aPagar || { saida: 0, entrada: 0, neutro: 0 }
          expect({ dia: data, ...doCal }).toEqual({ dia: data, ...somaDaListaNoDia(schedules, data) })
        }
      }
    })
  }

  it('recorrente e override de data/valor caem no dia certo', () => {
    const cal = calendario(ABAS.conta, '2026-10')
    expect(cal.dias.get('2026-10-22').totais.aPagar.saida).toBe(180)
    expect(cal.dias.get('2026-10-20')).toBeUndefined()
    expect(cal.dias.get('2026-10-31').totais.aPagar.saida).toBe(2000)
  })

  it('atrasado marcado; só a próxima pendente tem ações, as seguintes avisam a data dela', () => {
    const cal = calendario(ABAS.conta, '2026-11')
    const out = calendario(ABAS.conta, '2026-10')
    expect(out.dias.get('2026-10-10').totais.atrasados).toBe(1)
    const aluguelNov = cal.dias.get('2026-11-30').itens.find(i => i.schedule.id === 'aluguel')
    expect(aluguelNov.proxima).toBe(false)
    expect(aluguelNov.antesDe).toBe('2026-10-31')
  })

  it('totais do mês: transferências/aplicações ficam de fora (neutro), só despesas e receitas somam', () => {
    const cal = calendario([...ABAS.conta, ...ABAS.anuais], '2026-11')
    // Aluguel (30/11) + Luz (20/11) = saídas; Salário (05/11) = entrada; Aplicação (28/11) = neutro.
    expect(cal.totais.aPagar).toEqual({ saida: 2150, entrada: 9000, neutro: 500 })
  })

  it('recorrente além das 12 ocorrências da lista continua pela mesma série', () => {
    const cal = calendario(ABAS.conta, '2028-03')
    expect(cal.dias.get('2028-03-05').itens[0].schedule.id).toBe('salario')
  })
})

describe('faturas: card do contas_a_pagar × agendamento pagamento_fatura', () => {
  const cardDup = { id: 'cap_1', cartaoId: 'acc_card', mesAno: '2026-11', dueDate: '2026-11-20', amount: 1100, status: 'pending', description: 'Fatura Cartão 11/2026' }
  const cardOutro = { id: 'cap_2', cartaoId: 'acc_card2', mesAno: '2026-11', dueDate: '2026-11-20', amount: 700, status: 'pending', description: 'Fatura Cartão 2 11/2026' }

  it('chave cartão|mês igual nos dois formatos', () => {
    expect(chaveFatura(cardDup)).toBe('acc_card|2026-11')
    expect(chaveFatura(ABAS.cartao[1])).toBe('acc_card|2026-11')
    expect(chaveFatura({ id: 'fsch_acc_card_202612_pagamento_fatura', cardId: 'acc_card' })).toBe('acc_card|2026-12')
  })

  it('a mesma fatura nunca aparece duas vezes no dia', () => {
    const faturas = faturasSemAgendamento([cardDup, cardOutro], ABAS.cartao)
    expect(faturas.map(f => f.id)).toEqual(['cap_2'])
    const dia = calendario(ABAS.cartao, '2026-11', { faturas }).dias.get('2026-11-20')
    const doCartao1 = dia.itens.filter(i => (i.fatura ? chaveFatura(i.fatura) : chaveFatura(i.schedule)) === 'acc_card|2026-11')
    expect(doCartao1).toHaveLength(1)
    expect(dia.itens).toHaveLength(2)
    expect(dia.totais.aPagar.saida).toBe(1800)
  })
})

describe('pagos × a pagar', () => {
  const pago = { key: 'p1', schedule: ABAS.conta[1], dataPagamento: '2026-09-06', amount: 9000, description: 'Salário' }
  const baixa = { key: 'p2', schedule: ABAS.conta[0], dataPagamento: '2026-09-30', amount: 2000, description: 'Aluguel', semLancamento: true }
  const rows = buildScheduleGroups(ABAS.conta, gno, { agruparSeries: false })
  const cal = (status, ym) => montarCalendario({ ym, status, rows, pagosLinhas: [pago, baixa], getNextOccurrences: gno, hoje: HOJE, accounts: ACCOUNTS })

  it('"A pagar" não mostra nada pago', () => {
    expect(cal('apagar', '2026-09').dias.get('2026-09-06')).toBeUndefined()
  })
  it('"Pagos" mostra pela data do pagamento, sem pendentes', () => {
    const c = cal('pagos', '2026-10')
    expect([...c.dias.values()].flatMap(d => d.itens).every(i => i.pago)).toBe(true)
    expect(cal('pagos', '2026-09').dias.get('2026-09-06').totais.pago.entrada).toBe(9000)
  })
  it('"Todos" separa pago de a pagar (nunca soma junto); baixa sem lançamento não soma', () => {
    const c = cal('todos', '2026-09')
    expect(c.totais.pago).toEqual({ saida: 0, entrada: 9000, neutro: 0 })
    expect(c.dias.get('2026-09-30').totais.qtd).toBe(1)
    expect(c.dias.get('2026-09-30').totais.pago.saida).toBe(0)
    const out = cal('todos', '2026-10')
    expect(out.totais.aPagar.saida).toBeGreaterThan(0)
    expect(out.totais.pago.saida).toBe(0)
  })
})

describe('filtros aplicados antes do calendário', () => {
  it('descrição: só o que passa no filtro da lista entra no calendário', () => {
    const filtrados = filtrarAgendamentos(ABAS.conta, { desc: 'alug' }, gno, HOJE)
    const cal = calendario(filtrados, '2026-10')
    const ids = new Set([...cal.dias.values()].flatMap(d => d.itens.map(i => i.schedule.id)))
    expect([...ids]).toEqual(['aluguel'])
  })
  it('valor mínimo', () => {
    const filtrados = filtrarAgendamentos(ABAS.conta, { min: 1000 }, gno, HOJE)
    const cal = calendario(filtrados, '2026-11')
    expect(cal.totais.aPagar).toEqual({ saida: 2000, entrada: 9000, neutro: 0 })
  })
})

describe('grade do mês', () => {
  const dias = (ym) => gradeDoMes(ym).flat()
  it('mês de 31 dias: semanas de domingo a sábado cobrindo o mês todo', () => {
    const g = gradeDoMes('2026-10')
    expect(g.every(s => s.length === 7)).toBe(true)
    expect(g[0][0].data).toBe('2026-09-27') // 01/10/2026 é quinta
    expect(g[g.length - 1][6].data).toBe('2026-10-31')
    expect(dias('2026-10').filter(d => d.doMes)).toHaveLength(31)
  })
  it('fevereiro comum e bissexto', () => {
    expect(dias('2026-02').filter(d => d.doMes)).toHaveLength(28)
    expect(gradeDoMes('2026-02')).toHaveLength(4) // 01/02/2026 é domingo
    expect(dias('2028-02').filter(d => d.doMes)).toHaveLength(29)
    expect(limitesDoMes('2028-02')).toEqual(['2028-02-01', '2028-02-29'])
  })
  it('virada de ano', () => {
    expect(somarMeses('2026-12', 1)).toBe('2027-01')
    expect(somarMeses('2027-01', -1)).toBe('2026-12')
    expect(somarMeses('2026-10', 15)).toBe('2028-01')
    const g = gradeDoMes('2027-01')
    expect(g[0][0].data).toBe('2026-12-27')
    expect(g[0][0].doMes).toBe(false)
  })
  it('recorrente do dia 31 aparece em fevereiro e atravessa a virada do ano igual à lista', () => {
    const fev = calendario(ABAS.conta, '2027-02')
    const aluguel = [...fev.dias.values()].flatMap(d => d.itens).filter(i => i.schedule.id === 'aluguel' && i.data.startsWith('2027-02'))
    expect(aluguel).toHaveLength(1)
    const jan = calendario(ABAS.conta, '2027-01')
    for (const d of ['2027-01-05', '2027-01-15']) {
      const t = jan.dias.get(d)?.totais.aPagar || { saida: 0, entrada: 0, neutro: 0 }
      expect(t).toEqual(somaDaListaNoDia(ABAS.conta, d))
    }
  })
})
