import { describe, it, expect } from 'vitest'
import { batimento, encerramentoDaCota, parcelasFinupPorCota, prazoDaCota, somarMeses } from './consorcio.js'

const cota = (extra = {}) => ({
  numero: '1', valor_carta: 100000, percentual_parcela: 50, valor_parcela_cheia: 683.4, prazo_meses: 180, ...extra,
})

describe('encerramento da cota', () => {
  it('a data informada vale e não é estimada', () => {
    expect(encerramentoDaCota(cota({ previsao_encerramento: '2041-04-16', data_ultima_parcela: '2041-04-10', data_adesao: '2026-04-22' })))
      .toEqual({ data: '2041-04-16', estimado: false })
  })
  it('sem previsão, usa a última parcela informada', () => {
    expect(encerramentoDaCota(cota({ data_ultima_parcela: '2041-04-10', data_adesao: '2026-04-22' }))).toEqual({ data: '2041-04-10', estimado: false })
  })
  it('sem datas: adesão + prazo, da própria cota, marcado como estimado', () => {
    expect(encerramentoDaCota(cota({ data_adesao: '2026-04-24' }))).toEqual({ data: '2041-04-24', estimado: true })
    expect(encerramentoDaCota(cota({ data_adesao: '2026-04-22' }))).toEqual({ data: '2041-04-22', estimado: true })
  })
  it('sem base para calcular', () => {
    expect(encerramentoDaCota(cota())).toEqual({ data: null, estimado: false })
    expect(encerramentoDaCota(cota({ data_adesao: '2026-04-22', prazo_meses: null }))).toEqual({ data: null, estimado: false })
  })
  it('somarMeses limita ao último dia do mês e vira o ano', () => {
    expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28')
    expect(somarMeses('2026-11-15', 2)).toBe('2027-01-15')
  })
})

describe('parcelas pagas no Finup por cota', () => {
  const tres = [cota({ parcelas_pagas_informadas: 6 }), cota({ parcelas_pagas_informadas: 6 }), cota({ parcelas_pagas_informadas: 6 })]
  it('divide o total do batimento e fecha com ele', () => {
    expect(parcelasFinupPorCota(tres, 6143.4)).toEqual([6, 6, 6])
    const faltaUma = parcelasFinupPorCota(tres, 5801.7)
    expect(faltaUma).toEqual([6, 6, 5])
    expect(faltaUma.reduce((s, n) => s + n, 0)).toBe(batimento(tres, 5801.7).parcelasFinup)
  })
  it('cota comprada depois recebe menos, pela proporção informada', () => {
    const datas = [cota({ parcelas_pagas_informadas: 12 }), cota({ parcelas_pagas_informadas: 3 })]
    expect(parcelasFinupPorCota(datas, 341.7 * 15)).toEqual([12, 3])
  })
  it('sem parcelas informadas, divide por igual', () => {
    expect(parcelasFinupPorCota([cota(), cota()], 341.7 * 4)).toEqual([2, 2])
  })
  it('sem cotas não quebra', () => {
    expect(parcelasFinupPorCota([], 100)).toEqual([])
  })
})

describe('prazo da cota', () => {
  it('restantes usa as pagas no Finup', () => {
    expect(prazoDaCota(cota({ parcelas_pagas_informadas: 6 }), 6)).toEqual({ pagas: 6, prazo: 180, restantes: 174, informadas: 6, restantesInformadas: 174, diverge: false })
  })
  it('mostra os dois quando a administradora diverge', () => {
    const p = prazoDaCota(cota({ parcelas_pagas_informadas: 6 }), 5)
    expect(p).toMatchObject({ restantes: 175, restantesInformadas: 174, diverge: true })
  })
  it('sem prazo ou sem informado', () => {
    expect(prazoDaCota(cota({ prazo_meses: null }), 5).restantes).toBeNull()
    expect(prazoDaCota(cota(), 5)).toMatchObject({ informadas: null, diverge: false })
  })
  it('nunca fica negativo', () => {
    expect(prazoDaCota(cota({ prazo_meses: 3 }), 5).restantes).toBe(0)
  })
})
