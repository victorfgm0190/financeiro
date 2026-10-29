import { describe, it, expect } from 'vitest'
import { diaValido, erroDiasCartao, cartaoSemDias } from './cartaoDias.js'
import { faturaDoCartao, FECHAMENTO_PADRAO } from './fatura.js'

describe('dias do cartão obrigatórios', () => {
  it('dia de 1 a 31, inteiro; vazio não vale', () => {
    expect(['1', 31, '15'].every(diaValido)).toBe(true)
    expect(['', null, undefined, 0, 32, '1.5', 'x'].some(diaValido)).toBe(false)
  })
  it('mensagem cita o que falta', () => {
    expect(erroDiasCartao({ closingDay: 13, dueDay: 20 })).toBeNull()
    expect(erroDiasCartao({ closingDay: '', dueDay: 20 })).toMatch(/fechamento/)
    expect(erroDiasCartao({ closingDay: '', dueDay: '' })).toMatch(/fechamento e o de vencimento/)
  })
  it('cartão antigo sem o dia → aviso; conta corrente nunca', () => {
    expect(cartaoSemDias({ type: 'credit', closingDay: null, dueDay: 10 })).toBe(true)
    expect(cartaoSemDias({ type: 'credit', closingDay: 13, dueDay: 20 })).toBe(false)
    expect(cartaoSemDias({ type: 'checking' })).toBe(false)
  })
})

describe('fatura pela data: uma função só, mesmo fechamento padrão do motor', () => {
  it('com o dia do cartão', () => {
    expect(faturaDoCartao('2026-10-13', { closingDay: 13 })).toBe('2026-10')
    expect(faturaDoCartao('2026-10-14', { closingDay: 13 })).toBe('2026-11')
  })
  it('sem o dia: usa o padrão 14 (antes a tela do Cartão e a Lista usavam 1)', () => {
    expect(FECHAMENTO_PADRAO).toBe(14)
    expect(faturaDoCartao('2026-10-10', { closingDay: null })).toBe('2026-10')
    expect(faturaDoCartao('2026-10-15', {})).toBe('2026-11')
  })
  it('sem data ou cartão → vazio', () => {
    expect(faturaDoCartao('', { closingDay: 13 })).toBe('')
    expect(faturaDoCartao('2026-10-10', null)).toBe('')
  })
})
