import { describe, it, expect } from 'vitest'
import { parseValorBR, valorParaInput } from './valorBR'

describe('parseValorBR', () => {
  it('com vírgula: vírgula é decimal, pontos são milhar', () => {
    expect(parseValorBR('1.234,56')).toBe(1234.56)
    expect(parseValorBR('341,7')).toBe(341.7)
    expect(parseValorBR('341,70')).toBe(341.7)
    expect(parseValorBR('12.345.678,9')).toBe(12345678.9)
    expect(parseValorBR('1234,56')).toBe(1234.56)
  })

  it('sem vírgula, ponto seguido de 3 dígitos é milhar', () => {
    expect(parseValorBR('1.234')).toBe(1234)
    expect(parseValorBR('12.345.678')).toBe(12345678)
    expect(parseValorBR('341.700')).toBe(341700)
  })

  it('sem vírgula, ponto seguido de 1 ou 2 dígitos é decimal', () => {
    expect(parseValorBR('341.7')).toBe(341.7)
    expect(parseValorBR('341.70')).toBe(341.7)
    expect(parseValorBR('0.5')).toBe(0.5)
  })

  it('sem separador é inteiro', () => {
    expect(parseValorBR('350')).toBe(350)
    expect(parseValorBR('0')).toBe(0)
  })

  it('ignora espaços e R$', () => {
    expect(parseValorBR(' R$ 1.234,56 ')).toBe(1234.56)
  })

  it('vazio ou malformado → NaN', () => {
    expect(parseValorBR('')).toBeNaN()
    expect(parseValorBR(null)).toBeNaN()
    expect(parseValorBR('abc')).toBeNaN()
    expect(parseValorBR('1.23.4')).toBeNaN()
    expect(parseValorBR('12.34,5')).toBeNaN()
    expect(parseValorBR('1,2,3')).toBeNaN()
    expect(parseValorBR('1234.567')).toBeNaN()
  })
})

describe('valorParaInput', () => {
  it('formata com vírgula e 2 casas', () => {
    expect(valorParaInput(341.7)).toBe('341,70')
    expect(valorParaInput(1234)).toBe('1234,00')
    expect(valorParaInput('')).toBe('')
    expect(valorParaInput(null)).toBe('')
  })

  it('ida e volta preserva o valor', () => {
    for (const v of [0.5, 341.7, 1234.56, 12345678.9]) expect(parseValorBR(valorParaInput(v))).toBe(v)
  })
})
