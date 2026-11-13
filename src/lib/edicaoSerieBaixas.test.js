import { describe, it, expect } from 'vitest'
import { erroProximaData, baixasAntesDoInicio, erroDataInicio, perguntaDesfazerBaixas, deixadasParaTras, aplicarDecisoesDeDatas } from './edicaoSerieBaixas'
import { computeOccurrences } from './occurrences'
import { historicoOcorrencias } from './ocorrenciasRegistradas'

const SERIE = {
  id: 'sch_m', amount: 150, frequency: 'monthly', occurrenceType: 'installment', installments: 4,
  startDate: '2026-09-10', nextOccurrence: '2026-11-10', registered: ['2026-10-10'], skipped: [], registeredMeta: {}, overrides: {},
}

describe('regra 1: próxima data depois da última baixada', () => {
  it('em cima ou antes → erro; depois → ok', () => {
    expect(erroProximaData(SERIE, '2026-10-10')).toMatch(/10\/10\/2026/)
    expect(erroProximaData(SERIE, '2026-09-30')).toMatch(/depois da última/)
    expect(erroProximaData(SERIE, '2026-10-11')).toBeNull()
    expect(erroProximaData({ ...SERIE, registered: [] }, '2026-01-01')).toBeNull()
  })
})

describe('regra 2: Data de Início × baixas', () => {
  it('baixa sem lançamento antes do novo início → pergunta; com lançamento → bloqueia', () => {
    const sem = baixasAntesDoInicio(SERIE, '2027-01-05', [])
    expect(sem).toEqual({ comLancamento: [], semLancamento: ['2026-10-10'] })
    expect(erroDataInicio(sem)).toBeNull()
    expect(perguntaDesfazerBaixas(sem.semLancamento)).toBe('Esta série tem 1 baixa sem lançamento de 10/10/2026. Deseja desfazê-la?')
    const tx = { id: 't', date: '2026-10-10', amount: 150, scheduleId: 'sch_m' }
    const com = baixasAntesDoInicio(SERIE, '2027-01-05', [tx])
    expect(com.comLancamento).toEqual(['2026-10-10'])
    expect(erroDataInicio(com)).toMatch(/já paga de 10\/10\/2026/)
  })
  it('início antes das baixas → nada a fazer', () => {
    expect(baixasAntesDoInicio(SERIE, '2026-08-10', [])).toEqual({ comLancamento: [], semLancamento: [] })
  })
  it('desfazer a baixa: a série volta a ter as 5 parcelas a partir do novo início', () => {
    const editada = { ...SERIE, installments: 5, amount: 276, startDate: '2027-01-05', nextOccurrence: '2027-01-05' }
    const final = aplicarDecisoesDeDatas(editada, { desfazer: ['2026-10-10'] })
    expect(final.registered).toEqual([])
    expect(computeOccurrences(final, 10)).toEqual(['2027-01-05', '2027-02-05', '2027-03-05', '2027-04-05', '2027-05-05'])
  })
})

describe('regra 3: pendentes que ficam para trás', () => {
  const pend = ['2026-11-10', '2026-12-10', '2027-01-10']
  it('ajuste dentro do mesmo período → nenhuma', () => {
    expect(deixadasParaTras(pend, '2026-11-10', '2026-11-25')).toEqual([])
    expect(deixadasParaTras(pend, '2026-11-10', '2026-11-05')).toEqual([])
  })
  it('um período para frente → a de novembro fica para trás', () => {
    expect(deixadasParaTras(pend, '2026-11-10', '2026-12-10')).toEqual(['2026-11-10'])
  })
  it('mensal: a nova data fica com a ocorrência do mesmo mês (25/11 → 05/12 deixa novembro)', () => {
    expect(deixadasParaTras(['2026-11-25', '2026-12-25'], '2026-11-25', '2026-12-05')).toEqual(['2026-11-25'])
    expect(deixadasParaTras(['2026-11-25', '2026-12-02'], '2026-11-25', '2026-12-05', 'weekly')).toEqual(['2026-11-25'])
    expect(deixadasParaTras(['2026-11-25', '2026-12-09'], '2026-11-25', '2026-12-05', 'biweekly')).toEqual([])
  })
  it('janeiro → novembro e dezembro ficam para trás; viram puladas e contam no total', () => {
    const atras = deixadasParaTras(pend, '2026-11-10', '2027-01-05')
    expect(atras).toEqual(['2026-11-10', '2026-12-10'])
    const final = aplicarDecisoesDeDatas({ ...SERIE, nextOccurrence: '2027-01-05' }, { pular: atras })
    expect(final.skipped).toEqual(['2026-11-10', '2026-12-10'])
    // 1 baixada + 2 puladas + 1 pendente = 4: nada some.
    expect(computeOccurrences(final, 10)).toEqual(['2027-01-05'])
    expect(historicoOcorrencias(final, []).linhas.map(l => l.status)).toEqual(['baixada', 'pulada', 'pulada'])
  })
})

describe('A2: mudanças de estrutura no histórico', () => {
  it('Data de Início, frequência e nº de parcelas', async () => {
    const { mudancasDeEstrutura } = await import('./edicaoSerieBaixas')
    expect(mudancasDeEstrutura(SERIE, { ...SERIE, startDate: '2027-01-05', installments: 5 })).toEqual([
      { campo: 'startDate', de: '2026-09-10', para: '2027-01-05' },
      { campo: 'installments', de: 4, para: 5 },
    ])
    expect(mudancasDeEstrutura(SERIE, { ...SERIE })).toEqual([])
    expect(mudancasDeEstrutura(SERIE, { ...SERIE, occurrenceType: 'continuous' })).toEqual([{ campo: 'installments', de: 4, para: null }])
  })
})
