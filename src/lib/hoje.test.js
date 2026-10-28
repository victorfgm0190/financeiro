import { describe, it, expect, afterEach, vi } from 'vitest'
import { endOfMonth, startOfMonth } from 'date-fns'
import { hojeSP, isoLocal } from './hoje'
import { today } from '../components/shared/utils'
import { hoje as hojeApiBem } from '../../api/_bem.js'

// 22h de 27/10 em Brasília = 01h de 28/10 em UTC: o dia UTC já virou, o de São Paulo não.
const NOITE_SP = new Date('2026-10-28T01:00:00Z')

describe('hoje no fuso de São Paulo', () => {
  afterEach(() => vi.useRealTimers())

  it('às 22h de Brasília, today() devolve o próprio dia (não o seguinte, como toISOString)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOITE_SP)
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-10-28') // o bug: UTC já é amanhã
    expect(today()).toBe('2026-10-27')
    expect(hojeSP()).toBe('2026-10-27')
    expect(hojeApiBem()).toBe('2026-10-27')
  })

  it('vira o dia à meia-noite de Brasília (03h UTC)', () => {
    expect(hojeSP(new Date('2026-10-28T02:59:59Z'))).toBe('2026-10-27')
    expect(hojeSP(new Date('2026-10-28T03:00:00Z'))).toBe('2026-10-28')
  })

  it('aceita timestamp e mantém o formato YYYY-MM-DD', () => {
    expect(hojeSP(NOITE_SP.getTime() + 5 * 86400000)).toBe('2026-11-01')
    expect(hojeSP(new Date('2026-01-05T12:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('isoLocal', () => {
  it('fim do mês é o último dia, não o 1º do mês seguinte', () => {
    const d = new Date(2026, 9, 15)
    expect(isoLocal(startOfMonth(d))).toBe('2026-10-01')
    expect(isoLocal(endOfMonth(d))).toBe('2026-10-31')
    expect(isoLocal(new Date(2026, 1, 0))).toBe('2026-01-31')
  })
})
