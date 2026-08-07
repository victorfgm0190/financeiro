import { describe, it, expect } from 'vitest'
import {
  parseScheduleDate,
  computePendingUpTo,
  advanceByFrequency,
  computeOccurrences,
  registerAndAdvance,
} from './occurrences'

// Agendamento mensal dia 05, três parcelas já pagas — o caso real "LAGO AZUL" que motivou
// a investigação: next_occurrence NULL no banco e a ocorrência de 05/08 vencida em aberto.
const lagoAzul = {
  description: 'LAGO AZUL',
  frequency: 'monthly',
  occurrenceType: 'continuous',
  startDate: '2026-05-05',
  nextOccurrence: null,
  registered: ['2026-05-05', '2026-06-05', '2026-07-05'],
  skipped: [],
}

describe('parseScheduleDate', () => {
  it('ancora ao MEIO-DIA local para não recuar 1 dia em fuso negativo', () => {
    expect(parseScheduleDate('2026-08-05').getDate()).toBe(5)
    expect(parseScheduleDate('2026-08-05').getHours()).toBe(12)
  })

  it('ignora a parte de hora de um timestamp vindo do banco', () => {
    expect(parseScheduleDate('2026-06-28T00:00:00Z').getDate()).toBe(28)
  })
})

describe('computeOccurrences — âncora next_occurrence', () => {
  it('com next_occurrence NULL, cai em start_date e pula as registradas', () => {
    // O ponto central: NULL não é estado quebrado — devolve a vencida, não a próxima futura.
    expect(computeOccurrences(lagoAzul, 3)).toEqual(['2026-08-05', '2026-09-05', '2026-10-05'])
  })

  it('não filtra por data futura: devolve a ocorrência VENCIDA e não paga', () => {
    // Regressão do bug reportado (a aba mostrava 05/09 com 05/08 em aberto).
    expect(computeOccurrences(lagoAzul, 1)[0]).toBe('2026-08-05')
  })

  it('âncora ATRASADA é auto-corrigida (o laço pula registered)', () => {
    const s = { ...lagoAzul, nextOccurrence: '2026-05-05' }
    expect(computeOccurrences(s, 1)[0]).toBe('2026-08-05')
  })

  it('âncora ADIANTE esconde a vencida — único caso que perde ocorrência', () => {
    // Documenta a fragilidade real: quem gravar next_occurrence à frente some com 05/08.
    const s = { ...lagoAzul, nextOccurrence: '2026-09-05' }
    expect(computeOccurrences(s, 1)[0]).toBe('2026-09-05')
  })
})

describe('computeOccurrences — registered / skipped', () => {
  it('exclui datas registradas e puladas', () => {
    const s = { ...lagoAzul, skipped: ['2026-08-05'] }
    expect(computeOccurrences(s, 1)[0]).toBe('2026-09-05')
  })

  it('respeita o count pedido', () => {
    expect(computeOccurrences(lagoAzul, 5)).toHaveLength(5)
  })

  it("'once' devolve no máximo uma ocorrência", () => {
    const s = { frequency: 'once', startDate: '2026-08-05', registered: [], skipped: [] }
    expect(computeOccurrences(s, 12)).toEqual(['2026-08-05'])
  })

  it("'once' já registrada devolve vazio", () => {
    const s = { frequency: 'once', startDate: '2026-08-05', registered: ['2026-08-05'], skipped: [] }
    expect(computeOccurrences(s, 12)).toEqual([])
  })
})

describe('computeOccurrences — parcelados', () => {
  it('não passa do total de parcelas', () => {
    const s = {
      frequency: 'monthly', occurrenceType: 'installment', installments: 3,
      startDate: '2026-08-05', registered: [], skipped: [],
    }
    expect(computeOccurrences(s, 12)).toEqual(['2026-08-05', '2026-09-05', '2026-10-05'])
  })

  it('não gera parcela FANTASMA quando a âncora avançou sobre parcelas já pagas', () => {
    // Regressão de 6ba73c6: as consumidas ANTES da âncora não são iteradas, então
    // precisam ser pré-contadas — sem isso um 3x virava 4x.
    const s = {
      frequency: 'monthly', occurrenceType: 'installment', installments: 3,
      startDate: '2026-08-05', nextOccurrence: '2026-10-05',
      registered: ['2026-08-05', '2026-09-05'], skipped: [],
    }
    expect(computeOccurrences(s, 12)).toEqual(['2026-10-05'])
  })
})

