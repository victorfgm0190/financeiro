import { describe, it, expect } from 'vitest'
import { isTransferenciaEntrePerfis, categoriasEntrePerfis } from './transferenciaPerfis'
import { diffCampos, precisaEscolherEscopo, planoAgendamento, occCampos, comCamposDaOcorrencia, ESCOPO } from './camposSerie'

const pj = { id: 'a1', profileId: 'p_pj' }
const pf = { id: 'a2', profileId: 'p_pf' }
const pf2 = { id: 'a3', profileId: 'p_pf' }
const semPerfil = { id: 'a4' }

describe('isTransferenciaEntrePerfis', () => {
  it('perfis diferentes → true', () => {
    expect(isTransferenciaEntrePerfis(pj, pf)).toBe(true)
    expect(isTransferenciaEntrePerfis(pf, pj)).toBe(true)
  })
  it('mesmo perfil, conta sem perfil ou ausente → false', () => {
    expect(isTransferenciaEntrePerfis(pf, pf2)).toBe(false)
    expect(isTransferenciaEntrePerfis(pj, semPerfil)).toBe(false)
    expect(isTransferenciaEntrePerfis(pj, undefined)).toBe(false)
  })
})

describe('categoriasEntrePerfis', () => {
  const cats = { categoriaCnpjId: 'c1', categoriaCpfId: 'c2' }
  it('entre perfis → mantém as duas', () => {
    expect(categoriasEntrePerfis(pj, pf, cats)).toEqual(cats)
  })
  it('mesmo perfil → null nas duas', () => {
    expect(categoriasEntrePerfis(pf, pf2, cats)).toEqual({ categoriaCnpjId: null, categoriaCpfId: null })
  })
  it('vazio → null (agendamento antigo sem categoria)', () => {
    expect(categoriasEntrePerfis(pj, pf, {})).toEqual({ categoriaCnpjId: null, categoriaCpfId: null })
  })
})

describe('categorias por perfil como campos da PARCELA', () => {
  const sch = {
    id: 's1', frequency: 'monthly', startDate: '2026-01-10', transactionType: 'transfer',
    accountId: 'a1', toAccountId: 'a2', amount: 100, categoriaCnpjId: 'c1', categoriaCpfId: 'c2', overrides: {},
  }
  const pendentes = ['2026-11-10', '2026-12-10', '2027-01-10']

  it('mudar a categoria do CNPJ pergunta o escopo quando há próximas', () => {
    const mud = diffCampos({ categoriaCnpjId: 'c1' }, { categoriaCnpjId: 'c9' })
    expect(mud).toEqual([{ campo: 'categoriaCnpjId', de: 'c1', para: 'c9' }])
    expect(precisaEscolherEscopo(mud, 2)).toBe(true)
  })

  it('"Só esta" grava override só na ocorrência; o lançamento dela herda', () => {
    const mudancas = [{ campo: 'categoriaCpfId', de: 'c2', para: 'c8' }]
    const { schedule } = planoAgendamento(sch, { occDate: '2026-11-10', mudancas, escopo: ESCOPO.PARCELA, pendentes })
    expect(schedule.categoriaCpfId).toBe('c2')
    expect(schedule.overrides['2026-11-10']).toEqual({ categoriaCpfId: 'c8' })
    expect(occCampos(schedule, '2026-11-10').categoriaCpfId).toBe('c8')
    expect(comCamposDaOcorrencia(schedule, '2026-11-10').categoriaCpfId).toBe('c8')
    expect(comCamposDaOcorrencia(schedule, '2026-12-10').categoriaCpfId).toBe('c2')
  })

  it('"Esta e as próximas" muda o agendamento base', () => {
    const mudancas = [{ campo: 'categoriaCnpjId', de: 'c1', para: 'c9' }]
    const { schedule } = planoAgendamento(sch, { occDate: '2026-11-10', mudancas, escopo: ESCOPO.PROXIMAS, pendentes })
    expect(schedule.categoriaCnpjId).toBe('c9')
    expect(occCampos(schedule, '2027-01-10').categoriaCnpjId).toBe('c9')
  })
})
