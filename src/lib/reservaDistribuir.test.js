import { describe, it, expect } from 'vitest'
import { saldoADistribuir, ratearProporcional, erroDistribuicao } from './reservaDistribuir.js'

const fns = [
  { id: 'a', nome: 'Help', saldo: 10535.64 },
  { id: 'b', nome: 'Pneus', saldo: 4985.22 },
  { id: 'c', nome: 'Consórcio', saldo: -8608.14 },
  { id: 'd', nome: 'Parto', saldo: 0 },
  { id: 'e', nome: 'Seguro', saldo: 76.24 },
]
const soma = (o) => Math.round(Object.values(o).reduce((s, v) => s + v, 0) * 100) / 100

describe('saldo a distribuir', () => {
  it('saldo real − Σ saldos das funções (pode ser negativo)', () => {
    expect(saldoADistribuir(39557.79, [38608.82])).toBe(948.97)
    expect(saldoADistribuir(2882.09, [24100.5])).toBe(-21218.41)
  })
  it('rateio proporcional só entre positivas, soma exata, centavos na maior', () => {
    const r = ratearProporcional(fns, 948.97)
    expect(soma(r)).toBe(948.97)
    expect(r.c).toBeUndefined()
    expect(r.d).toBeUndefined()
    expect(r.a).toBeGreaterThan(r.b)
    expect(soma(ratearProporcional(fns, -200))).toBe(-200)
    expect(ratearProporcional([{ id: 'x', saldo: -5 }], 100)).toEqual({})
  })
  it('validação: soma até o saldo a distribuir (parcial ok), mesmo sinal, nenhuma negativa', () => {
    expect(erroDistribuicao(fns, { a: 500, b: 448.97 }, 948.97)).toBeNull()
    expect(erroDistribuicao(fns, { a: 100 }, 948.97)).toBeNull() // parcial
    expect(erroDistribuicao(fns, { a: 1000 }, 948.97)).toMatch(/soma/)
    expect(erroDistribuicao(fns, { a: -10 }, 948.97)).toMatch(/soma/)
    expect(erroDistribuicao(fns, { e: -100 }, -500)).toMatch(/Seguro ficaria negativa/)
    expect(erroDistribuicao(fns, {}, 948.97)).toMatch(/Informe/)
  })
})
