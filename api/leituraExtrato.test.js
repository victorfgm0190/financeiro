import { describe, it, expect } from 'vitest'
import { normalizarSaidaExtrato, DEFINICAO_EXTRATO, TIPOS_ITEM_EXTRATO } from './_leituraBoleto.js'

// Leitura do extrato da administradora (dados fictícios).
describe('leitura extrato_administradora', () => {
  it('normaliza: valores positivos, natureza, tipo válido; saldo/total/repasse fora dos itens', () => {
    const r = normalizarSaidaExtrato({
      periodo: ' 02/2026 ', saldo_anterior: -16.861, total_extrato: '1370.65', valor_repasse: 0,
      itens: [
        { descricao: 'Aluguel 02/2026', valor: 586.67, natureza: 'credito', tipo: 'aluguel' },
        { descricao: 'Intermediação 1/3', valor: -470, natureza: 'debito', tipo: 'taxa_unica' },
        { descricao: 'SANEPAR', valor: 96.73, natureza: 'debito', tipo: 'despesa', natureza_despesa: 'consumo' },
        { descricao: 'Esquisito', valor: 5, natureza: 'debito', tipo: 'xyz' },
        { descricao: 'Saldo anterior', valor: 16.86, natureza: 'debito', tipo: 'ajuste' },
        { descricao: 'Total', valor: 999, natureza: 'credito', tipo: 'ajuste' },
      ],
    })
    expect(r).toMatchObject({ periodo: '02/2026', saldo_anterior: -16.86, total_extrato: 1370.65, valor_repasse: 0 })
    expect(r.itens.map(i => [i.descricao, i.valor, i.natureza, i.tipo, i.natureza_despesa])).toEqual([
      ['Aluguel 02/2026', 586.67, 'credito', 'aluguel', null],
      ['Intermediação 1/3', 470, 'debito', 'taxa_unica', null],
      ['SANEPAR', 96.73, 'debito', 'despesa', 'consumo'],
      ['Esquisito', 5, 'debito', 'ajuste', null],
    ])
  })
  it('sem repasse: o "Total do Extrato" líquido vem com sinal (última linha, ex.: −606,35)', () => {
    const r = normalizarSaidaExtrato({ periodo: '05/2026', saldo_anterior: -2586.35, total_extrato: -606.35, valor_repasse: null, itens: [] })
    expect(r).toMatchObject({ total_extrato: -606.35, valor_repasse: null })
    expect(DEFINICAO_EXTRATO.input_schema.properties.total_extrato.description).toMatch(/LÍQUIDO.*NEGATIVO.*linha DE BAIXO.*NUNCA a soma dos débitos nem a dos créditos/s)
  })
  it('repasse negativo (saldo devedor) vem com sinal', () => {
    expect(normalizarSaidaExtrato({ valor_repasse: -606.35, itens: [] }).valor_repasse).toBe(-606.35)
    expect(DEFINICAO_EXTRATO.input_schema.properties.valor_repasse.description).toMatch(/NEGATIVO/)
  })
  it('a ferramenta pede os tipos do Finup', () => {
    expect(DEFINICAO_EXTRATO.input_schema.properties.itens.items.properties.tipo.enum).toEqual(TIPOS_ITEM_EXTRATO)
  })
})
