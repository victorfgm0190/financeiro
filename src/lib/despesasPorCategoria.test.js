import { describe, it, expect } from 'vitest'
import { despesasPorCategoria, periodoDoFiltro, agruparTopN, corDaCategoria, OUTRAS_ID, COR_OUTRAS, CORES_TOP, SEM_CATEGORIA_ID, COR_SEM_CATEGORIA } from './despesasPorCategoria'

// Classificação mínima: despesa = type expense; resgate = receita com id tx_rsg_.
const cls = {
  isExpenseTx: (t) => t.type === 'expense',
  isResgateReservaSombra: (t) => typeof t.id === 'string' && t.id.startsWith('tx_rsg_'),
}
const P = { start: '2026-10-01', end: '2026-10-31' }
const TX = [
  { id: 'a1', type: 'expense', categoryId: 'aniv', amount: 3000, date: '2026-10-05' },
  { id: 'a2', type: 'expense', categoryId: 'aniv', amount: 1005.84, date: '2026-10-10' },
  { id: 'tx_rsg_1', type: 'income', categoryId: 'aniv', amount: 1777.19, date: '2026-10-10', reservaAuto: true },
  { id: 'm1', type: 'expense', categoryId: 'mob', amount: 2500, date: '2026-10-12' },
  { id: 's1', type: 'expense', categoryId: null, amount: 500, date: '2026-10-12' },
  { id: 'fora', type: 'expense', categoryId: 'mob', amount: 999, date: '2026-11-01' },
  { id: 'tx_rsg_2', type: 'income', categoryId: 'sem-despesa', amount: 50, date: '2026-10-12', reservaAuto: true },
]
const soma = (txs) => Math.round(txs.reduce((s, t) => s + t.amount, 0) * 100) / 100

describe('despesasPorCategoria', () => {
  it('cheio: soma sem descontar resgate; "Sem categoria" vira fatia; % sobre o total de despesas', () => {
    const { categorias, totalDespesas, base } = despesasPorCategoria(TX, P, cls, 'cheio')
    expect(totalDespesas).toBe(7005.84)
    expect(base).toBe(7005.84)
    expect(categorias.map(c => [c.categoryId, c.valor])).toEqual([['aniv', 4005.84], ['mob', 2500], [SEM_CATEGORIA_ID, 500]])
    expect(categorias[0].pct).toBeCloseTo((4005.84 / 7005.84) * 100)
  })

  it('líquido: despesa menos o resgate da mesma categoria; base = total líquido', () => {
    const { categorias, totalDespesas, base } = despesasPorCategoria(TX, P, cls, 'liquido')
    expect(totalDespesas).toBe(7005.84)
    expect(base).toBe(5228.65) // 7005,84 − 1777,19 (o resgate sem despesa na categoria é ignorado)
    expect(categorias.map(c => [c.categoryId, c.valor])).toEqual([['mob', 2500], ['aniv', 2228.65], [SEM_CATEGORIA_ID, 500]])
    expect(categorias[0].pct).toBeCloseTo((2500 / 5228.65) * 100)
  })

  it('nos dois modos: soma das fatias = base do % e soma dos % = 100 (top 5 + Outras e todas)', () => {
    const tx = [...TX]
    ;[900, 700, 500, 400, 300, 200, 150, 75.33].forEach((v, i) => {
      tx.push({ id: `d${i}`, type: 'expense', categoryId: `c${i}`, amount: v, date: '2026-10-03' })
      if (i % 2 === 0) tx.push({ id: `tx_rsg_${i}`, type: 'income', categoryId: `c${i}`, amount: v / 3, date: '2026-10-04' })
    })
    for (const modo of ['cheio', 'liquido']) {
      const { categorias, base } = despesasPorCategoria(tx, P, cls, modo)
      for (const n of [5, null]) {
        const { fatias } = agruparTopN(categorias, base, n)
        expect(Math.abs(fatias.reduce((s, f) => s + f.valor, 0) - base)).toBeLessThan(0.011)
        expect(fatias.reduce((s, f) => s + f.pct, 0)).toBeCloseTo(100, 6)
      }
    }
  })

  it('"Sem categoria" fora do top 5 vai para Outras', () => {
    const tx = [{ id: 's', type: 'expense', categoryId: null, amount: 1, date: '2026-10-02' }]
    ;[90, 80, 70, 60, 50].forEach((v, i) => tx.push({ id: `d${i}`, type: 'expense', categoryId: `c${i}`, amount: v, date: '2026-10-02' }))
    const { categorias, base } = despesasPorCategoria(tx, P, cls, 'cheio')
    const { outras } = agruparTopN(categorias, base)
    expect(outras.membros.map(m => m.categoryId)).toEqual([SEM_CATEGORIA_ID])
  })

  it('total da lista do clique = valor do bloco, nos dois modos', () => {
    for (const modo of ['cheio', 'liquido']) {
      for (const c of despesasPorCategoria(TX, P, cls, modo).categorias) {
        const lista = modo === 'liquido' ? soma(c.despesas) - soma(c.resgates) : soma(c.despesas)
        expect(Math.round(lista * 100) / 100).toBe(c.valor)
        expect(c.cheio).toBe(soma(c.despesas))
        expect(c.resgate).toBe(soma(c.resgates))
        expect(c.liquido).toBe(Math.round((c.cheio - c.resgate) * 100) / 100)
      }
    }
  })

  it('categoria com líquido ≤ 0 sai no modo líquido, mas fica no cheio', () => {
    const tx = [
      { id: 'x', type: 'expense', categoryId: 'c', amount: 100, date: '2026-10-02' },
      { id: 'tx_rsg_x', type: 'income', categoryId: 'c', amount: 100, date: '2026-10-02' },
    ]
    expect(despesasPorCategoria(tx, P, cls, 'liquido').categorias).toEqual([])
    expect(despesasPorCategoria(tx, P, cls, 'cheio').categorias).toHaveLength(1)
  })
})

