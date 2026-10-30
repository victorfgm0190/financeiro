import { describe, it, expect } from 'vitest'
import { ehRendimentoDeReserva, saldosDasFuncoesNaData, rateioDoRendimento } from './rendimentoReserva.js'

const accounts = [
  { id: 'itau', type: 'checking' },
  { id: 'ca', type: 'savings', isReserva: true },
  { id: 'poup', type: 'savings', vinculoTipo: 'reserva' },
]
const functions = [
  { id: 'f1', accountId: 'ca', saldoInicial: 0 },
  { id: 'f2', accountId: 'ca', saldoInicial: 0 },
  { id: 'f3', accountId: 'ca', saldoInicial: 0 },
  { id: 'fp', accountId: 'poup', saldoInicial: 500 },
]
const periods = [
  { function_id: 'f1', data_inicio: '2026-09-15', saldo_inicial: 3000 },
  { function_id: 'f2', data_inicio: '2026-09-15', saldo_inicial: 1000 },
  { function_id: 'f3', data_inicio: '2026-09-15', saldo_inicial: -200 },
]
const transactions = [
  { id: 'd1', type: 'transfer', accountId: 'itau', toAccountId: 'ca', amount: 1000, date: '2026-10-15', reservaFuncaoId: 'f2' },
  { id: 'r1', type: 'transfer', accountId: 'ca', toAccountId: 'itau', amount: 500, date: '2026-10-20', reservaFuncaoId: 'f1' },
  // depois da data do rendimento: não conta
  { id: 'd2', type: 'transfer', accountId: 'itau', toAccountId: 'ca', amount: 9999, date: '2026-11-02', reservaFuncaoId: 'f1' },
]
const ctx = { functions, periods, adjustments: [], transactions }

describe('rendimento em conta de reserva', () => {
  it('só receita SEM função em conta de reserva', () => {
    expect(ehRendimentoDeReserva({ type: 'income', accountId: 'ca', amount: 10 }, accounts)).toBe(true)
    expect(ehRendimentoDeReserva({ type: 'income', accountId: 'poup', amount: 10 }, accounts)).toBe(true)
    expect(ehRendimentoDeReserva({ type: 'income', accountId: 'itau', amount: 10 }, accounts)).toBe(false)
    expect(ehRendimentoDeReserva({ type: 'income', accountId: 'ca', amount: 10, reservaFuncaoId: 'f1' }, accounts)).toBe(false)
    expect(ehRendimentoDeReserva({ type: 'transfer', accountId: 'itau', toAccountId: 'ca', amount: 10 }, accounts)).toBe(false)
  })
  it('saldo de cada função NA data do rendimento (período vigente + movimentos + ajustes)', () => {
    const s = saldosDasFuncoesNaData({ ...ctx, contaId: 'ca', date: '2026-10-29' })
    expect(s).toEqual([{ id: 'f1', saldo: 2500 }, { id: 'f2', saldo: 2000 }, { id: 'f3', saldo: -200 }])
  })
  it('rateio proporcional só entre positivas, soma exata, ligado ao lançamento', () => {
    const adjs = rateioDoRendimento({ id: 'tx_r', type: 'income', accountId: 'ca', amount: 90, date: '2026-10-29' }, ctx)
    expect(adjs.map(a => [a.function_id, a.valor])).toEqual([['f1', 50], ['f2', 40]])
    expect(adjs.every(a => a.lancamento_id === 'tx_r' && a.observacao === 'Rendimento' && a.data === '2026-10-29')).toBe(true)
    expect(adjs[0].id).toBe('adj_rend_tx_r_f1')
  })
  it('centavos na maior; refazer ignora o rateio anterior do mesmo rendimento', () => {
    const anterior = [{ function_id: 'f1', data: '2026-10-29', valor: 1000, lancamento_id: 'tx_r' }]
    const adjs = rateioDoRendimento({ id: 'tx_r', accountId: 'ca', amount: 10, date: '2026-10-29' }, { ...ctx, adjustments: anterior })
    expect(adjs.reduce((s, a) => s + a.valor, 0)).toBeCloseTo(10, 2)
    expect(adjs.find(a => a.function_id === 'f1').valor).toBe(5.56)
  })
})
