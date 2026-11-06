// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { buildReport } from './DemonstrativoFinanceiro'

const fn = { id: 'f', accountId: 'ca', categoryId: 'cat_x', exibirComoDespesa: true }
const tx = [
  { id: 'sal', type: 'income', amount: 1000, accountId: 'itau', date: '2026-10-05', categoryId: 'cat_sal' },
  { id: 'g', type: 'expense', amount: 300, accountId: 'itau', date: '2026-10-06', categoryId: 'cat_x' },
  { id: 'tx_rsg_1_r', type: 'income', amount: 100, accountId: null, date: '2026-10-07', categoryId: 'cat_x', reservaFuncaoId: 'f', reservaAuto: true, description: 'Resgate Reserva: CA' },
  { id: 'tx_rsg_1_d', type: 'expense', amount: 100, accountId: null, date: '2026-10-07', categoryId: 'cat_x', reservaFuncaoId: 'f', reservaAuto: true, description: 'Resgate Reserva: CA' },
]
const cats = [{ id: 'cat_sal', name: 'Salário' }, { id: 'cat_x', name: 'Consórcio' }]
const relatorio = (modo) => buildReport(tx, cats, '2026-10-01', '2026-10-31', [], [], new Set(), null, false, new Set(['f']), new Set(['ca']), [fn], null, null, modo)

describe('Demonstrativo: bruto × líquido', () => {
  it('bruto: despesa inteira e resgate em receitas, em grupo próprio e positivo', () => {
    const r = relatorio('cheio')
    expect(r.totalIncome).toBe(1100)
    expect(r.totalExpense).toBe(300)
    expect(r.income.find(g => g.name === 'Resgates de reserva').total).toBe(100)
    expect(r.expenses.flatMap(g => g.subcats).flatMap(s => s.txs).map(t => t.id)).toEqual(['g'])
  })
  it('líquido: resgate abate a categoria e não aparece em receitas', () => {
    const r = relatorio('liquido')
    expect(r.totalIncome).toBe(1000)
    expect(r.totalExpense).toBe(200)
    expect(r.income.some(g => g.name === 'Resgates de reserva')).toBe(false)
  })
  it('o resultado é o mesmo nos dois modos', () => {
    const b = relatorio('cheio'); const l = relatorio('liquido')
    expect(b.totalIncome - b.totalExpense).toBe(l.totalIncome - l.totalExpense)
  })
})
