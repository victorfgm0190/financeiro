import { describe, it, expect, vi, afterEach } from 'vitest'
import { dataPadraoPagamento, normalizarVencimento, hojeSP } from './dataPagamento'

describe('dataPagamento', () => {
  afterEach(() => vi.useRealTimers())

  it('usa o vencimento quando existe (com ou sem hora)', () => {
    expect(dataPadraoPagamento('2026-12-10')).toBe('2026-12-10')
    expect(dataPadraoPagamento('2026-12-10T00:00:00.000Z')).toBe('2026-12-10')
    expect(normalizarVencimento(null)).toBe('')
  })

  it('sem vencimento cai em hoje no fuso de São Paulo, não em UTC', () => {
    vi.useFakeTimers()
    // 23h30 de 20/10 em São Paulo = 02h30 de 21/10 em UTC: toISOString daria o dia seguinte.
    vi.setSystemTime(new Date('2026-10-21T02:30:00Z'))
    expect(hojeSP()).toBe('2026-10-20')
    expect(dataPadraoPagamento(undefined)).toBe('2026-10-20')
  })
})
