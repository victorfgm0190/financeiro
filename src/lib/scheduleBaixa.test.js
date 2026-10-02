import { describe, it, expect } from 'vitest'
import { candidatosBaixa, atribuirBaixas, desfazerBaixa, baixaKey } from './scheduleBaixa'
import { registerAndAdvance } from './occurrences'

// Caso real: agendamento "Yelumseg SEGURO CARRO", mensal, 6 ocorrências (parcelas 7..12 do
// seguro), próxima em 30/09/2026, R$ 205,61, nenhuma paga — e a fatura traz "Yelumseg Parc7".
const CARD = 'acc_itaupers'
const agendamento = {
  id: 'sch_yelum', transactionType: 'expense', accountId: CARD, amount: 205.61,
  description: 'Yelumseg SEGURO CARRO', payee: 'Yelumseg', categoryId: 'cat_seguro_auto',
  frequency: 'monthly', occurrenceType: 'installment', installments: 6,
  startDate: '2026-09-30', nextOccurrence: '2026-09-30', registered: [], skipped: [],
}
const linha = { description: 'Yelumseg Parc7', payee: 'Yelumseg Parc7', amount: 205.61, type: 'expense', datas: ['2026-09-30', '2026-08-15'] }

describe('candidatosBaixa', () => {
  it('casa a linha com a ocorrência de 30/09 do agendamento', () => {
    const [c] = candidatosBaixa(linha, [agendamento], CARD)
    expect(c).toMatchObject({ scheduleId: 'sch_yelum', occurrenceDate: '2026-09-30', dias: 0 })
    expect(c.sim).toBeGreaterThanOrEqual(0.5)
  })

  it('respeita cartão, valor (±R$ 0,05), janela de ±10 dias e tipo', () => {
    expect(candidatosBaixa(linha, [agendamento], 'outro_cartao')).toEqual([])
    expect(candidatosBaixa(linha, [{ ...agendamento, accountId: 'x', cardId: CARD }], CARD)).toHaveLength(1)
    expect(candidatosBaixa({ ...linha, amount: 205.70 }, [agendamento], CARD)).toEqual([])
    expect(candidatosBaixa({ ...linha, amount: 205.65 }, [agendamento], CARD)).toHaveLength(1)
    expect(candidatosBaixa({ ...linha, datas: ['2026-10-12'] }, [agendamento], CARD)).toEqual([])
    expect(candidatosBaixa({ ...linha, datas: ['2026-10-09'] }, [agendamento], CARD)).toHaveLength(1)
    expect(candidatosBaixa({ ...linha, type: 'income' }, [agendamento], CARD)).toEqual([])
    expect(candidatosBaixa(linha, [{ ...agendamento, tipo: 'pagamento_fatura' }], CARD)).toEqual([])
  })

  it('pega ocorrência em atraso e ignora a já registrada', () => {
    const atrasado = { ...agendamento, nextOccurrence: '2026-09-25' }
    expect(candidatosBaixa(linha, [atrasado], CARD)[0].occurrenceDate).toBe('2026-09-25')
    const pago = registerAndAdvance(agendamento, ['2026-09-30'])
    expect(candidatosBaixa(linha, [pago], CARD)).toEqual([])
  })

  it('ordena pelo score: descrição parecida vence', () => {
    const outro = { ...agendamento, id: 'sch_outro', description: 'Academia', payee: 'Academia' }
    const cs = candidatosBaixa(linha, [outro, agendamento], CARD)
    expect(cs.map(c => c.scheduleId)).toEqual(['sch_yelum', 'sch_outro'])
  })
})

describe('atribuirBaixas', () => {
  const cands = candidatosBaixa(linha, [agendamento], CARD)

  it('marca por padrão e permite desmarcar', () => {
    expect(atribuirBaixas([{ id: 1, candidatos: cands }]).get(1)).toMatchObject({ ativa: true })
    expect(atribuirBaixas([{ id: 1, candidatos: cands, desligada: true }]).get(1)).toMatchObject({ ativa: false })
  })

  it('uma ocorrência só é baixada por UMA linha', () => {
    const m = atribuirBaixas([{ id: 1, candidatos: cands }, { id: 2, candidatos: cands }])
    expect(m.get(1).escolhido.occurrenceDate).toBe('2026-09-30')
    expect(m.has(2)).toBe(false)
  })

  it('escolha manual tem prioridade', () => {
    const m = atribuirBaixas([{ id: 1, candidatos: cands }, { id: 2, candidatos: cands, escolha: baixaKey(cands[0]) }])
    expect(m.get(2).escolhido).toBeTruthy()
    expect(m.has(1)).toBe(false)
  })

  it('descrição que não confirma (< 0,5) aparece desmarcada', () => {
    const outro = { ...agendamento, description: 'Academia', payee: 'Academia' }
    const cs = candidatosBaixa(linha, [outro], CARD)
    expect(atribuirBaixas([{ id: 1, candidatos: cs }]).get(1)).toMatchObject({ ativa: false })
    expect(atribuirBaixas([{ id: 1, candidatos: cs, desligada: false }]).get(1)).toMatchObject({ ativa: true })
  })
})

describe('desfazerBaixa (estorno da importação)', () => {
  it('reabre a ocorrência e volta next_occurrence: 1/6 → 0/6', () => {
    const pago = registerAndAdvance(agendamento, ['2026-09-30'])
    expect(pago.nextOccurrence).toBe('2026-10-30')
    const volta = desfazerBaixa(pago, '2026-09-30')
    expect(volta.registered).toEqual([])
    expect(volta.nextOccurrence).toBe('2026-09-30')
  })

  it('não mexe quando a ocorrência não está registrada', () => {
    expect(desfazerBaixa(agendamento, '2026-09-30')).toBe(agendamento)
  })
})
