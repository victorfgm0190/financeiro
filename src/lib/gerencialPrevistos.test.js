import { describe, it, expect } from 'vitest'
import {
  fontePrevistoId, parseFontePrevisto, ehFontePrevista, ehGastoPrevistoDeCartao,
  previstosDaFatura, faturasDoAgendamento,
} from './gerencialPrevistos'
import { isResgatePagoParaGasto } from './resgates'
import { computeOccurrences } from './occurrences'

const CARD = 'card_itau'
// Fatura = mês da data (closingDay irrelevante para o teste; o motor passa a sua própria função).
const faturaDe = (dia) => String(dia).slice(0, 7)
const getOcc = (s, n) => computeOccurrences(s, n)

const agendamento = (over = {}) => ({
  id: 'sch_1', description: 'Anuidade', transactionType: 'expense',
  accountId: CARD, amount: 582.67, frequency: 'once', startDate: '2026-10-20',
  grupoGerencial: 'grp_phlo', registered: [], skipped: [], ...over,
})

describe('id da fonte prevista', () => {
  it('ida e volta', () => {
    const id = fontePrevistoId('sch_1', '2026-10-20')
    expect(id).toBe('sch:sch_1@2026-10-20')
    expect(parseFontePrevisto(id)).toEqual({ scheduleId: 'sch_1', date: '2026-10-20' })
    expect(ehFontePrevista(id)).toBe(true)
  })

  it('id de agendamento com @ não quebra o parse', () => {
    const id = fontePrevistoId('sch@estranho', '2026-10-20')
    expect(parseFontePrevisto(id)).toEqual({ scheduleId: 'sch@estranho', date: '2026-10-20' })
  })

  it('id de lançamento comum não é fonte prevista', () => {
    expect(ehFontePrevista('tx_123')).toBe(false)
    expect(parseFontePrevisto('tx_123')).toBeNull()
    expect(parseFontePrevisto('sch:')).toBeNull()
  })
})

describe('ehGastoPrevistoDeCartao', () => {
  it('aceita despesa agendada do cartão', () => {
    expect(ehGastoPrevistoDeCartao(agendamento(), CARD)).toBe(true)
  })
  it('recusa outro cartão, receita e os tipos geridos pelo motor', () => {
    expect(ehGastoPrevistoDeCartao(agendamento({ accountId: 'outro' }), CARD)).toBe(false)
    expect(ehGastoPrevistoDeCartao(agendamento({ transactionType: 'income' }), CARD)).toBe(false)
    for (const tipo of ['resgate_reserva', 'gerencial_devolucao', 'pagamento_fatura']) {
      expect(ehGastoPrevistoDeCartao(agendamento({ tipo }), CARD)).toBe(false)
    }
  })
})

describe('previstosDaFatura', () => {
  const rodar = (schedules, faturaMesAno = '2026-10') =>
    previstosDaFatura({ schedules, cardId: CARD, faturaMesAno, getOccurrences: getOcc, faturaDe })

  it('CENÁRIO 1 — agendamento pendente vira previsto da fatura', () => {
    const r = rodar([agendamento()])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({
      id: 'sch:sch_1@2026-10-20', scheduleId: 'sch_1', date: '2026-10-20',
      valor: 582.67, grupoGerencial: 'grp_phlo',
    })
  })

  it('CENÁRIO 2 — ocorrência pulada deixa de ser previsto', () => {
    expect(rodar([agendamento({ skipped: ['2026-10-20'] })])).toEqual([])
  })

  it('CENÁRIO 4 — ocorrência registrada deixa de ser previsto', () => {
    expect(rodar([agendamento({ registered: ['2026-10-20'] })])).toEqual([])
  })

  it('CENÁRIO 3 — override de valor da ocorrência é respeitado', () => {
    const r = rodar([agendamento({ overrides: { '2026-10-20': { amount: 700 } } })])
    expect(r[0].valor).toBe(700)
  })

  it('override de DATA move o previsto de fatura', () => {
    const s = agendamento({ overrides: { '2026-10-20': { date: '2026-11-03' } } })
    expect(rodar([s], '2026-10')).toEqual([])
    const nov = rodar([s], '2026-11')
    expect(nov).toHaveLength(1)
    expect(nov[0].id).toBe('sch:sch_1@2026-11-03')
  })

  it('só a fatura pedida; recorrente rende um previsto por mês', () => {
    const s = agendamento({ frequency: 'monthly' })
    expect(rodar([s], '2026-10')).toHaveLength(1)
    expect(rodar([s], '2026-11')).toHaveLength(1)
    expect(rodar([s], '2026-11')[0].id).toBe('sch:sch_1@2026-11-20')
  })

  it('múltiplos agendamentos somam como fontes distintas', () => {
    const r = rodar([
      agendamento({ id: 'a', amount: 100, startDate: '2026-10-05' }),
      agendamento({ id: 'b', amount: 200, startDate: '2026-10-15' }),
    ])
    expect(r.map(x => x.valor)).toEqual([100, 200])
    expect(new Set(r.map(x => x.id)).size).toBe(2)
  })

  it('ignora outro cartão, tipos geridos e valor zero', () => {
    const r = rodar([
      agendamento({ id: 'x', accountId: 'outro_card' }),
      agendamento({ id: 'y', tipo: 'resgate_reserva' }),
      agendamento({ id: 'z', amount: 0 }),
    ])
    expect(r).toEqual([])
  })

  it('devolve vazio sem cartão ou sem fatura', () => {
    expect(previstosDaFatura({ schedules: [agendamento()], cardId: null, faturaMesAno: '2026-10', getOccurrences: getOcc, faturaDe })).toEqual([])
    expect(previstosDaFatura({ schedules: [agendamento()], cardId: CARD, faturaMesAno: null, getOccurrences: getOcc, faturaDe })).toEqual([])
  })
})

