import { describe, it, expect } from 'vitest'
import {
  KIT_PF, KIT_PJ, categoriasDoKit, normalizarNomeCategoria, categoriasFaltantes, categoriaDeCapital, capitalFaltante, GRUPO_CAPITAL,
} from './kitCategorias.js'

describe('kit de categorias', () => {
  it('PF e PJ têm o grupo de capital, com receita e despesa', () => {
    for (const kit of [KIT_PF, KIT_PJ]) {
      const capital = categoriasDoKit(kit).filter(c => c[5] === GRUPO_CAPITAL)
      expect(capital.map(c => [c[0], c[1], c[2]])).toEqual([
        ['cat_kit_ganho_capital', 'Ganho de capital', 'income'],
        ['cat_kit_perda_capital', 'Perda de capital', 'expense'],
      ])
    }
  })
  it('ids únicos dentro de cada kit', () => {
    for (const kit of [KIT_PF, KIT_PJ]) {
      const ids = categoriasDoKit(kit).map(c => c[0])
      expect(new Set(ids).size).toBe(ids.length)
    }
  })
})

describe('faltantes', () => {
  it('compara sem acento, maiúsculas e espaços', () => {
    expect(normalizarNomeCategoria('  Manutenção   VEICULAR ')).toBe('manutencao veicular')
    const faltam = categoriasFaltantes('PF', [{ id: 'x', name: 'manutencao veicular' }, { id: 'y', name: 'AGUA' }]).map(c => c.name)
    expect(faltam).not.toContain('Manutenção veicular')
    expect(faltam).not.toContain('Água')
    expect(faltam).toContain('Energia')
  })
  it('categoria do kit renomeada pelo cliente (mesmo id) não volta como faltante', () => {
    const faltam = categoriasFaltantes('PF', [{ id: 'cat_kit_energia', name: 'Luz' }]).map(c => c.id)
    expect(faltam).not.toContain('cat_kit_energia')
  })
  it('usa o kit do tipo do cliente, respeita o grupo e inclui a categoria do sistema', () => {
    const pj = categoriasFaltantes('PJ', [])
    expect(pj.map(c => c.name)).toContain('Fornecedores')
    expect(pj.map(c => c.name)).not.toContain('Mercado')
    expect(pj.find(c => c.name === 'Perda de capital')).toMatchObject({ group: GRUPO_CAPITAL, type: 'expense' })
    expect(pj.find(c => c.id === 'cat_res_ger')).toMatchObject({ group: null })
    expect(categoriasFaltantes('PF', []).map(c => c.name)).toContain('Mercado')
  })
})

describe('ganho e perda de capital', () => {
  const vm = [{ id: 'cat_1', name: 'Perda de Capital', type: 'expense' }, { id: 'cat_2', name: 'Ganho de capital', type: 'income' }]
  it('acha pelo nome parecido e pelo tipo certo', () => {
    expect(categoriaDeCapital(vm, 'perda').id).toBe('cat_1')
    expect(categoriaDeCapital(vm, 'ganho').id).toBe('cat_2')
    expect(categoriaDeCapital([{ id: 'r', name: 'perda de capital', type: 'income' }], 'perda')).toBeNull()
  })
  it('só falta o que não existe', () => {
    expect(capitalFaltante(vm)).toEqual([])
    expect(capitalFaltante([vm[0]]).map(c => c.id)).toEqual(['cat_kit_ganho_capital'])
    expect(capitalFaltante([]).map(c => c.group)).toEqual([GRUPO_CAPITAL, GRUPO_CAPITAL])
  })
})
