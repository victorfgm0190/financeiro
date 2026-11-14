import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { montarPlanilha, nomeArquivoFinup } from './exportExcel'
import { specRelatorioFavorecido } from './relatorioFavorecidoExcel'

const ident = { nomeAmbiente: 'Família Exemplo', frase: '', perfil: 'Todos os perfis' }
const grupos = [
  { payee: 'Mercado Bom', pago: 300, recebido: 0, txs: [
    { id: 1, type: 'expense', amount: 100, date: '2026-10-05', description: 'Compra 1', accountId: 'cc' },
    { id: 2, type: 'expense', amount: 200, date: '2026-10-12', description: 'Compra 2', accountId: 'cc' },
  ] },
  { payee: 'Empresa X', pago: 0, recebido: 5000, txs: [
    { id: 3, type: 'income', amount: 5000, date: '2026-10-05', description: 'Salário', accountId: 'cc' },
  ] },
]
const ler = async (spec) => {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await montarPlanilha(ExcelJS, spec, { ident }).xlsx.writeBuffer())
  return wb.worksheets[0]
}
const celulas = (ws) => {
  const out = []
  ws.eachRow((row, r) => row.eachCell((c, col) => out.push({ r, col, v: c.value })))
  return out
}

describe('Movimentação por Favorecido em Excel', () => {
  it('grupo, lançamentos e subtotal por fórmula; total e resumo sem somar os subtotais', async () => {
    const spec = specRelatorioFavorecido(grupos, { accounts: [{ id: 'cc', name: 'Conta' }], from: '2026-10-01', to: '2026-10-31', filtros: ['Contas: todas'] })
    expect(spec.titulo).toBe('Movimentação por Favorecido')
    expect(nomeArquivoFinup(spec.nomeArquivo.relatorio, spec.nomeArquivo.periodo)).toBe('Finup_Movimentacao-por-Favorecido_2026-10-01_2026-10-31.xlsx')
    const ws = await ler(spec)
    const todas = celulas(ws)
    const formulas = todas.filter(c => c.v && c.v.formula)
    const sub = formulas.filter(c => /^SUM\([A-Z]+\d+:[A-Z]+\d+\)$/.test(c.v.formula))
    // Subtotal Mercado Bom (pago) = 300, Empresa X (recebido) = 5000.
    expect(sub.map(c => c.v.result)).toEqual(expect.arrayContaining([300, 5000]))
    const total = todas.find(c => c.v === 'TOTAL')
    const linhaTotal = todas.filter(c => c.r === total.r && c.v?.formula)
    expect(linhaTotal.map(c => c.v.result)).toEqual([300, 5000])
    expect(linhaTotal.every(c => c.v.formula.includes('"D"'))).toBe(true)
    expect(todas.find(c => c.r === total.r && c.col === 2).v).toBe('3 lançamentos')
    const cartoes = formulas.filter(c => c.r < total.r && /SUMIFS|^\d/.test(c.v.formula) && !/^SUM\(/.test(c.v.formula))
    expect(cartoes[0].v.result).toBe(5300)
    expect(todas.some(c => c.v === 'Maior favorecido: Empresa X')).toBe(true)
    expect(todas.some(c => c.v === 'Período: 01/10/2026 a 31/10/2026   ·   Contas: todas')).toBe(true)
  })

  it('outro período (filtro diferente): só o que veio na tela', async () => {
    const ws = await ler(specRelatorioFavorecido(grupos.slice(1), { from: '2026-01-01', to: '2026-12-31' }))
    const todas = celulas(ws)
    const total = todas.find(c => c.v === 'TOTAL')
    expect(todas.filter(c => c.r === total.r && c.v?.formula).map(c => c.v.result ?? 0)).toEqual([0, 5000])
    expect(todas.some(c => c.v === 'Período: 01/01/2026 a 31/12/2026')).toBe(true)
  })
})
