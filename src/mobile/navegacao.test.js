import { describe, it, expect } from 'vitest'
import { abas, acoes, secoesMais, resolverCards, prefDosCards, moduloDaPagina } from './navegacao'

const M = [
  { id: 'a', place: 'tab' }, { id: 'b', place: 'tab', card: true }, { id: 'c', place: 'tab' },
  { id: 'd', place: 'tab' }, { id: 'e', place: 'tab' },
  { id: 'r', place: 'more', group: 'G1', card: true, page: 'reservas' },
  { id: 'x', place: 'more', group: 'G2' }, { id: 'y', place: 'more', group: 'G1', card: true },
  { id: 'p1', place: 'action', primary: true }, { id: 'p2', place: 'action' },
  { id: 'dk', place: 'desktop' }, { id: 'cfg', place: 'config' },
]

describe('navegação mobile', () => {
  it('barra inferior: no máximo 4 abas, na ordem do registro', () => {
    expect(abas(M).map(m => m.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('ações do "+": primárias e lista', () => {
    const r = acoes(M)
    expect(r.primarias.map(m => m.id)).toEqual(['p1'])
    expect(r.outras.map(m => m.id)).toEqual(['p2'])
  })

  it('"Mais": grupos na ordem, depois computador e configurações', () => {
    expect(secoesMais(M).map(s => [s.titulo, s.itens.map(i => i.id)])).toEqual([
      ['G1', ['r', 'y']], ['G2', ['x']], ['Melhor no computador', ['dk']], ['Configurações', ['cfg']],
    ])
  })

  it('cards: sem preferência → todos ligados na ordem do registro', () => {
    expect(prefDosCards(resolverCards(M, null))).toEqual([
      { id: 'b', on: true }, { id: 'r', on: true }, { id: 'y', on: true },
    ])
  })

  it('cards: preferência manda na ordem e no liga/desliga; card novo entra ligado no fim', () => {
    const pref = [{ id: 'y', on: false }, { id: 'zz', on: true }, { id: 'b', on: true }]
    expect(prefDosCards(resolverCards(M, pref))).toEqual([
      { id: 'y', on: false }, { id: 'b', on: true }, { id: 'r', on: true },
    ])
  })

  it('módulo pela página do desktop', () => {
    expect(moduloDaPagina(M, 'reservas').id).toBe('r')
    expect(moduloDaPagina(M, 'nada')).toBeNull()
  })
})
