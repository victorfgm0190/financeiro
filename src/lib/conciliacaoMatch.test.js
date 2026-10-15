import { describe, it, expect } from 'vitest'
import { crossMatchConciliacao, descSimilarity, normalizeDescForMatch, stripParcelaSuffix } from './conciliacaoMatch'

// A compra e o estorno dela, como chegam numa fatura do Itaú: mesma descrição, mesmo valor,
// tipos opostos. É a assinatura de um estorno — e era exatamente o que fazia o casamento por
// valor+descrição tratá-lo como duplicata da própria compra e descartá-lo da importação.
const compra = {
  id: 'tx_1', type: 'expense', amount: 149.95,
  description: 'Aramis', date: '2026-07-10', dateCartao: '2026-07-10',
}
const estornoDaCompra = {
  type: 'income', amount: 149.95,
  description: 'Aramis', date: '2026-07-10', _dateCartao: '2026-07-10',
}

describe('crossMatchConciliacao', () => {
  it('não pré-marca o estorno como "ignorar" por causa da compra que ele estorna', () => {
    const { soItau, soSistema } = crossMatchConciliacao(
      [{ ...estornoDaCompra, _id: 'conc_0', acao: 'importar' }],
      [{ ...compra, acao: 'manter' }],
    )
    // Sem o casamento por tipo o estorno virava acao='ignorar' e nunca era importado.
    expect(soItau[0].acao).toBe('importar')
    expect(soItau[0]._crossLevel).toBeUndefined()
    expect(soSistema[0]._crossLevel).toBeUndefined()
  })

  it('pré-marca a despesa que já está no sistema', () => {
    const { soItau, soSistema } = crossMatchConciliacao(
      [{ _id: 'conc_0', type: 'expense', amount: 149.95, description: 'Aramis', acao: 'importar' }],
      [{ ...compra, acao: 'manter' }],
    )
    expect(soItau[0]._crossLevel).toBe('certeza')
    expect(soItau[0].acao).toBe('ignorar')
    expect(soSistema[0].acao).toBe('manter')
  })

  it('casa a parcela do Itaú ("1/3") com a do sistema ("01/03")', () => {
    const { soItau } = crossMatchConciliacao(
      [{ _id: 'conc_0', type: 'expense', amount: 666.34, description: 'Clinica Higa-ct Lt 1/3', acao: 'importar' }],
      [{ id: 'tx_9', type: 'expense', amount: 666.34, description: 'CLINICA HIGA-CT LT01/03', acao: 'manter' }],
    )
    expect(soItau[0]._crossLevel).toBe('certeza')
  })

  it('casa 1:1 — o mesmo lançamento do sistema não serve a dois itens do Itaú', () => {
    const doisIguais = [
      { _id: 'conc_0', type: 'expense', amount: 50, description: 'Uber', acao: 'importar' },
      { _id: 'conc_1', type: 'expense', amount: 50, description: 'Uber', acao: 'importar' },
    ]
    const { soItau } = crossMatchConciliacao(doisIguais, [{ id: 'tx_u', type: 'expense', amount: 50, description: 'Uber', acao: 'manter' }])
    expect(soItau[0].acao).toBe('ignorar')
    expect(soItau[1].acao).toBe('importar')
  })
})

describe('descSimilarity / normalizeDescForMatch', () => {
  it('mede identidade, continência e palavras em comum', () => {
    expect(descSimilarity('Aramis', 'aramis')).toBe(1)
    expect(descSimilarity('Aramis', 'Aramis Loja')).toBe(0.9)
    expect(descSimilarity('Posto Shangri-la', 'Mercado Livre')).toBeLessThan(0.5)
    expect(descSimilarity('', 'Aramis')).toBe(0)
  })

  it('ignora acento, caixa e sufixo de parcela', () => {
    expect(normalizeDescForMatch('Clínica Higa-ct Lt 1/3')).toBe(normalizeDescForMatch('CLINICA HIGA-CT LT01/03'))
  })
})

describe('stripParcelaSuffix — parcela por extenso', () => {
  it('"Yelumseg Parc6" e "Yelumseg Parc7" têm a mesma base', () => {
    expect(stripParcelaSuffix('Yelumseg Parc6')).toBe('Yelumseg')
    expect(stripParcelaSuffix('Yelumseg Parc 07')).toBe('Yelumseg')
    expect(stripParcelaSuffix('ABC PARC 3/10')).toBe('ABC')
    expect(stripParcelaSuffix('Loja Parcela 2 de 5')).toBe('Loja')
  })

  it('mantém o comportamento para N/Total e para descrição sem parcela', () => {
    expect(stripParcelaSuffix('CLINICA HIGA-CT LT01/03')).toBe('CLINICA HIGA-CT LT')
    expect(stripParcelaSuffix('Parceria Escola')).toBe('Parceria Escola')
  })

  it('crossMatchConciliacao casa "Parc7" do Itaú com "Parc7" já gravada', () => {
    const { soItau } = crossMatchConciliacao(
      [{ type: 'expense', description: 'YELUMSEG PARC 07', amount: 205.61 }],
      [{ id: 's1', type: 'expense', description: 'Yelumseg Parc7', amount: 205.61 }],
    )
    expect(soItau[0]._crossLevel).toBe('certeza')
  })
})
