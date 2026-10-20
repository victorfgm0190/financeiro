import { describe, it, expect } from 'vitest'
import { getNumeroParcela, rotuloParcela, criarSeloParcela } from './numeroParcela'
import { computeOccurrences } from './occurrences'

// MONJARO SOGRO: 4x mensal desde 25/09/2026, a de 25/09 já registrada.
const monjaro = {
  id: 'm', frequency: 'monthly', occurrenceType: 'installment', installments: 4,
  startDate: '2026-09-25', registered: ['2026-09-25'], skipped: [], nextOccurrence: '2026-10-25',
}

describe('getNumeroParcela', () => {
  it('MONJARO SOGRO: próxima (25/10) é 2/4, depois 3/4 e 4/4', () => {
    const prox = computeOccurrences(monjaro, 12)
    expect(prox).toEqual(['2026-10-25', '2026-11-25', '2026-12-25'])
    expect(prox.map(d => rotuloParcela(monjaro, d))).toEqual(['2/4', '3/4', '4/4'])
    expect(rotuloParcela(monjaro, '2026-09-25')).toBe('1/4')
  })

  it('mesmo resultado sem next_occurrence (âncora = Data de Início)', () => {
    const s = { ...monjaro, nextOccurrence: null }
    expect(rotuloParcela(s, '2026-10-25')).toBe('2/4')
    expect(rotuloParcela(s, '2026-12-25')).toBe('4/4')
  })

  it('sem nenhuma ocorrência registrada → a próxima é 1/N', () => {
    const s = { ...monjaro, registered: [], nextOccurrence: null }
    expect(rotuloParcela(s, '2026-09-25')).toBe('1/4')
    expect(rotuloParcela(s, '2026-10-25')).toBe('2/4')
  })

  it('bimestral: a posição segue o passo da frequência', () => {
    const s = { frequency: 'bimonthly', occurrenceType: 'installment', installments: 3, startDate: '2026-09-25', registered: ['2026-09-25'], skipped: [], nextOccurrence: '2026-11-25' }
    expect(rotuloParcela(s, '2026-11-25')).toBe('2/3')
    expect(rotuloParcela(s, '2027-01-25')).toBe('3/3')
  })

  it('pulada consome a posição (antes e depois da âncora)', () => {
    const s = { ...monjaro, registered: [], skipped: ['2026-09-25'] }
    expect(rotuloParcela(s, '2026-10-25')).toBe('2/4')
    const s2 = { ...monjaro, skipped: ['2026-11-25'] }
    expect(rotuloParcela(s2, '2026-12-25')).toBe('4/4')
    expect(rotuloParcela(s2, '2026-11-25')).toBe('3/4')
  })

  it('série re-ancorada no dia de vencimento (_diaVencimento)', () => {
    const s = { ...monjaro, nextOccurrence: '2026-10-28', overrides: { _diaVencimento: 28 } }
    expect(computeOccurrences(s, 3)).toEqual(['2026-10-28', '2026-11-28', '2026-12-28'])
    expect(rotuloParcela(s, '2026-11-28')).toBe('3/4')
  })

  it('continuo e "Uma vez" não têm contador', () => {
    expect(getNumeroParcela({ ...monjaro, occurrenceType: 'continuous' }, '2026-10-25')).toBeNull()
    expect(getNumeroParcela({ ...monjaro, frequency: 'once', installments: 1 }, '2026-09-25')).toBeNull()
  })
})

describe('criarSeloParcela (lançamento)', () => {
  const continuo = { id: 'c', frequency: 'monthly', occurrenceType: 'continuous', startDate: '2026-01-10', registered: ['2026-01-10'] }
  const vinculado = { ...monjaro, id: 'v', registeredMeta: { '2026-09-25': { tipo: 'pago', lancamento_id: 'tx_v' } } }
  const selo = criarSeloParcela([monjaro, continuo, vinculado])

  it('pela data_ocorrencia, não pela data do pagamento', () => {
    expect(selo({ id: 't1', scheduleId: 'm', date: '2026-10-02', dataOcorrencia: '2026-09-25' })).toBe('1/4')
    expect(selo({ id: 't2', scheduleId: 'm', date: '2026-10-27', dataOcorrencia: '2026-10-25' })).toBe('2/4')
  })

  it('sem data_ocorrencia, sem agendamento ou agendamento continuo → sem selo', () => {
    expect(selo({ id: 't3', scheduleId: 'm', date: '2026-10-02' })).toBeNull()
    expect(selo({ id: 't4', dataOcorrencia: '2026-09-25' })).toBeNull()
    expect(selo({ id: 't5', scheduleId: 'c', dataOcorrencia: '2026-01-10' })).toBeNull()
  })

  it('"Vincular a lançamento existente": acha o agendamento pelo registered_meta', () => {
    expect(selo({ id: 'tx_v', date: '2026-09-26', dataOcorrencia: '2026-09-25' })).toBe('1/4')
  })
})
