import { describe, it, expect } from 'vitest'
import { calcularSaldoPrincipalBreakdown } from './saldoPrincipal'

// Cenário sintético com tudo que mexe no Saldo Principal: contas FC em dois perfis, reserva e
// conta Ger. fora do FC, cartão, transferências entre perfis, gerenciais, para fora do FC e de
// conta sem perfil, agendamentos (inclusive override e entre perfis), envelopes e lançamentos
// além do ciclo (Atual/Final Calendário). Ciclo 15/10–14/11/2026, modo custom.
const PF = 'pf', PJ = 'pj'
const accounts = [
  { id: 'itau', name: 'Itau', type: 'checking', fluxoCaixaPrincipal: true, profileId: PF, initialBalance: 1000 },
  { id: 'bb', name: 'BB', type: 'checking', fluxoCaixaPrincipal: true, profileId: PF, initialBalance: 50 },
  { id: 'aux', name: 'AUX', type: 'savings', fluxoCaixaPrincipal: true, profileId: PF, initialBalance: 0 },
  { id: 'itlumen', name: 'ITLUMEN', type: 'checking', fluxoCaixaPrincipal: true, profileId: PJ, initialBalance: 300 },
  { id: 'cora', name: 'Cora', type: 'checking', fluxoCaixaPrincipal: true, profileId: PJ, initialBalance: 0 },
  { id: 'reserva', name: 'Reserva', type: 'savings', fluxoCaixaPrincipal: false, profileId: PF, initialBalance: 5000 },
  { id: 'pharma', name: 'Pharma', type: 'savings', fluxoCaixaPrincipal: false, profileId: PF, initialBalance: 0 },
  { id: 'tiggo', name: 'TIGGO', type: 'asset', fluxoCaixaPrincipal: false, profileId: PF, initialBalance: 0 },
  { id: 'ger', name: 'Ger. ITAUAZUL', type: 'gerencial', fluxoCaixaPrincipal: false, profileId: PF, grupoGerencial: 'g1', initialBalance: 0 },
  { id: 'cartao', name: 'ITAUAZUL', type: 'credit', fluxoCaixaPrincipal: true, profileId: PF },
  { id: 'fin', name: 'Financiamento', type: 'liability', fluxoCaixaPrincipal: false, profileId: null, initialBalance: -9000 },
]
const tx = (id, type, date, amount, accountId, extra = {}) => ({ id, type, date, amount, accountId, ...extra })
const transactions = [
  tx('t1', 'income', '2026-10-01', 2000, 'itau'),
  tx('t2', 'expense', '2026-10-16', 150, 'itau'),
  tx('t3', 'expense', '2026-10-17', 80, 'itlumen', { categoryId: 'mercado' }),
  tx('t4', 'income', '2026-10-20', 900, 'cora'),
  tx('t5', 'transfer', '2026-10-21', 500, 'itlumen', { toAccountId: 'itau' }),     // PJ → PF (entre perfis)
  tx('t6', 'transfer', '2026-10-22', 200, 'itau', { toAccountId: 'pharma' }),      // FC → fora do FC
  tx('t7', 'transfer', '2026-10-23', 386.13, 'itau', { toAccountId: 'ger' }),      // gerencial (conta Ger.)
  tx('t8', 'transfer', '2026-10-24', 54.35, 'bb', { toAccountId: 'aux', grupoGerencial: 'g1' }), // gerencial por flag
  tx('t9', 'credit_payment', '2026-10-25', 700, 'cartao', { fromAccountId: 'itau' }),
  tx('t10', 'expense', '2026-10-26', 120, 'cartao', { accountType: 'credit', categoryId: 'mercado' }),
  tx('t11', 'expense', '2026-10-27', 40, 'itau', { categoryId: 'mercado' }),
  tx('t12', 'income', '2026-11-20', 333, 'itlumen'),                               // além do ciclo
  tx('t13', 'transfer', '2026-11-25', 100, 'cora', { toAccountId: 'bb' }),         // além do ciclo, entre perfis
  tx('t14', 'income', '2026-10-18', 999, 'reserva'),                               // fora do pool
  tx('t15', 'transfer', '2026-10-19', 77, 'fin', { toAccountId: 'aux' }),          // conta sem perfil → FC
]
const sched = (id, transactionType, amount, accountId, occs, extra = {}) =>
  ({ id, transactionType, amount, accountId, occs, description: id, ...extra })
