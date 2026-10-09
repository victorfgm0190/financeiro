import { describe, it, expect } from 'vitest'
import {
  ordenarCategorias, ordenarGrupos, ordemGruposSalva, reordenarNoGrupo, ordemAoTrocarDeGrupo,
} from './ordemCategorias'

const ids = (l) => l.map(c => c.id)

describe('ordenarGrupos', () => {
  it('sem ordem salva: GROUP_ORDER e depois alfabética', () => {
    expect(ordenarGrupos(['Zeta', 'Transporte', 'Alimentação', 'Beta'])).toEqual(['Alimentação', 'Transporte', 'Beta', 'Zeta'])
  })

  it('com ordem salva: segue o array; grupos fora dele vão depois na ordem padrão', () => {
    expect(ordenarGrupos(['Alimentação', 'Transporte', 'Zeta', 'Beta'], ['Zeta', 'Transporte']))
      .toEqual(['Zeta', 'Transporte', 'Alimentação', 'Beta'])
  })

  it('ordemGruposSalva só vale com a flag de ordem manual', () => {
    expect(ordemGruposSalva({ categoryGroups: ['B', 'A'] })).toBeNull()
    expect(ordemGruposSalva({ categoryGroups: ['B', 'A'], categoryGroupsOrdemManual: true })).toEqual(['B', 'A'])
  })
})

describe('ordenarCategorias', () => {
  const cats = [
    { id: 'uber', name: 'Uber', group: 'Transporte' },
    { id: 'mercado', name: 'Mercado', group: 'Alimentação' },
    { id: 'avulsa', name: 'Avulsa', group: null },
    { id: 'combustivel', name: 'Combustível', group: 'Transporte' },
    { id: 'restaurante', name: 'Restaurante', group: 'Alimentação' },
  ]

  it('sem sort_order: grupos na ordem padrão, categorias alfabéticas, sem grupo no fim', () => {
    expect(ids(ordenarCategorias(cats))).toEqual(['mercado', 'restaurante', 'combustivel', 'uber', 'avulsa'])
  })

  it('com sort_order: segue a ordem manual dentro do grupo', () => {
    const c = cats.map(x => x.id === 'restaurante' ? { ...x, sortOrder: 0 } : x.id === 'mercado' ? { ...x, sortOrder: 1 } : x)
    expect(ids(ordenarCategorias(c))).toEqual(['restaurante', 'mercado', 'combustivel', 'uber', 'avulsa'])
  })

  it('sem sort_order vai no fim do grupo, alfabética', () => {
    const c = [
      { id: 'b', name: 'B', group: 'G', sortOrder: null },
      { id: 'z', name: 'Z', group: 'G', sortOrder: 0 },
      { id: 'a', name: 'A', group: 'G' },
    ]
    expect(ids(ordenarCategorias(c))).toEqual(['z', 'a', 'b'])
  })

  it('grupos reordenados', () => {
    expect(ids(ordenarCategorias(cats, ['Transporte', 'Alimentação']))).toEqual(['combustivel', 'uber', 'mercado', 'restaurante', 'avulsa'])
  })

  it('não muta a lista recebida', () => {
    const copia = [...cats]
    ordenarCategorias(cats)
    expect(cats).toEqual(copia)
  })
})

describe('reordenarNoGrupo', () => {
  const grupo = [
    { id: 'a', name: 'A', group: 'G' },
    { id: 'b', name: 'B', group: 'G' },
    { id: 'c', name: 'C', group: 'G' },
  ]
  it('move para cima/baixo e numera o grupo inteiro', () => {
    expect([...reordenarNoGrupo(grupo, 'c', 0)]).toEqual([['c', 0], ['a', 1], ['b', 2]])
    expect([...reordenarNoGrupo(grupo, 'a', 1)]).toEqual([['b', 0], ['a', 1], ['c', 2]])
  })
  it('índice fora do intervalo é limitado', () => {
    expect([...reordenarNoGrupo(grupo, 'a', 99)]).toEqual([['b', 0], ['c', 1], ['a', 2]])
  })
})

describe('ordemAoTrocarDeGrupo', () => {
  it('categoria trocando de grupo vai para o fim do destino (materializa a ordem dele)', () => {
    const destino = [
      { id: 'y', name: 'Y', group: 'D' },
      { id: 'x', name: 'X', group: 'D' },
    ]
    const m = ordemAoTrocarDeGrupo(destino, 'nova')
    expect([...m]).toEqual([['x', 0], ['y', 1], ['nova', 2]])
    const aplicada = [...destino, { id: 'nova', name: 'A', group: 'D' }].map(c => ({ ...c, sortOrder: m.get(c.id) }))
    expect(ids(ordenarCategorias(aplicada))).toEqual(['x', 'y', 'nova'])
  })

  it('respeita a ordem manual já existente no destino', () => {
    const destino = [
      { id: 'x', name: 'X', group: 'D', sortOrder: 1 },
      { id: 'y', name: 'Y', group: 'D', sortOrder: 0 },
    ]
    expect([...ordemAoTrocarDeGrupo(destino, 'nova')]).toEqual([['y', 0], ['x', 1], ['nova', 2]])
  })
})
