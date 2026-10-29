import { describe, it, expect } from 'vitest'
import { contaDonaDoEspelho, espelhoNoPerfil } from './espelhoReserva.js'
import { criarClassificadores, totaisDoPeriodo } from './receitasDespesas.js'
import { countsAsReportExpense, countsAsReportIncome, reservaDespesaFuncIds, aplicacaoAccountIds } from '../components/shared/utils.js'

// Perfil P1 (pessoa): Itaú (principal) e CA (reserva). Perfil P2 (empresa): Cora.
const accounts = [
  { id: 'itau', profileId: 'P1', type: 'checking' },
  { id: 'ca', profileId: 'P1', type: 'checking', isReserva: true },
  { id: 'cora', profileId: 'P2', type: 'checking' },
  { id: 'semPerfil', profileId: null, type: 'checking', isReserva: true },
]
const reserveFunctions = [{ id: 'f_fralda', name: 'Fralda', accountId: 'ca', categoryId: 'cat_fralda', exibirComoDespesa: true }]

// Um ciclo do modelo do usuário: provisão 250, gasto real 300, resgate 260 → 290.
const deposito = { id: 'tx_dep', type: 'transfer', accountId: 'itau', toAccountId: 'ca', amount: 250, date: '2026-10-20', reservaFuncaoId: 'f_fralda' }
const espelhoDep = { id: 'tx_res_1', type: 'expense', accountId: null, amount: 250, date: '2026-10-20', categoryId: 'cat_fralda', reservaFuncaoId: 'f_fralda', reservaAuto: true, description: 'Reserva: CA', parentTxId: 'tx_dep' }
const gasto = { id: 'tx_gasto', type: 'expense', accountId: 'itau', amount: 300, date: '2026-10-25', categoryId: 'cat_fralda' }
const resgate = { id: 'tx_rsg_tr', type: 'transfer', accountId: 'ca', toAccountId: 'itau', amount: 260, date: '2026-10-25', reservaFuncaoId: 'f_fralda' }
const espelhoRsgR = { id: 'tx_rsg_1_r', type: 'income', accountId: null, amount: 260, date: '2026-10-25', categoryId: 'cat_fralda', reservaFuncaoId: 'f_fralda', reservaAuto: true, description: 'Resgate Reserva: CA', parentTxId: 'tx_rsg_tr' }
const espelhoRsgD = { ...espelhoRsgR, id: 'tx_rsg_1_d', type: 'expense' }
const ciclo = [deposito, espelhoDep, gasto, resgate, espelhoRsgR, espelhoRsgD]
const periodo = { start: '2026-10-15', end: '2026-11-14' }

const ctx = (profileId) => ({
  txById: new Map(ciclo.map(t => [t.id, t])),
  funcAccById: new Map(reserveFunctions.map(f => [f.id, f.accountId])),
  accById: new Map(accounts.map(a => [a.id, a])),
  profileAccountIds: new Set(accounts.filter(a => a.profileId === profileId).map(a => a.id)),
})

describe('espelho de reserva: perfil dono', () => {
  it('depósito → conta de destino da transferência; resgate (as duas pernas) → conta de origem', () => {
    const c = ctx('P1')
    expect(contaDonaDoEspelho(espelhoDep, c.txById, c.funcAccById)).toBe('ca')
    expect(contaDonaDoEspelho(espelhoRsgR, c.txById, c.funcAccById)).toBe('ca')
    expect(contaDonaDoEspelho(espelhoRsgD, c.txById, c.funcAccById)).toBe('ca')
  })
  it('sem transferência-pai: conta da função de reserva', () => {
    const c = ctx('P1')
    expect(contaDonaDoEspelho({ ...espelhoDep, parentTxId: null }, c.txById, c.funcAccById)).toBe('ca')
  })
  it('aparece só no perfil dono da conta da reserva', () => {
    expect(espelhoNoPerfil(espelhoDep, ctx('P1'))).toBe(true)
    expect(espelhoNoPerfil(espelhoDep, ctx('P2'))).toBe(false)
    expect(espelhoNoPerfil(espelhoRsgR, ctx('P2'))).toBe(false)
  })
  it('sem dono identificável, ou conta sem perfil: como antes (em todos)', () => {
    const orfao = { ...espelhoDep, parentTxId: null, reservaFuncaoId: null }
    expect(espelhoNoPerfil(orfao, ctx('P2'))).toBe(true)
    const c = ctx('P2')
    c.txById.set('tx_dep2', { ...deposito, id: 'tx_dep2', toAccountId: 'semPerfil' })
    expect(espelhoNoPerfil({ ...espelhoDep, parentTxId: 'tx_dep2', reservaFuncaoId: null }, c)).toBe(true)
  })
})

describe('totais: o depósito na reserva conta UMA vez (opção B)', () => {
  it('Painel/Início: provisão 250 + gasto 300 − resgate 260 = 290', () => {
    const cls = criarClassificadores(reserveFunctions, accounts)
    expect(cls.isExpenseTx(deposito)).toBe(false) // a transferência não conta mais
    expect(cls.isExpenseTx(espelhoDep)).toBe(true) // o espelho conta, na categoria da função
    expect(cls.isExpenseTx(espelhoRsgD)).toBe(false)
    expect(cls.isExpenseTx(resgate)).toBe(false)
    const { income, expense } = totaisDoPeriodo(ciclo, periodo, cls)
    expect(expense).toBe(550)
    expect(income).toBe(260)
    expect(expense - income).toBe(290)
  })
  it('Relatórios/Demonstrativo: mesma regra', () => {
    const fs = reservaDespesaFuncIds(reserveFunctions)
    const rs = new Set(accounts.filter(a => a.isReserva).map(a => a.id))
    const ap = aplicacaoAccountIds(accounts)
    const desp = ciclo.filter(t => countsAsReportExpense(t, ap, fs, rs)).reduce((s, t) => s + t.amount, 0)
    const rec = ciclo.filter(t => countsAsReportIncome(t, fs, rs)).reduce((s, t) => s + t.amount, 0)
    expect(desp).toBe(550)
    expect(rec).toBe(260)
  })
})
