import { describe, it, expect } from 'vitest'
import { agruparPorDia, HORIZONTES_MOBILE } from './fluxoMobile'

describe('agruparPorDia', () => {
  it('agrupa linhas consecutivas do mesmo dia, mantendo a ordem', () => {
    const rows = [
      { _key: 'a', date: '2026-10-13' },
      { _key: 'b', date: '2026-10-13' },
      { _key: 'c', date: '2026-10-20' },
    ]
    expect(agruparPorDia(rows)).toEqual([
      { date: '2026-10-13', rows: [rows[0], rows[1]] },
      { date: '2026-10-20', rows: [rows[2]] },
    ])
  })

  it('lista vazia ou ausente → []', () => {
    expect(agruparPorDia([])).toEqual([])
    expect(agruparPorDia(undefined)).toEqual([])
  })
})

describe('HORIZONTES_MOBILE', () => {
  it('Mês | 3 meses | 12 meses em dias', () => {
    expect(HORIZONTES_MOBILE.map(h => h.dias)).toEqual([30, 90, 365])
  })
})
