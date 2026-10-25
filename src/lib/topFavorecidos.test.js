import { describe, it, expect } from 'vitest'
import { agruparPorFavorecido } from './topFavorecidos'

describe('topFavorecidos', () => {
  it('agrupa por trim + maiúsculas, separa sem favorecido e fecha com o total', () => {
    const txs = [
      { id: 1, payee: 'MAYARA', amount: 100 },
      { id: 2, payee: 'Mayara ', amount: 50 },
      { id: 3, payee: 'Mayara', amount: 30 },
      { id: 4, payee: 'Posto', amount: 200 },
      { id: 5, payee: '  ', amount: 10 },
      { id: 6, amount: 5 },
    ]
    const { grupos, semFavorecido, total } = agruparPorFavorecido(txs)
    expect(total).toBe(395)
    expect(grupos.map(g => [g.nome, g.total, g.qtd])).toEqual([['Posto', 200, 1], ['Mayara', 180, 3]])
    expect(semFavorecido).toMatchObject({ total: 15, qtd: 2 })
    expect(grupos.reduce((s, g) => s + g.total, 0) + semFavorecido.total).toBe(total)
    expect(grupos[0].pct).toBeCloseTo((200 / 395) * 100)
  })

  it('grafia exibida: a mais usada; no empate, a com mais maiúsculas', () => {
    const empate = agruparPorFavorecido([
      { payee: 'posto shell', amount: 1 },
      { payee: 'Posto Shell', amount: 1 },
      { payee: 'POSTO SHELL', amount: 1 },
    ])
    expect(empate.grupos[0].nome).toBe('POSTO SHELL')
    expect(agruparPorFavorecido([
      { payee: 'posto shell', amount: 1 },
      { payee: 'Posto Shell', amount: 1 },
    ]).grupos[0].nome).toBe('Posto Shell')
    const semEmpate = agruparPorFavorecido([
      { payee: 'posto shell', amount: 1 },
      { payee: 'posto shell', amount: 1 },
      { payee: 'POSTO SHELL', amount: 1 },
    ])
    expect(semEmpate.grupos[0].nome).toBe('posto shell')
  })

  it('lista vazia', () => {
    expect(agruparPorFavorecido([])).toEqual({ grupos: [], semFavorecido: { total: 0, qtd: 0, txs: [] }, total: 0 })
  })
})
