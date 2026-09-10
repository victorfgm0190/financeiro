import { describe, it, expect } from 'vitest'
import { buildDailyLedgerRows, reserveMovOf, activePeriodByFunction } from './reserveDailyLedger.js'

const TODAY = '2026-09-10'
const at = (rows, fid, d) => rows.find(r => r.function_id === fid && r.snapshot_date === d)

// Duas funções na mesma conta + uma em conta separada. Um lançamento ÓRFÃO (sem
// reservaFuncaoId) na conta compartilhada é o que cria a divergência entre Saldo e
// Saldo Atualizado — é o caso real que originou o razão.
function cenarioBase() {
  return {
    today: TODAY,
    functions: [
      { id: 'f1', name: 'Seguro', accountId: 'acc1', saldoInicial: 0 },
      { id: 'f2', name: 'Manutencao', accountId: 'acc1', saldoInicial: 0 },
      { id: 'f3', name: 'IPVA', accountId: 'acc2', saldoInicial: 0 },
    ],
    periods: [
      { id: 'p1', function_id: 'f1', data_inicio: '2026-09-01', saldo_inicial: 1000 },
      { id: 'p2', function_id: 'f2', data_inicio: '2026-09-01', saldo_inicial: 500 },
      { id: 'p3', function_id: 'f3', data_inicio: '2026-09-01', saldo_inicial: 300 },
    ],
    transactions: [
      { id: 't1', date: '2026-09-05', type: 'transfer', amount: 100, accountId: 'x', toAccountId: 'acc1', reservaFuncaoId: 'f1' },
      { id: 'orf', date: '2026-09-07', type: 'expense', amount: 40, accountId: 'acc1', reservaFuncaoId: null },
    ],
    accounts: [
      { id: 'acc1', type: 'checking', balance: 1560 }, // 1000 + 500 + 100 − 40
      { id: 'acc2', type: 'checking', balance: 300 },
    ],
    accountBalances: {},
  }
}

describe('reserveMovOf', () => {
  it('receita NA conta da reserva é entrada', () => {
    expect(reserveMovOf({ type: 'income', accountId: 'a', amount: 50 }, 'a')).toEqual({ entrada: 50, saida: 0 })
  })

  it('transferência entrando é depósito, saindo é resgate', () => {
    expect(reserveMovOf({ type: 'transfer', accountId: 'x', toAccountId: 'a', amount: 30 }, 'a')).toEqual({ entrada: 30, saida: 0 })
    expect(reserveMovOf({ type: 'transfer', accountId: 'a', toAccountId: 'x', amount: 30 }, 'a')).toEqual({ entrada: 0, saida: 30 })
  })

  it('despesa vinculada é provisão, não movimento de reserva', () => {
    expect(reserveMovOf({ type: 'expense', accountId: 'a', amount: 70 }, 'a')).toEqual({ entrada: 0, saida: 0 })
  })

  it('receita em OUTRA conta não conta', () => {
    expect(reserveMovOf({ type: 'income', accountId: 'z', amount: 50 }, 'a')).toEqual({ entrada: 0, saida: 0 })
  })
})

describe('activePeriodByFunction', () => {
  it('escolhe o período de data_inicio mais recente', () => {
    const m = activePeriodByFunction([
      { id: 'a', function_id: 'f1', data_inicio: '2026-07-15' },
      { id: 'b', function_id: 'f1', data_inicio: '2026-08-14' },
    ])
    expect(m.f1.id).toBe('b')
  })
})

describe('buildDailyLedgerRows — rateio', () => {
  it('reproduz a fórmula da tela: saldo × (saldo real ÷ soma dos saldos da conta)', () => {
    const { rows } = buildDailyLedgerRows(cenarioBase())
    // acc1 hoje: saldos 1100 + 500 = 1600 teóricos contra 1560 reais → fator 0,975.
    const f1 = at(rows, 'f1', TODAY)
    const f2 = at(rows, 'f2', TODAY)
    expect(f1.saldo_acumulado).toBe(1100)
    expect(f1.saldo_atualizado).toBe(Math.round(1100 * (1560 / 1600) * 100) / 100)
    expect(f2.saldo_atualizado).toBe(Math.round(500 * (1560 / 1600) * 100) / 100)
    expect(f1.fator_rateio).toBeCloseTo(0.975, 8)
  })

  it('função em conta sem divergência fica com Saldo Atualizado igual ao Saldo', () => {
    const { rows } = buildDailyLedgerRows(cenarioBase())
    const f3 = at(rows, 'f3', TODAY)
    expect(f3.saldo_atualizado).toBe(f3.saldo_acumulado)
    expect(f3.divergencia).toBe(0)
  })

  it('reconstrói o saldo real da conta em datas passadas', () => {
    const { rows } = buildDailyLedgerRows(cenarioBase())
    // O órfão de 40 é do dia 07: antes dele a conta tinha 1600, e o depósito de 100 é do dia 05.
    expect(at(rows, 'f1', '2026-09-04').saldo_real_conta).toBe(1500)
    expect(at(rows, 'f1', '2026-09-06').saldo_real_conta).toBe(1600)
    expect(at(rows, 'f1', '2026-09-07').saldo_real_conta).toBe(1560)
  })

  it('registra a movimentação no dia em que ela ocorre, e só nele', () => {
    const { rows } = buildDailyLedgerRows(cenarioBase())
    expect(at(rows, 'f1', '2026-09-05').entrada_dia).toBe(100)
    expect(at(rows, 'f1', '2026-09-06').entrada_dia).toBe(0)
    expect(at(rows, 'f1', '2026-09-04').saldo_acumulado).toBe(1000)
    expect(at(rows, 'f1', '2026-09-05').saldo_acumulado).toBe(1100)
  })

  it('usa o override de saldo real da conta quando existe', () => {
    const base = cenarioBase()
    const { rows } = buildDailyLedgerRows({ ...base, accountBalances: { acc1: 1600 } })
    // Com o saldo real igual ao teórico, não há rateio.
    expect(at(rows, 'f1', TODAY).saldo_atualizado).toBe(1100)
    expect(at(rows, 'f1', TODAY).divergencia).toBe(0)
  })

  it('sem funções devolve razão vazio', () => {
    expect(buildDailyLedgerRows({ functions: [], today: TODAY }).rows).toEqual([])
  })
})

