import { describe, it, expect } from 'vitest'
import { faturaPelaData, faturaAbertaDoCartao, avisoFaturaFechada, proximaFatura } from './faturaAberta.js'

describe('fatura de lançamento novo no cartão', () => {
  it('pelo dia de fechamento: até o fechamento → mês corrente; depois → o seguinte', () => {
    expect(faturaPelaData('2026-10-29', 3)).toBe('2026-11')
    expect(faturaPelaData('2026-10-02', 3)).toBe('2026-10')
    expect(faturaPelaData('2026-12-20', 10)).toBe('2027-01')
  })
  it('aberta: a calculada, sem aviso', () => {
    const f = faturaAbertaDoCartao({ cardId: 'c1', date: '2026-10-29', closingDay: 3, faturasFechadas: {} })
    expect(f).toEqual({ calculada: '2026-11', efetiva: '2026-11', fechadas: [] })
    expect(avisoFaturaFechada(f)).toBeNull()
  })
  it('fechada → a próxima aberta, com aviso', () => {
    const f = faturaAbertaDoCartao({ cardId: 'c1', date: '2026-10-02', closingDay: 3, faturasFechadas: { 'c1_2026-10': true } })
    expect(f.efetiva).toBe('2026-11')
    expect(avisoFaturaFechada(f)).toBe('Fatura 10/2026 fechada → lançado na 11/2026')
  })
  it('várias fechadas em sequência; fechamento de OUTRO cartão não conta', () => {
    const ff = { 'c1_2026-10': true, 'c1_2026-11': true, 'c2_2026-12': true }
    expect(faturaAbertaDoCartao({ cardId: 'c1', date: '2026-10-02', closingDay: 3, faturasFechadas: ff }).efetiva).toBe('2026-12')
    expect(avisoFaturaFechada(faturaAbertaDoCartao({ cardId: 'c1', date: '2026-10-02', closingDay: 3, faturasFechadas: ff })))
      .toBe('Fatura 10/2026, 11/2026 fechadas → lançado na 12/2026')
  })
  it('parcelado em 3 a partir da 11/2026: 11, 12 e 01', () => {
    expect([0, 1, 2].map(i => proximaFatura('2026-11', i))).toEqual(['2026-11', '2026-12', '2027-01'])
  })
  it('sem cartão ou sem data → null', () => {
    expect(faturaAbertaDoCartao({ cardId: null, date: '2026-10-02', closingDay: 3 })).toBeNull()
    expect(faturaAbertaDoCartao({ cardId: 'c1', date: '', closingDay: 3 })).toBeNull()
  })
})