describe('periodoDoFiltro (meses financeiros)', () => {
  // Mês financeiro começando dia 10: hoje = 12/10/2026 → 10/10 a 09/11.
  const fp = (ref = new Date(2026, 9, 12)) => {
    const d = new Date(ref)
    const s = d.getDate() >= 10 ? new Date(d.getFullYear(), d.getMonth(), 10) : new Date(d.getFullYear(), d.getMonth() - 1, 10)
    return { start: s, end: new Date(s.getFullYear(), s.getMonth() + 1, 9) }
  }
  const iso = (d) => d.toISOString().split('T')[0]
  it('atual, anterior e 3 meses seguem o dia de início do mês financeiro', () => {
    expect(periodoDoFiltro('current', fp)).toEqual({ start: iso(new Date(2026, 9, 10)), end: iso(new Date(2026, 10, 9)) })
    expect(periodoDoFiltro('prev', fp)).toEqual({ start: iso(new Date(2026, 8, 10)), end: iso(new Date(2026, 9, 9)) })
    expect(periodoDoFiltro('3m', fp)).toEqual({ start: iso(new Date(2026, 7, 10)), end: iso(new Date(2026, 10, 9)) })
  })
})

describe('agruparTopN (top 5 + Outras)', () => {
  // 8 categorias com despesa e resgates em algumas → valida os dois modos.
  const tx = []
  ;[900, 700, 500, 400, 300, 200, 150, 75.33].forEach((v, i) => {
    tx.push({ id: `d${i}`, type: 'expense', categoryId: `c${i}`, amount: v, date: '2026-10-03' })
    if (i % 2 === 0) tx.push({ id: `tx_rsg_${i}`, type: 'income', categoryId: `c${i}`, amount: v / 4, date: '2026-10-04' })
  })
  tx.push({ id: 'semcat', type: 'expense', categoryId: null, amount: 10, date: '2026-10-04' })

  for (const modo of ['cheio', 'liquido']) {
    it(`soma das fatias = total das categorias do período (${modo})`, () => {
      const { categorias, base } = despesasPorCategoria(tx, P, cls, modo)
      const { fatias, outras } = agruparTopN(categorias, base)
      expect(fatias).toHaveLength(6) // 9 categorias (8 + Sem categoria) → top 5 + Outras
      expect(fatias.slice(0, 5)).toEqual(categorias.slice(0, 5))
      expect(outras.categoryId).toBe(OUTRAS_ID)
      expect(outras.membros).toEqual(categorias.slice(5))
      expect(soma(fatias.map(f => ({ amount: f.valor })))).toBe(soma(categorias.map(c => ({ amount: c.valor }))))
      expect(soma(fatias.map(f => ({ amount: f.pct })))).toBeCloseTo(categorias.reduce((s, c) => s + c.pct, 0))
    })
  }

  it('no modo cheio, com tudo categorizado, a soma das fatias é o total de despesas', () => {
    const soCat = tx.filter(t => t.categoryId)
    const { categorias, totalDespesas } = despesasPorCategoria(soCat, P, cls, 'cheio')
    const { fatias } = agruparTopN(categorias, totalDespesas)
    expect(soma(fatias.map(f => ({ amount: f.valor })))).toBe(totalDespesas)
  })

  it('5 categorias ou menos: sem Outras; n = null devolve todas', () => {
    const cats = despesasPorCategoria(TX, P, cls, 'cheio').categorias
    expect(agruparTopN(cats, 100)).toEqual({ fatias: cats, outras: null })
    const muitas = despesasPorCategoria(tx, P, cls, 'cheio').categorias
    expect(agruparTopN(muitas, 100, null).fatias).toEqual(muitas)
  })
})

describe('corDaCategoria', () => {
  it('top 5 com cores fixas, Outras cinza, demais determinísticas', () => {
    expect(corDaCategoria('x', 0)).toBe(CORES_TOP[0])
    expect(corDaCategoria(OUTRAS_ID, 0)).toBe(COR_OUTRAS)
    expect(corDaCategoria(SEM_CATEGORIA_ID, 0)).toBe(COR_SEM_CATEGORIA)
    expect(COR_SEM_CATEGORIA).not.toBe(COR_OUTRAS)
    expect(corDaCategoria('lazer', 7)).toBe(corDaCategoria('lazer', 12))
    expect(corDaCategoria('lazer', 7)).toMatch(/^hsl\(/)
  })
})