const schedules = [
  sched('s1', 'income', 1977, 'itau', ['2026-11-10']),
  sched('s2', 'expense', 230, 'itau', ['2026-10-10', '2026-10-17', '2026-10-24', '2026-11-07']),
  sched('s3', 'transfer', 1296, 'itlumen', ['2026-11-14', '2026-11-28'], { toAccountId: 'itau' }), // entre perfis
  sched('s4', 'transfer', 760, 'itlumen', ['2026-10-19'], { toAccountId: 'pharma' }),              // PJ → fora do FC
  sched('s5', 'transfer', 3000, 'pharma', ['2026-10-30'], { toAccountId: 'itau', overrides: { '2026-10-30': { amount: 2500 } } }),
  sched('s6', 'expense', 150, 'cora', ['2026-11-10', '2026-11-29']),
  sched('s7', 'expense', 99, 'cartao', ['2026-10-20']),                                          // cartão: nunca entra
  sched('s8', 'transfer', 341.7, 'aux', ['2026-11-05'], { toAccountId: 'fin' }),
]
const envelopes = [
  { id: 'e1', name: 'Mercado PF', accountId: 'itau', categoryIds: ['mercado'], limitAmount: 600 },
  { id: 'e2', name: 'Mercado PJ', accountId: 'itlumen', categoryIds: ['mercado'], limitAmount: 400 },
  { id: 'e3', name: 'Reserva', accountId: 'reserva', categoryIds: ['mercado'], limitAmount: 1000 },
]

const base = {
  accounts, transactions, schedules, envelopes,
  settings: { financialMonthMode: 'custom', financialMonthStartDay: 15 },
  gerencialGroups: [{ id: 'g1', number: 1 }],
  getNextOccurrences: (s) => s.occs || [],
  getFinancialPeriod: () => ({ start: new Date(2026, 9, 15), end: new Date(2026, 10, 14) }),
}
const calcular = (profileId, extra = {}) =>
  calcularSaldoPrincipalBreakdown({ ...base, ...extra, profileId }, new Date(2026, 9, 15, 12))

const VALORES = {
  'Saldo base': b => b.saldoAtual.base,
  'Transf. gerenciais': b => b.saldoAtual.gerencialTransfers,
  'Saldo Atual Ciclo': b => b.saldoAtual.total,
  'Final Ciclo': b => b.finalCiclo.total,
  'Projetado': b => b.projetado.total,
  'Atual Cal.': b => b.atualCalendario.total,
  'Final Cal.': b => b.finalCalendario.total,
  'Pendentes do ciclo': b => b.finalCiclo.agendamentosTotal,
  'Envelopes': b => b.projetado.envelopesTotal,
  'Lançamentos além do ciclo': b => b.atualCalendario.lancamentosTotal,
}
const rb = v => Math.round(v * 100) / 100
const ids = b => b.saldoAtual.contas.map(c => c.id)

describe('calcularSaldoPrincipalBreakdown — pool FC ∩ perfil', () => {
  const tudo = calcular(null), pf = calcular(PF), pj = calcular(PJ)

  it.each(Object.entries(VALORES))('identidade Tudo = PF + PJ em %s', (_, get) => {
    expect(rb(get(pf) + get(pj))).toBeCloseTo(get(tudo), 2)
  })

  it('o cenário exercita todos os valores (nenhum é zero em Tudo)', () => {
    for (const get of Object.values(VALORES)) expect(get(tudo)).not.toBe(0)
  })

  it('os pools dos perfis particionam o pool de Tudo', () => {
    const [t, a, c] = [ids(tudo), ids(pf), ids(pj)]
    expect(a.filter(id => c.includes(id))).toEqual([])
    expect([...a, ...c].sort()).toEqual([...t].sort())
    expect([...t].sort()).toEqual(['aux', 'bb', 'cora', 'itau', 'itlumen'])
  })

  it('só contas FC não-cartão: reserva, aplicação, ativo, Ger., cartão e passivo ficam fora', () => {
    for (const b of [tudo, pf, pj]) {
      for (const fora of ['reserva', 'pharma', 'tiggo', 'ger', 'cartao', 'fin']) expect(ids(b)).not.toContain(fora)
    }
  })

  it('a decomposição por conta soma o Saldo base em todos os modos', () => {
    for (const b of [tudo, pf, pj]) {
      expect(rb(b.saldoAtual.contas.reduce((s, c) => s + c.saldo, 0))).toBeCloseTo(b.saldoAtual.base, 2)
    }
  })

  it('transferência entre perfis se anula em Tudo e aparece com sinais opostos nos perfis', () => {
    const t5 = transactions.find(t => t.id === 't5')
    const mov = (pid) => {
      const b = calcular(pid, { transactions: [t5], schedules: [], envelopes: [] })
      const abertura = (pid ? accounts.filter(a => a.profileId === pid) : accounts)
        .filter(a => a.fluxoCaixaPrincipal && a.type !== 'credit')
        .reduce((s, a) => s + (a.initialBalance || 0), 0)
      return rb(b.saldoAtual.total - abertura)
    }
    expect(mov(null)).toBe(0)
    expect(mov(PF)).toBe(500)
    expect(mov(PJ)).toBe(-500)
  })

  it('perfil sem conta FC: pool vazio, contas [] e todos os valores zerados', () => {
    const b = calcular('perfil-sem-fc')
    expect(b.saldoAtual.contas).toEqual([])
    for (const get of Object.values(VALORES)) expect(get(b)).toBe(0)
    expect(b.finalCiclo.agendamentos).toEqual([])
    expect(b.projetado.envelopes).toEqual([])
  })
})
