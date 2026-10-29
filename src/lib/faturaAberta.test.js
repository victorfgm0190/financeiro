import { describe, it, expect } from 'vitest'
import { faturaPelaData, faturaAbertaDoCartao, avisoFaturaFechada, proximaFatura } from './faturaAberta.js'

describe('fatura de lançamento novo no cartão', () => {
  it('pelo dia de fechamento: até o fechamento → mês corrente; depois → o seguinte', () => {
    expect(faturaPelaData('2026-10-29', 3)).toBe('2026-11')
    expect(faturaPelaData('2026-10-02', 3)).toBe('2026-10')
    expect(faturaPelaData('2026-12-20', 10)).toBe('2027-01')
  })
  it('aberta: a calculada, sem aviso', () => {
    const f = faturaAbertaDoCartao({ cardId: 'c1', date: '2026-10-29', closingDay: 3, faturasFechadas: {} })
    expect(f).toEqual({ calculada: '2026-11', efetiva: '2026-11', fechadas: [] })
    expect(avisoFaturaFechada(f)).toBeNull()
  })
  it('fechada → a próxima aberta, com aviso', () => {
    const f = faturaAbertaDoCartao({ cardId: 'c1', date: '2026-10-02', closingDay: 3, faturasFechadas: { 'c1_2026-10': true } })
    expect(f.efetiva).toBe('2026-11')
    expect(avisoFaturaFechada(f)).toBe('Fatura 10/2026 fechada → lançado na 11/2026')
  })
  it('várias fechadas em sequência; fechamento de OUTRO cartão não conta', () => {
    const ff = { 'c1_2026-10': true, 'c1_2026-11': true, 'c2_2026-12': true }
    expect(faturaAbertaDoCartao({ cardId: 'c1', date: '2026-10-02', closingDay: 3, faturasFechadas: ff }).efetiva).toBe('2026-12')
    expect(avisoFaturaFechada(faturaAbertaDoCartao({ cardId: 'c1', date: '2026-10-02', closingDay: 3, faturasFechadas: ff })))
      .toBe('Fatura 10/2026, 11/2026 fechadas → lançado na 12/2026')
  })
  it('parcelado em 3 a partir da 11/2026: 11, 12 e 01', () => {
    expect([0, 1, 2].map(i => proximaFatura('2026-11', i))).toEqual(['2026-11', '2026-12', '2027-01'])
  })
  it('sem cartão ou sem data → null', () => {
    expect(faturaAbertaDoCartao({ cardId: null, date: '2026-10-02', closingDay: 3 })).toBeNull()
    expect(faturaAbertaDoCartao({ cardId: 'c1', date: '', closingDay: 3 })).toBeNull()
  })
})

describe('edição: o seletor mostra a fatura gravada (ou a em que o antigo está)', () => {
  const accounts = [{ id: 'c1', type: 'credit', closingDay: 13 }, { id: 'itau', type: 'checking' }]
  it('antigo sem fatura gravada → a fatura pela data (sem pular fechadas)', async () => {
    const { faturaInicialDaEdicao } = await import('./faturaAberta.js')
    expect(faturaInicialDaEdicao({ id: 't1', type: 'expense', accountId: 'c1', date: '2026-10-29' }, accounts)).toBe('2026-11')
    expect(faturaInicialDaEdicao({ id: 't1', type: 'expense', accountId: 'c1', date: '2026-10-13' }, accounts)).toBe('2026-10')
  })
  it('já gravada, lançamento novo, outro tipo ou conta corrente → null (vale o que já existe)', async () => {
    const { faturaInicialDaEdicao } = await import('./faturaAberta.js')
    expect(faturaInicialDaEdicao({ id: 't1', type: 'expense', accountId: 'c1', date: '2026-10-29', faturaMonthYear: '2026-12' }, accounts)).toBeNull()
    expect(faturaInicialDaEdicao({ type: 'expense', accountId: 'c1', date: '2026-10-29' }, accounts)).toBeNull()
    expect(faturaInicialDaEdicao({ id: 't1', type: 'income', accountId: 'c1', date: '2026-10-29' }, accounts)).toBeNull()
    expect(faturaInicialDaEdicao({ id: 't1', type: 'expense', accountId: 'itau', date: '2026-10-29' }, accounts)).toBeNull()
  })
})

describe('gravação: despesa de cartão nunca fica sem fatura', () => {
  const accounts = [{ id: 'c1', type: 'credit', closingDay: 13 }, { id: 'itau', type: 'checking' }]
  it('criação (agendamento, duplicar, formulário): a efetiva, pulando a fechada', async () => {
    const { faturaParaCriacao } = await import('./faturaAberta.js')
    expect(faturaParaCriacao({ type: 'expense', accountId: 'c1', date: '2026-10-29' }, accounts, {})).toBe('2026-11')
    expect(faturaParaCriacao({ type: 'expense', accountId: 'c1', date: '2026-10-10' }, accounts, { 'c1_2026-10': true })).toBe('2026-11')
    expect(faturaParaCriacao({ type: 'expense', accountId: 'c1', date: '2026-10-10', faturaMonthYear: '2026-10' }, accounts, {})).toBeNull()
    expect(faturaParaCriacao({ type: 'expense', accountId: 'itau', date: '2026-10-10' }, accounts, {})).toBeNull()
  })
  it('edição: data mudada não move de fatura sozinha (fica a da data antiga)', async () => {
    const { faturaParaEdicao } = await import('./faturaAberta.js')
    const old = { type: 'expense', accountId: 'c1', date: '2026-10-10' }
    expect(faturaParaEdicao(old, { date: '2026-10-20' }, accounts)).toBe('2026-10')
    expect(faturaParaEdicao({ ...old, faturaMonthYear: '2026-10' }, { date: '2026-10-20' }, accounts)).toBeNull()
    expect(faturaParaEdicao(old, { faturaMonthYear: '2026-12' }, accounts)).toBeNull()
    // Passou de conta corrente para o cartão → pela data nova.
    expect(faturaParaEdicao({ type: 'expense', accountId: 'itau', date: '2026-10-10' }, { accountId: 'c1', date: '2026-10-20' }, accounts)).toBe('2026-11')
  })
})
