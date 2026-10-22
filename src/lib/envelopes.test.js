import { describe, it, expect } from 'vitest'
import { gastoEnvelopes, ehParcela, resumoEnvelope, resumosPorUso, totaisEnvelopes, barraEnvelope } from './envelopes'

const tx = (id, amount, extra = {}) => ({ id, type: 'expense', amount, date: '2026-10-20', categoryId: 'merc', ...extra })

describe('ehParcela (critério: installmentNum >= 1 e installmentTotal > 1)', () => {
  it('parcela pelos campos gravados', () => {
    expect(ehParcela({ installmentNum: 4, installmentTotal: 6 })).toBe(true)
    expect(ehParcela({ installmentNum: '3', installmentTotal: '3' })).toBe(true)
  })
  it('sem campos, à vista: a descrição "x/y" NÃO conta', () => {
    expect(ehParcela({ description: 'Amazon Marketplace 4/6' })).toBe(false)
    expect(ehParcela({ installmentNum: null, installmentTotal: null, description: 'Pizza 1/2' })).toBe(false)
  })
  it('total 1 ou número 0 não é parcela', () => {
    expect(ehParcela({ installmentNum: 1, installmentTotal: 1 })).toBe(false)
    expect(ehParcela({ installmentNum: 0, installmentTotal: 5 })).toBe(false)
    expect(ehParcela(null)).toBe(false)
  })
})

describe('resumo dos envelopes (em cima de gastoEnvelopes, sem cálculo novo de gasto)', () => {
  const envs = [
    { id: 'e1', name: 'SUPERMERCADO', limitAmount: 4000, categoryIds: ['merc'] },
    { id: 'e2', name: 'LAZER', limitAmount: 100, categoryIds: ['lazer'] },
  ]
  const txs = [
    tx('a', 150.5, { installmentNum: 4, installmentTotal: 6, description: 'Amazon Marketplace 4/6' }),
    tx('b', 49.5, { description: 'Padaria 2/3' }), // texto sem campo → à vista
    tx('c', 120, { categoryId: 'lazer' }),
    tx('d', 999, { date: '2026-09-01' }), // outra competência
  ]
  const dados = gastoEnvelopes(envs, txs, 2026 * 12 + 9, 15)

  it('parcelado + à vista = gasto da tela Envelopes', () => {
    const r = resumoEnvelope(dados[0])
    expect(r).toMatchObject({ limite: 4000, gasto: 200, parcelado: 150.5, aVista: 49.5, disponivel: 3800, estourado: false })
    expect(r.parcelado + r.aVista).toBe(dados[0].spent)
  })
  it('estourado: disponível negativo; ordem pelo % usado', () => {
    const rs = resumosPorUso(dados)
    expect(rs.map(r => r.env.name)).toEqual(['LAZER', 'SUPERMERCADO'])
    expect(rs[0]).toMatchObject({ estourado: true, disponivel: -20 })
  })
  it('totais do topo', () => {
    expect(totaisEnvelopes(resumosPorUso(dados))).toEqual({ limite: 4100, gasto: 320, parcelado: 150.5, aVista: 169.5, disponivel: 3780 })
  })
  it('barra: proporção do limite; estourado ocupa a barra inteira', () => {
    expect(barraEnvelope({ limite: 400, parcelado: 100, aVista: 100, gasto: 200 })).toEqual({ parcelado: 25, aVista: 25 })
    expect(barraEnvelope({ limite: 100, parcelado: 150, aVista: 50, gasto: 200 })).toEqual({ parcelado: 75, aVista: 25 })
    expect(barraEnvelope({ limite: 0, parcelado: 0, aVista: 0, gasto: 0 })).toEqual({ parcelado: 0, aVista: 0 })
  })
})
