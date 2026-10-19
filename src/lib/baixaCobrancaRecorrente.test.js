import { describe, it, expect } from 'vitest'
import { ocorrenciaDaCobranca, baixarPeloValor, metaBaixaComValor, TIPO_BAIXA } from './scheduleBaixa.js'

// "Cobrança recorrente detectada" (ex.: Anthropic* Claude Sub, cartão 583,04 × agendado 582,66).
const assinatura = (extra = {}) => ({
  id: 'sch_claude', description: 'Anthropic* Claude Sub', transactionType: 'expense', accountId: 'card_1',
  amount: 582.66, frequency: 'monthly', startDate: '2026-09-15', nextOccurrence: '2026-10-15',
  registered: ['2026-09-15'], registeredMeta: { '2026-09-15': { tipo: 'importado', lancamento_id: 'tx_set', valor_realizado: 580.1 } },
  skipped: [], overrides: {}, ...extra,
})
const meta = { tipo: TIPO_BAIXA.IMPORTADO, lancamento_id: 'tx_nov', import_id: 'imp_1' }

describe('ocorrência que a cobrança paga', () => {
  it('a pendente da MESMA fatura do lançamento, não a próxima', () => {
    // fechamento 13: 15/10 → fatura 11/2026; 15/11 → 12/2026
    const occ = ocorrenciaDaCobranca(assinatura(), { faturaMonthYear: '2026-12', date: '2026-11-15' }, 13)
    expect(occ.date).toBe('2026-11-15')
    expect(occ.amount).toBe(582.66)
  })
  it('sem ocorrência na fatura, cai na próxima pendente', () => {
    expect(ocorrenciaDaCobranca(assinatura(), { faturaMonthYear: '2026-05' }, 13).date).toBe('2026-10-15')
  })
  it('conta corrente: mesmo mês (closingDay 31)', () => {
    expect(ocorrenciaDaCobranca(assinatura(), { date: '2026-11-20' }, 31).date).toBe('2026-11-15')
  })
})

describe('baixa pelo valor do cartão', () => {
  it('ocorrência paga, ligada ao lançamento, com previsto × realizado no registro dela', () => {
    const s = baixarPeloValor(assinatura(), { occurrenceDate: '2026-10-15', meta, previsto: 582.66, realizado: 583.04 })
    expect(s.registered).toContain('2026-10-15')
    expect(s.registeredMeta['2026-10-15']).toEqual({ ...meta, valor_previsto: 582.66, valor_realizado: 583.04 })
    expect(s.amount).toBe(582.66) // as próximas não mudam sem a opção
    // a já paga não é tocada
    expect(s.registeredMeta['2026-09-15']).toEqual(assinatura().registeredMeta['2026-09-15'])
  })
  it('com "Atualizar também as próximas": só o valor base (pendentes) muda', () => {
    const s = baixarPeloValor(assinatura(), { occurrenceDate: '2026-10-15', meta, previsto: 582.66, realizado: 583.04, atualizarFuturas: true })
    expect(s.amount).toBe(583.04)
    expect(s.registeredMeta['2026-09-15'].valor_realizado).toBe(580.1)
  })
  it('valores com 2 casas', () => {
    expect(metaBaixaComValor(null, 1 / 3, 2 / 3)).toEqual({ valor_previsto: 0.33, valor_realizado: 0.67 })
  })
})

describe('baixa automática (regras A e B) também leva o valor do cartão', () => {
  it('candidato traz previsto (ocorrência) × realizado (linha do cartão) para o registered_meta', async () => {
    const { candidatosBaixa } = await import('./scheduleBaixa.js')
    const card = { id: 'card_1', closingDay: 13 }
    const [c] = candidatosBaixa({ description: 'Anthropic* Claude Sub', amount: 582.68, type: 'expense', faturaMonthYear: '2026-11' }, [assinatura()], card)
    expect(c).toMatchObject({ occurrenceDate: '2026-10-15', previsto: 582.66, realizado: 582.68 })
    expect(metaBaixaComValor(meta, c.previsto, c.realizado)).toMatchObject({ valor_previsto: 582.66, valor_realizado: 582.68 })
  })
})
