import { describe, it, expect } from 'vitest'
import { parseMoedaBR, formatarMoedaBR, moedaParaEdicao } from './valorBR'

describe('parseMoedaBR', () => {
  it.each([
    ['1.500,50', 1500.5],
    ['1500,50', 1500.5],
    ['1500.50', 1500.5],
    ['1500', 1500],
    ['20', 20],
    ['1500,5', 1500.5],
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56], // ponto e vírgula juntos: o último separador é o decimal
    ['1.234', 1234], // ponto + exatamente 3 dígitos: milhar
    ['1.234.567', 1234567],
    ['1500.5', 1500.5], // ponto + 1–2 dígitos: decimal
    ['1.5', 1.5],
    ['12.345.678,90', 12345678.9],
    ['1,5', 1.5], // vírgula é sempre decimal
    ['1,234', 1.23], // nunca 1234
    ['100,000', 100],
    ['20,000', 20],
    ['1500,555', 1500.55], // casas além da 2ª descartadas, sem arredondar
    ['100,009', 100],
    ['10,1234', 10.12],
    ['1500,', 1500],
    ['0,5', 0.5],
    [',5', 0.5],
    ['0', 0],
    ['0,00', 0],
  ])('%s → %s', (texto, n) => {
    expect(parseMoedaBR(texto)).toBe(n)
  })

  it('colado de extrato: R$, espaços e sinal', () => {
    expect(parseMoedaBR('R$ 1.234,56')).toBe(1234.56)
    expect(parseMoedaBR('R$1.234,56')).toBe(1234.56)
    expect(parseMoedaBR(' 1 234,56 ')).toBe(1234.56)
    expect(parseMoedaBR('-R$ 1.234,56')).toBe(-1234.56)
    expect(parseMoedaBR('R$ -1.234,56')).toBe(-1234.56)
    expect(parseMoedaBR('-20')).toBe(-20)
    expect(parseMoedaBR('1.234,56-')).toBe(-1234.56)
  })

  it('vazio, só separador ou sem dígito → NaN', () => {
    expect(parseMoedaBR('')).toBeNaN()
    expect(parseMoedaBR(null)).toBeNaN()
    expect(parseMoedaBR(',')).toBeNaN()
    expect(parseMoedaBR('.')).toBeNaN()
    expect(parseMoedaBR('-')).toBeNaN()
    expect(parseMoedaBR('R$')).toBeNaN()
  })

  it('valores grandes', () => {
    expect(parseMoedaBR('1.000.000.000,99')).toBe(1000000000.99)
    expect(parseMoedaBR('999999999999,99')).toBe(999999999999.99)
  })
})

describe('formatarMoedaBR', () => {
  it.each([
    [20, '20,00'],
    ['20', '20,00'],
    [1500.5, '1.500,50'],
    [1234.56, '1.234,56'],
    [0, '0,00'],
    ['0', '0,00'],
    [-1234.5, '-1.234,50'],
    [1000000000.99, '1.000.000.000,99'],
    [0.1 + 0.2, '0,30'],
    [-0.001, '0,00'],
  ])('%s → %s', (v, txt) => {
    expect(formatarMoedaBR(v)).toBe(txt)
  })

  it('vazio continua vazio (nunca 0,00)', () => {
    expect(formatarMoedaBR('')).toBe('')
    expect(formatarMoedaBR(null)).toBe('')
    expect(formatarMoedaBR(undefined)).toBe('')
    expect(formatarMoedaBR('abc')).toBe('')
  })
})

describe('moedaParaEdicao', () => {
  it('sem milhar, vírgula decimal, 2 casas', () => {
    expect(moedaParaEdicao(1500.5)).toBe('1500,50')
    expect(moedaParaEdicao('20')).toBe('20,00')
    expect(moedaParaEdicao(-1234.56)).toBe('-1234,56')
    expect(moedaParaEdicao('')).toBe('')
    expect(moedaParaEdicao(null)).toBe('')
  })
})