describe('computeOccurrences — frequências', () => {
  const base = { startDate: '2026-01-31', registered: [], skipped: [] }
  const cases = [
    ['daily', ['2026-01-31', '2026-02-01']],
    ['weekly', ['2026-01-31', '2026-02-07']],
    ['biweekly', ['2026-01-31', '2026-02-14']],
    ['bimonthly', ['2026-01-31', '2026-03-31']],
    ['quarterly', ['2026-01-31', '2026-04-30']],
    ['quadrimestral', ['2026-01-31', '2026-05-31']],
    ['semiannual', ['2026-01-31', '2026-07-31']],
    ['annual', ['2026-01-31', '2027-01-31']],
  ]
  it.each(cases)('%s avança corretamente', (frequency, esperado) => {
    expect(computeOccurrences({ ...base, frequency }, 2)).toEqual(esperado)
  })

  // DEFEITO CONHECIDO, não corrigido aqui. O laço avança de forma incremental
  // (current = addMonths(current, 1)) em vez de recalcular a partir do dia de vencimento
  // original. Ao cruzar fevereiro, um agendamento de dia 29/30/31 é ARRASTADO para o dia 28
  // e nunca mais volta — o vencimento muda sozinho para sempre. Corrigir altera datas de
  // ocorrência em todo o app (inclusive saldos), então fica registrado como está.
  it('mensal a partir do dia 31 DERRAPA para o dia 28 ao cruzar fevereiro', () => {
    expect(computeOccurrences({ ...base, frequency: 'monthly' }, 4))
      .toEqual(['2026-01-31', '2026-02-28', '2026-03-28', '2026-04-28'])
  })

  it('mensal em dia baixo não sofre a derrapagem', () => {
    expect(computeOccurrences({ frequency: 'monthly', startDate: '2026-01-05', registered: [], skipped: [] }, 3))
      .toEqual(['2026-01-05', '2026-02-05', '2026-03-05'])
  })
})

describe('registerAndAdvance', () => {
  it('reancora next_occurrence na próxima pendente ao registrar a vencida', () => {
    // Comportamento que o auto-registro na inicialização não aplicava.
    const out = registerAndAdvance(lagoAzul, [...lagoAzul.registered, '2026-08-05'])
    expect(out.nextOccurrence).toBe('2026-09-05')
    expect(out.registered).toContain('2026-08-05')
    expect(out.confirmado).toBe(false)
  })

  it("'once' não ganha âncora (mantém o comportamento original)", () => {
    const s = { frequency: 'once', startDate: '2026-08-05', registered: [], skipped: [] }
    const out = registerAndAdvance(s, ['2026-08-05'])
    expect(out.nextOccurrence).toBeUndefined()
    expect(out.registered).toEqual(['2026-08-05'])
  })

  it('sem pendências restantes, zera a âncora', () => {
    const s = {
      frequency: 'monthly', occurrenceType: 'installment', installments: 2,
      startDate: '2026-08-05', registered: ['2026-08-05'], skipped: [],
    }
    expect(registerAndAdvance(s, ['2026-08-05', '2026-09-05']).nextOccurrence).toBeNull()
  })
})

describe('computePendingUpTo', () => {
  it('inclui a vencida e para no limite pedido', () => {
    expect(computePendingUpTo(lagoAzul, '2026-08-07')).toEqual(['2026-08-05'])
  })

  it('devolve vazio quando o limite é anterior à próxima pendente', () => {
    expect(computePendingUpTo(lagoAzul, '2026-08-04')).toEqual([])
  })

  it('acumula várias ocorrências em atraso', () => {
    expect(computePendingUpTo(lagoAzul, '2026-10-05'))
      .toEqual(['2026-08-05', '2026-09-05', '2026-10-05'])
  })
})

describe('advanceByFrequency', () => {
  it('avança um intervalo da frequência', () => {
    expect(advanceByFrequency('2026-08-05', 'monthly')).toBe('2026-09-05')
    expect(advanceByFrequency('2026-08-05', 'weekly')).toBe('2026-08-12')
    expect(advanceByFrequency('2026-08-05', 'annual')).toBe('2027-08-05')
  })

  it('frequência desconhecida devolve a própria data', () => {
    expect(advanceByFrequency('2026-08-05', 'once')).toBe('2026-08-05')
  })
})