describe('faturasDoAgendamento', () => {
  it('inclui as faturas das ocorrências pendentes', () => {
    const f = faturasDoAgendamento({
      schedule: agendamento({ frequency: 'monthly' }), cardId: CARD, getOccurrences: getOcc, faturaDe,
    })
    expect(f.has('2026-10')).toBe(true)
    expect(f.has('2026-11')).toBe(true)
  })

  it('inclui a data pulada/registrada passada em datasExtras', () => {
    // A ocorrência de outubro sumiu (pulada), mas a fatura de outubro é justamente a que mudou.
    const s = agendamento({ skipped: ['2026-10-20'] })
    const semExtra = faturasDoAgendamento({ schedule: s, cardId: CARD, getOccurrences: getOcc, faturaDe, datasExtras: [] })
    const comExtra = faturasDoAgendamento({ schedule: s, cardId: CARD, getOccurrences: getOcc, faturaDe, datasExtras: ['2026-10-20'] })
    expect(comExtra.has('2026-10')).toBe(true)
    expect(semExtra.size).toBeLessThanOrEqual(comExtra.size)
  })

  it('agendamento de outro cartão não gera fatura nenhuma', () => {
    const f = faturasDoAgendamento({ schedule: agendamento(), cardId: 'outro', getOccurrences: getOcc, faturaDe })
    expect(f.size).toBe(0)
  })
})

// A garantia "nunca duplica" do pedido. Resgate é transferência real entre contas: cobrir o mesmo
// gasto duas vezes tira dinheiro da reserva duas vezes.
describe('resgate em dobro na transição previsto → lançamento', () => {
  const resgateExecutado = {
    id: 'fsch_card_itau_202610_resgate_reserva_acc_phlo',
    tipo: 'resgate_reserva',
    sourceExpenseIds: ['tx_a', 'sch:sch_1@2026-10-20'],
    registered: ['2026-10-10'], skipped: [],
  }
  // O lançamento que nasce quando a ocorrência é registrada.
  const txDoAgendamento = { id: 'tx_novo', scheduleId: 'sch_1', date: '2026-10-20', amount: 582.67 }

  it('o lançamento nascido da ocorrência já coberta NÃO pede resgate novo', () => {
    expect(isResgatePagoParaGasto('tx_novo', [resgateExecutado], [txDoAgendamento])).toBe(true)
  })

  it('lançamento coberto pelo próprio id segue detectado', () => {
    expect(isResgatePagoParaGasto('tx_a', [resgateExecutado], [{ id: 'tx_a' }])).toBe(true)
  })

  it('gasto não coberto segue pedindo resgate', () => {
    const outro = { id: 'tx_b', scheduleId: 'sch_9', date: '2026-10-20' }
    expect(isResgatePagoParaGasto('tx_b', [resgateExecutado], [outro])).toBe(false)
  })

  it('data diferente não casa — ocorrência distinta pede o seu resgate', () => {
    const outraOcc = { id: 'tx_c', scheduleId: 'sch_1', date: '2026-11-20' }
    expect(isResgatePagoParaGasto('tx_c', [resgateExecutado], [outraOcc])).toBe(false)
  })

  it('resgate PENDENTE não cobre nada — o gasto continua a descoberto', () => {
    const pendente = { ...resgateExecutado, registered: [], skipped: [] }
    expect(isResgatePagoParaGasto('tx_novo', [pendente], [txDoAgendamento])).toBe(false)
    expect(isResgatePagoParaGasto('tx_a', [pendente], [{ id: 'tx_a' }])).toBe(false)
  })

  it('lançamento avulso (sem scheduleId) não casa com fonte prevista nenhuma', () => {
    expect(isResgatePagoParaGasto('tx_solto', [resgateExecutado], [{ id: 'tx_solto', date: '2026-10-20' }])).toBe(false)
  })
})
