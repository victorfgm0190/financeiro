import { describe, it, expect } from 'vitest'
import { EMPTY_LANC_FILTROS, hasLancFiltros, matchLancFiltros, matchDataFiltro } from './utils'

const txs = [
  { id: 'a', type: 'expense', date: '2026-10-31', dateCartao: '2026-10-30', amount: 205.61, description: 'YELUMSEG PARC 2/12' },
  { id: 'b', type: 'expense', date: '2026-10-03', amount: 205.99, description: 'MERCADO' },
  { id: 'c', type: 'expense', date: '2026-09-13', amount: 206, description: 'FARMACIA' },
  { id: 'd', type: 'income', date: '2025-10-31', amount: 50, description: 'ESTORNO' },
]
const filtrar = (f) => txs.filter(t => matchLancFiltros(t, { ...EMPTY_LANC_FILTROS, ...f }, [])).map(t => t.id)

describe('filtros da tela Cartão', () => {
  it('valor exato', () => {
    expect(filtrar({ valor: '205.61' })).toEqual(['a'])
    expect(filtrar({ valor: '50' })).toEqual(['d'])
  })
  it('valor aproximado = mesma parte inteira (regra da busca global)', () => {
    expect(filtrar({ valor: '205', valorModo: 'aproximado' })).toEqual(['a', 'b'])
  })
  it('data completa, com ano de 2 dígitos e só dd/mm', () => {
    expect(filtrar({ data: '31/10/2026' })).toEqual(['a'])
    expect(filtrar({ data: '31/10/26' })).toEqual(['a'])
    expect(filtrar({ data: '31/10' })).toEqual(['a', 'd'])
    expect(filtrar({ data: '3/10' })).toEqual(['b'])
  })
  it('data do cartão também casa; texto parcial casa por trecho', () => {
    expect(matchDataFiltro('30/10', '2026-10-31', '2026-10-30')).toBe(true)
    expect(filtrar({ data: '/10/2026' })).toEqual(['a', 'b'])
  })
  it('valor conta como filtro ativo e o limpar (EMPTY) zera', () => {
    expect(hasLancFiltros({ ...EMPTY_LANC_FILTROS, valor: '10' })).toBe(true)
    expect(hasLancFiltros(EMPTY_LANC_FILTROS)).toBe(false)
    expect(filtrar({ valor: '205.61', data: '31/10' })).toEqual(['a'])
  })
})
