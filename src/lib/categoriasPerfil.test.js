import { describe, it, expect } from 'vitest'
import {
  categoriaDisponivelParaPerfil, filtrarCategoriasPorPerfil, perfilParaCategorias, rotuloPerfis,
} from './categoriasPerfil'

const PF = 'perf_pf'
const PJ = 'perf_pj'
const OUTRO = 'perf_outro'

describe('categoriaDisponivelParaPerfil', () => {
  it('perfilIds NULL/ausente = todos os perfis', () => {
    expect(categoriaDisponivelParaPerfil({ id: 'a', perfilIds: null }, PF)).toBe(true)
    expect(categoriaDisponivelParaPerfil({ id: 'a' }, PJ)).toBe(true)
  })

  it('perfilIds vazio = todos os perfis', () => {
    expect(categoriaDisponivelParaPerfil({ id: 'a', perfilIds: [] }, PF)).toBe(true)
  })

  it('1 perfil: só para ele', () => {
    const cat = { id: 'a', perfilIds: [PJ] }
    expect(categoriaDisponivelParaPerfil(cat, PJ)).toBe(true)
    expect(categoriaDisponivelParaPerfil(cat, PF)).toBe(false)
  })

  it('vários perfis: qualquer um deles', () => {
    const cat = { id: 'a', perfilIds: [PF, PJ] }
    expect(categoriaDisponivelParaPerfil(cat, PF)).toBe(true)
    expect(categoriaDisponivelParaPerfil(cat, PJ)).toBe(true)
    expect(categoriaDisponivelParaPerfil(cat, OUTRO)).toBe(false)
  })

  it('perfil não incluído → indisponível', () => {
    expect(categoriaDisponivelParaPerfil({ id: 'a', perfilIds: [PF] }, OUTRO)).toBe(false)
  })

  it('sem perfil selecionado ("Tudo") → tudo disponível', () => {
    expect(categoriaDisponivelParaPerfil({ id: 'a', perfilIds: [PF] }, null)).toBe(true)
    expect(categoriaDisponivelParaPerfil({ id: 'a', perfilIds: [PF] }, '')).toBe(true)
  })
})

describe('filtrarCategoriasPorPerfil', () => {
  const cats = [
    { id: 'todos_null', perfilIds: null },
    { id: 'todos_vazio', perfilIds: [] },
    { id: 'so_pf', perfilIds: [PF] },
    { id: 'so_pj', perfilIds: [PJ] },
    { id: 'pf_pj', perfilIds: [PF, PJ] },
  ]
  const ids = (l) => l.map(c => c.id)

  it('filtra pelo perfil', () => {
    expect(ids(filtrarCategoriasPorPerfil(cats, PF))).toEqual(['todos_null', 'todos_vazio', 'so_pf', 'pf_pj'])
    expect(ids(filtrarCategoriasPorPerfil(cats, PJ))).toEqual(['todos_null', 'todos_vazio', 'so_pj', 'pf_pj'])
    expect(ids(filtrarCategoriasPorPerfil(cats, OUTRO))).toEqual(['todos_null', 'todos_vazio'])
  })

  it('sem perfil devolve a lista inteira', () => {
    expect(filtrarCategoriasPorPerfil(cats, null)).toBe(cats)
  })

  it('mantém a categoria já gravada mesmo sendo de outro perfil', () => {
    expect(ids(filtrarCategoriasPorPerfil(cats, PF, ['so_pj']))).toContain('so_pj')
    expect(ids(filtrarCategoriasPorPerfil(cats, PF, 'so_pj'))).toContain('so_pj')
  })
})

describe('perfilParaCategorias', () => {
  const accounts = [{ id: 'c1', profileId: PJ }, { id: 'c2', profileId: null }]
  it('perfil da conta vence o chip do topo', () => {
    expect(perfilParaCategorias(accounts, 'c1', PF)).toBe(PJ)
  })
  it('conta sem perfil → chip do topo', () => {
    expect(perfilParaCategorias(accounts, 'c2', PF)).toBe(PF)
    expect(perfilParaCategorias(accounts, null, null)).toBe(null)
  })
})

describe('rotuloPerfis', () => {
  const profiles = [{ id: PF, name: 'Victor' }, { id: PJ, name: 'Lumen Tech' }]
  it('Todos / nome / N perfis', () => {
    expect(rotuloPerfis(null, profiles)).toBe('Todos')
    expect(rotuloPerfis([], profiles)).toBe('Todos')
    expect(rotuloPerfis([PJ], profiles)).toBe('Lumen Tech')
    expect(rotuloPerfis([PF, PJ], profiles)).toBe('2 perfis')
  })
})
