import { describe, it, expect } from 'vitest'
import {
  periodoPadrao, erroPeriodo, atalhosPeriodo, aplicarAtalho, preferenciaDoPeriodo, periodoDaPreferencia,
  normalizarPreferenciaPeriodo, janelaDoPeriodo, rotuloPeriodo, mesDaData, MAX_MESES_FLUXO,
} from './fluxoPeriodo.js'

const ATUAL = '2026-11'

describe('período do Fluxo Futuro', () => {
  it('padrão: mês atual + 12 meses', () => {
    expect(periodoPadrao(ATUAL)).toEqual({ de: '2026-11', ate: '2027-10' })
    expect(rotuloPeriodo(periodoPadrao(ATUAL))).toBe('Nov/26 – Out/27')
    expect(mesDaData(new Date(2026, 10, 7))).toBe(ATUAL)
  })

  it('regras: De ≥ mês atual, Até ≥ De, no máximo 60 meses', () => {
    expect(erroPeriodo({ de: '2026-10', ate: '2027-10' }, ATUAL)).toMatch(/anterior a Nov\/26/)
    expect(erroPeriodo({ de: '2027-03', ate: '2027-02' }, ATUAL)).toMatch(/igual ou posterior/)
    expect(erroPeriodo({ de: '2026-11', ate: '2031-10' }, ATUAL)).toBeNull() // 60
    expect(erroPeriodo({ de: '2026-11', ate: '2031-11' }, ATUAL)).toMatch(/no máximo 60 meses \(escolhido: 61\)/)
    expect(erroPeriodo({ de: '2027-01', ate: '2027-01' }, ATUAL)).toBeNull()
  })

  it('atalhos: anos calculados a partir do ano atual', () => {
    const a = atalhosPeriodo(ATUAL)
    expect(a.map(x => x.rotulo)).toEqual(['12 meses', '24 meses', '36 meses', 'Até Dez/2028', 'Até Dez/2029', 'Até Dez/2030'])
    expect(atalhosPeriodo('2030-02').at(-1).rotulo).toBe('Até Dez/2034')
    expect(aplicarAtalho(a[1], '2026-11')).toBe('2028-10')
    expect(aplicarAtalho(a[4], '2027-01')).toBe('2029-12')
  })

  it('preferência relativa: "24 meses" anda com o mês; "até Dez/2029" vence e volta ao padrão', () => {
    expect(preferenciaDoPeriodo({ ...periodoPadrao(ATUAL), meses: 12 }, ATUAL)).toBeNull()
    const p24 = preferenciaDoPeriodo({ de: '2026-11', ate: '2028-10', meses: 24 }, ATUAL)
    expect(p24).toEqual({ de: 0, meses: 24 })
    expect(periodoDaPreferencia(p24, '2027-03')).toEqual({ de: '2027-03', ate: '2029-02' })
    const pDez = preferenciaDoPeriodo({ de: '2027-01', ate: '2029-12' }, ATUAL)
    expect(pDez).toEqual({ de: 2, ate: '2029-12' })
    expect(periodoDaPreferencia(pDez, ATUAL)).toEqual({ de: '2027-01', ate: '2029-12' })
    expect(periodoDaPreferencia(pDez, '2030-01')).toEqual(periodoPadrao('2030-01')) // vencido
    expect(periodoDaPreferencia(null, ATUAL)).toEqual(periodoPadrao(ATUAL))
    expect(periodoDaPreferencia({ de: 0, ate: '2035-12' }, ATUAL)).toEqual(periodoPadrao(ATUAL)) // > 60
  })

  it('normaliza o que pode ser gravado', () => {
    expect(normalizarPreferenciaPeriodo(null)).toBeNull()
    expect(normalizarPreferenciaPeriodo({ de: 0, meses: 24, x: 1 })).toEqual({ de: 0, meses: 24 })
    expect(normalizarPreferenciaPeriodo({ de: 0, meses: MAX_MESES_FLUXO + 1 })).toBeUndefined()
    expect(normalizarPreferenciaPeriodo({ de: -1, meses: 12 })).toBeUndefined()
    expect(normalizarPreferenciaPeriodo({ de: 0, ate: '2029-13' })).toBeUndefined()
    expect(normalizarPreferenciaPeriodo('24')).toBeUndefined()
  })

  it('janela: começa no mês de calendário anterior (saldo de hoje) e esconde as colunas antes do De', () => {
    // Período aberto = Out/26 (15/10–14/11), hoje em Nov: padrão idêntico ao de antes (Out/26–Set/27).
    expect(periodoPadrao('2026-10')).toEqual({ de: '2026-10', ate: '2027-09' })
    expect(janelaDoPeriodo(periodoPadrao('2026-10'), '2026-10')).toEqual({ inicio: '2026-10', meses: 12, primeiro: 0 })
    // Período aberto = mês de calendário (corte no dia 1): o mês anterior fica escondido.
    expect(janelaDoPeriodo(periodoPadrao(ATUAL), '2026-10')).toEqual({ inicio: '2026-10', meses: 13, primeiro: 1 })
    expect(janelaDoPeriodo({ de: '2027-01', ate: '2027-12' }, '2026-10')).toEqual({ inicio: '2026-10', meses: 15, primeiro: 3 })
  })
})
