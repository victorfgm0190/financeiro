import { describe, it, expect } from 'vitest'
import { fmt, fmtSinal } from './utils'

describe('fmtSinal', () => {
  it('troca o hífen do negativo pelo sinal de menos tipográfico', () => {
    expect(fmtSinal(-24319.18)).toBe(fmt(-24319.18).replace('-', '−'))
    expect(fmtSinal(-24319.18).startsWith('−')).toBe(true)
  })

  it('positivo e zero ficam iguais ao fmt', () => {
    expect(fmtSinal(1234.5)).toBe(fmt(1234.5))
    expect(fmtSinal(0)).toBe(fmt(0))
    expect(fmtSinal(null)).toBe(fmt(null))
  })
})
