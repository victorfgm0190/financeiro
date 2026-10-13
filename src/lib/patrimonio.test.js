import { describe, it, expect } from 'vitest'
import { categorizarPatrimonio, totaisPatrimonio } from './patrimonio'

describe('totaisPatrimonio', () => {
  const groups = [{ id: 'gd', type: 'patrimonial', behavior: 'divida' }]
  const accounts = [
    { id: 'bem', type: 'asset', balance: 0, valorPagoManual: 1000 },
    { id: 'cc', type: 'checking', balance: 500 },
    { id: 'fin', type: 'liability', balance: -300 },
    { id: 'div', type: 'checking', accountGroupId: 'gd', balance: 15 },
    { id: 'card', type: 'credit', balance: 9999 },
  ]
  const t = totaisPatrimonio(categorizarPatrimonio(accounts, groups), id => (id === 'card' ? 120 : 0))

  it('dívida entra pelo valor devido em positivo e o PL a subtrai', () => {
    expect(t.dividas).toBe(285)
    expect(t.cartao).toBe(120)
    expect(t.pl).toBe(1000 + 500 - 285 - 120)
  })

  it('cada total é a soma dos seus itens', () => {
    for (const k of ['bens', 'investimentos', 'contas', 'dividas', 'emprestimos', 'cartao']) {
      expect(t.itens[k].reduce((s, i) => s + i.valor, 0)).toBe(t[k])
    }
  })
})