describe('buildDailyLedgerRows — viradas encadeadas', () => {
  const cenario = {
    today: TODAY,
    functions: [
      { id: 'f1', name: 'A', accountId: 'acc1', saldoInicial: 0 },
      { id: 'f2', name: 'B', accountId: 'acc1', saldoInicial: 0 },
    ],
    transactions: [
      { id: 't1', date: '2026-08-20', type: 'transfer', amount: 200, accountId: 'x', toAccountId: 'acc1', reservaFuncaoId: 'f1' },
      { id: 't2', date: '2026-09-05', type: 'transfer', amount: 100, accountId: 'x', toAccountId: 'acc1', reservaFuncaoId: 'f2' },
      { id: 'orf', date: '2026-08-10', type: 'expense', amount: 50, accountId: 'acc1', reservaFuncaoId: null },
    ],
    accounts: [{ id: 'acc1', type: 'checking', balance: 2250 }], // 1000 + 1000 + 200 + 100 − 50
    accountBalances: {},
  }
  const base = [
    { id: 'p1', function_id: 'f1', data_inicio: '2026-07-15', saldo_inicial: 1000 },
    { id: 'p2', function_id: 'f2', data_inicio: '2026-07-15', saldo_inicial: 1000 },
  ]

  it('um corte reinicia o saldo sem alterar os dias do período fechado', () => {
    const antes = buildDailyLedgerRows({ ...cenario, periods: base }).rows
    const fech = at(antes, 'f1', '2026-08-13')
    expect(fech.saldo_acumulado).toBe(1000)
    expect(fech.saldo_atualizado).toBe(975) // fator 0,975 pelo órfão de 50 em 10/08

    const virada1 = [
      { id: 'p3', function_id: 'f1', data_inicio: '2026-08-14', saldo_inicial: 975 },
      { id: 'p4', function_id: 'f2', data_inicio: '2026-08-14', saldo_inicial: 975 },
    ]
    const depois = buildDailyLedgerRows({ ...cenario, periods: [...base, ...virada1] }).rows
    expect(at(depois, 'f1', '2026-08-13').saldo_acumulado).toBe(1000) // dia fechado, intacto
    expect(at(depois, 'f1', '2026-08-14').saldo_acumulado).toBe(975)  // reinicia no saldo da virada
  })

  it('duas viradas encadeadas absorvem a divergência por completo', () => {
    const virada1 = [
      { id: 'p3', function_id: 'f1', data_inicio: '2026-08-14', saldo_inicial: 975 },
      { id: 'p4', function_id: 'f2', data_inicio: '2026-08-14', saldo_inicial: 975 },
    ]
    const r1 = buildDailyLedgerRows({ ...cenario, periods: [...base, ...virada1] }).rows
    const virada2 = [
      { id: 'p5', function_id: 'f1', data_inicio: '2026-09-01', saldo_inicial: at(r1, 'f1', '2026-08-31').saldo_atualizado },
      { id: 'p6', function_id: 'f2', data_inicio: '2026-09-01', saldo_inicial: at(r1, 'f2', '2026-08-31').saldo_atualizado },
    ]
    const r2 = buildDailyLedgerRows({ ...cenario, periods: [...base, ...virada1, ...virada2] }).rows
    const soma = at(r2, 'f1', TODAY).saldo_atualizado + at(r2, 'f2', TODAY).saldo_atualizado
    expect(soma).toBeCloseTo(2250, 2) // bate com o saldo real da conta
  })

  it('cada linha carrega o período vigente NAQUELE dia', () => {
    const virada1 = [{ id: 'p3', function_id: 'f1', data_inicio: '2026-08-14', saldo_inicial: 975 }]
    const rows = buildDailyLedgerRows({ ...cenario, periods: [...base, ...virada1] }).rows
    expect(at(rows, 'f1', '2026-08-01').periodo_id).toBe('p1')
    expect(at(rows, 'f1', '2026-08-20').periodo_id).toBe('p3')
  })
})
