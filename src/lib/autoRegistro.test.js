import { describe, it, expect, vi } from 'vitest'
import { ocorrenciasVencidas, executarTransferenciasInicioMes } from './autoRegistro.js'
import { computeOccurrences, registerAndAdvance } from './occurrences.js'

const condominio = (extra = {}) => ({
  id: 'sch_aria',
  frequency: 'monthly',
  startDate: '2026-09-10',
  nextOccurrence: '2026-10-10',
  amount: 939.68,
  registered: ['2026-09-10'],
  skipped: [],
  overrides: {},
  ...extra,
})

describe('ocorrenciasVencidas — auto-registro pela data efetiva', () => {
  it('sem override: dispara na data original com o valor base', () => {
    expect(ocorrenciasVencidas(condominio(), '2026-10-10')).toEqual([
      { occurrenceDate: '2026-10-10', date: '2026-10-10', amount: 939.68 },
    ])
  })

  it('ocorrência adiada (10/10 → 12/10) não dispara na data original', () => {
    const s = condominio({ overrides: { '2026-10-10': { date: '2026-10-12', amount: 1424.67 } } })
    expect(ocorrenciasVencidas(s, '2026-10-10')).toEqual([])
    expect(ocorrenciasVencidas(s, '2026-10-11')).toEqual([])
  })

  it('ocorrência adiada dispara na data efetiva, lança nela e registra a chave ORIGINAL', () => {
    const s = condominio({ overrides: { '2026-10-10': { date: '2026-10-12', amount: 1424.67 } } })
    const [occ] = ocorrenciasVencidas(s, '2026-10-12')
    expect(occ).toEqual({ occurrenceDate: '2026-10-10', date: '2026-10-12', amount: 1424.67 })
    const depois = registerAndAdvance(s, [...s.registered, occ.occurrenceDate])
    expect(depois.registered).toEqual(['2026-09-10', '2026-10-10'])
    // Já registrada: não dispara de novo, e a série segue para 10/11.
    expect(ocorrenciasVencidas(depois, '2026-10-12')).toEqual([])
    expect(computeOccurrences(depois, 1)).toEqual(['2026-11-10'])
  })

  it('ocorrência antecipada (15/10 → 08/10) dispara antes da chave original', () => {
    const s = condominio({
      nextOccurrence: '2026-10-15', startDate: '2026-09-15', registered: ['2026-09-15'],
      overrides: { '2026-10-15': { date: '2026-10-08', amount: 500 } },
    })
    expect(ocorrenciasVencidas(s, '2026-10-08')).toEqual([
      { occurrenceDate: '2026-10-15', date: '2026-10-08', amount: 500 },
    ])
    expect(ocorrenciasVencidas(s, '2026-10-07')).toEqual([])
  })

  it('override só de valor vale só para a própria data', () => {
    const s = condominio({ overrides: { '2026-10-10': { date: '2026-10-10', amount: 1424.67 } } })
    expect(ocorrenciasVencidas(s, '2026-11-10')).toEqual([
      { occurrenceDate: '2026-10-10', date: '2026-10-10', amount: 1424.67 },
      { occurrenceDate: '2026-11-10', date: '2026-11-10', amount: 939.68 },
    ])
  })
})

describe('executarTransferenciasInicioMes — sem transferência em dobro', () => {
  const resgate = condominio({ id: 'sch_res', overrides: { _gerencialKey: 'x' } })

  it('registra cada ocorrência UMA vez, só por registerScheduleOccurrence', () => {
    const registerScheduleOccurrence = vi.fn()
    const addTransaction = vi.fn()
    executarTransferenciasInicioMes([resgate], {
      getNextOccurrences: (s, n) => computeOccurrences(s, n),
      registerScheduleOccurrence,
      addTransaction,
    })
    expect(registerScheduleOccurrence).toHaveBeenCalledTimes(1)
    expect(registerScheduleOccurrence).toHaveBeenCalledWith('sch_res', '2026-10-10', '2026-10-10')
    expect(addTransaction).not.toHaveBeenCalled()
  })

  it('ocorrência com data alterada: lança na efetiva, registra a original', () => {
    const registerScheduleOccurrence = vi.fn()
    const s = { ...resgate, overrides: { ...resgate.overrides, '2026-10-10': { date: '2026-10-12' } } }
    executarTransferenciasInicioMes([s], {
      getNextOccurrences: (x, n) => computeOccurrences(x, n),
      registerScheduleOccurrence,
    })
    expect(registerScheduleOccurrence).toHaveBeenCalledWith('sch_res', '2026-10-12', '2026-10-10')
  })

  it('sem ocorrência pendente não registra nada', () => {
    const registerScheduleOccurrence = vi.fn()
    executarTransferenciasInicioMes([resgate], { getNextOccurrences: () => [], registerScheduleOccurrence })
    expect(registerScheduleOccurrence).not.toHaveBeenCalled()
  })
})
