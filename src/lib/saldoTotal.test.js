import { describe, it, expect } from 'vitest'
import { saldoTotalContas } from './saldoTotal'

describe('saldoTotalContas', () => {
  it('soma todas as contas exceto cartão de crédito', () => {
    const contas = [
      { type: 'checking', balance: 1000.5 },
      { type: 'savings', balance: 200 },
      { type: 'investment', balance: 50.25, isReserva: true },
      { type: 'credit', balance: -999 },
      { type: 'cash', balance: -100 },
    ]
    expect(saldoTotalContas(contas)).toBeCloseTo(1150.75, 2)
  })

  it('balance ausente conta como zero; lista vazia ou nula dá zero', () => {
    expect(saldoTotalContas([{ type: 'checking' }, { type: 'checking', balance: 10 }])).toBe(10)
    expect(saldoTotalContas([])).toBe(0)
    expect(saldoTotalContas(null)).toBe(0)
  })
})
