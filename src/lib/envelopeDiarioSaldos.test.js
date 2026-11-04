// Envelope DIÁRIO nos cálculos de projeção: Saldo Principal (cálculo protegido, recebendo o envelope
// pelo wrapper — envelopesParaProjecao), Fluxo de Caixa (computeFluxoCaixa) e a tela (resumo), todos
// com o MESMO A gastar. E a regressão: com o contexto novo, o Mensal continua idêntico ao de antes.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { calcularSaldoPrincipalBreakdown } from './saldoPrincipal'
import { computeFluxoCaixa } from './fluxoCaixa'
import { gastoEnvelopes, comOrcamentoDiario, resumoEnvelope } from './envelopes'
import { envelopesParaProjecao } from './envelopeOrcamento'
import { feriadosAtivos } from './feriados'
import { REF, SETTINGS, periodo, ACCOUNTS, ENVELOPES, transacoes, SEMENTES } from './__fixtures__/envelopesSaldos'

const ANTES = JSON.parse(readFileSync(new URL('./__fixtures__/envelopesSaldos.antes.json', import.meta.url), 'utf-8'))
const feriadosDe = (i, f) => feriadosAtivos([], i, f)

describe('Mensal: com o contexto do orçamento diário, nada muda', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 31, 12, 0, 0)) })
  afterEach(() => { vi.useRealTimers() })
  it('Saldo Principal (pelo wrapper) e Fluxo iguais ao capturado antes, centavo por centavo', () => {
    for (const seed of SEMENTES) {
      const transactions = transacoes(seed)
      const envs = envelopesParaProjecao(ENVELOPES, { transactions, rateios: null, startDay: 1, diaInicio: 1, referenceDate: REF, feriadosDe })
      expect(envs.every((e, i) => e === ENVELOPES[i])).toBe(true)
      const sp = calcularSaldoPrincipalBreakdown({ accounts: ACCOUNTS, transactions, schedules: [], envelopes: envs, settings: SETTINGS, gerencialGroups: [], profileId: null, getNextOccurrences: () => [], getFinancialPeriod: periodo, rateios: null }, REF)
      expect(sp).toEqual(ANTES[seed].sp)
      const fc = computeFluxoCaixa({
        accountIds: new Set(['cc', 'cc2']), currentBalance: 6000, start: '2026-11-01', end: '2026-11-30', transactions, schedules: [], envelopes: ENVELOPES,
        getNextOccurrences: () => [], includeSchedules: true, orcamentoEnvelopes: { diaInicio: 1, hoje: '2026-10-31', feriadosDe },
      })
      expect({ saldoFinal: fc.saldoFinal, envelopesTotal: fc.envelopesTotal, env: fc.rows.filter(r => r._envelope).map(r => [r._key, r.saida]) }).toEqual(ANTES[seed].fc)
    }
  })
})

describe('Diário: o mesmo A gastar no Saldo Principal, no Fluxo e na tela', () => {
  // Caso A do pedido: ciclo 15/10–14/11/2026, R$ 40/dia seg–sex, 02/11 feriado, hoje 04/11, gasto 533 até ontem.
  const S15 = { financialMonthStartDay: 15, financialMonthMode: 'custom' }
  const per15 = (ref) => ({ start: new Date(2026, 9, 15), end: new Date(2026, 10, 14) }) // eslint-disable-line no-unused-vars
  const HOJE = new Date(2026, 10, 4, 12, 0, 0)
  const DIARIO = { id: 'd', name: 'Almoço', categoryIds: ['alm'], accountId: 'cc', tipoOrcamento: 'diario', valorDia: 40, diasSemana: [1, 2, 3, 4, 5], descontarFeriados: true, limitAmount: 0, dueDay: 1, history: [] }
  const TX = [
    { id: 'a', type: 'expense', accountId: 'cc', amount: 500, categoryId: 'alm', date: '2026-10-20' },
    { id: 'b', type: 'expense', accountId: 'cc', amount: 33, categoryId: 'alm', date: '2026-11-03' },
  ]
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(HOJE) })
  afterEach(() => { vi.useRealTimers() })

  it('Saldo Projetado do Painel desconta 307 (8 dias × 40 − 13 de excesso)', () => {
    const envs = envelopesParaProjecao([DIARIO], { transactions: TX, rateios: null, startDay: 15, diaInicio: 15, referenceDate: HOJE, feriadosDe })
    const sp = calcularSaldoPrincipalBreakdown({ accounts: ACCOUNTS, transactions: TX, schedules: [], envelopes: envs, settings: S15, gerencialGroups: [], profileId: null, getNextOccurrences: () => [], getFinancialPeriod: per15, rateios: null }, HOJE)
    expect(sp.projetado.envelopesTotal).toBe(307)
    expect(sp.projetado.envelopes).toEqual([{ name: 'Almoço', restante: 307 }])
  })

  it('Fluxo de Caixa: 307 no fim do ciclo atual e o orçamento inteiro (seg–sex, 15/11–14/12, 20/11 feriado = 800) no seguinte', () => {
    const fc = computeFluxoCaixa({
      accountIds: new Set(['cc']), currentBalance: 5000, start: '2026-11-04', end: '2026-12-20', transactions: TX, schedules: [], envelopes: [DIARIO],
      getNextOccurrences: () => [], includeSchedules: true, orcamentoEnvelopes: { diaInicio: 15, hoje: '2026-11-04', feriadosDe },
    })
    expect(fc.rows.filter(r => r._envelope).map(r => [r.date, r.saida])).toEqual([['2026-11-14', 307], ['2026-12-14', 800], ['2027-01-14', 840]])
  })

  it('tela Envelopes: orçamento 840, gasto 533, A gastar 307, excesso 13', () => {
    const comp = 2026 * 12 + 9
    const [d] = comOrcamentoDiario(gastoEnvelopes([DIARIO], TX, comp, 15, null), { compKey: comp, startDay: 15, diaInicio: 15, hoje: '2026-11-04', feriadosDe })
    const r = resumoEnvelope(d)
    expect(r).toMatchObject({ limite: 840, gasto: 533, disponivel: 307, estourado: false })
    expect(r.orc).toMatchObject({ excesso: 13, diasRestantes: 8, previstoAteOntem: 520 })
  })
})
