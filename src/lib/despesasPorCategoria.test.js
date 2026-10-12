import { describe, it, expect } from 'vitest'
import { despesasPorCategoria, periodoDoFiltro } from './despesasPorCategoria'

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
  it('cheio: soma sem descontar resgate; % sobre o total de despesas (com sem-categoria)', () => {
    const { categorias, totalDespesas } = despesasPorCategoria(TX, P, cls, 'cheio')
    expect(totalDespesas).toBe(7005.84)
    expect(categorias.map(c => [c.categoryId, c.valor])).toEqual([['aniv', 4005.84], ['mob', 2500]])
    expect(categorias[0].pct).toBeCloseTo((4005.84 / 7005.84) * 100)
  })

  it('líquido: despesa menos o resgate da mesma categoria; resgate sem despesa é ignorado', () => {
    const { categorias, totalDespesas } = despesasPorCategoria(TX, P, cls, 'liquido')
    expect(totalDespesas).toBe(7005.84)
    expect(categorias.map(c => [c.categoryId, c.valor])).toEqual([['mob', 2500], ['aniv', 2228.65]])
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
