// Desconto de envelope nos quatro cálculos de saldo/projeção (Saldo Principal — função protegida,
// computeFluxoCaixa, saldo por conta e KPIs que usam o Fluxo) e na tela Envelopes.
//  1) SEM rateio: resultado idêntico, centavo por centavo, ao capturado ANTES da mudança
//     (envelopesSaldos.antes.json, gerado com o código do commit d420dd4).
//  2) COM rateio: os cálculos batem entre si e com a tela Envelopes.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { calcularSaldoPrincipalBreakdown } from './saldoPrincipal'
import { computeFluxoCaixa } from './fluxoCaixa'
import { gastoEnvelopes } from './envelopes'
import { parteDoEnvelope } from './rateio'
import { REF, SETTINGS, periodo, ACCOUNTS, ENVELOPES, transacoes, SEMENTES } from './__fixtures__/envelopesSaldos'

const ANTES = JSON.parse(readFileSync(new URL('./__fixtures__/envelopesSaldos.antes.json', import.meta.url), 'utf-8'))
const COMP = 2026 * 12 + 10
const rodar = (transactions, rateios = null) => {
  const sp = calcularSaldoPrincipalBreakdown({ accounts: ACCOUNTS, transactions, schedules: [], envelopes: ENVELOPES, settings: SETTINGS, gerencialGroups: [], profileId: null, getNextOccurrences: () => [], getFinancialPeriod: periodo, rateios }, REF)
  const fc = computeFluxoCaixa({ accountIds: new Set(['cc', 'cc2']), currentBalance: 6000, start: '2026-11-01', end: '2026-11-30', transactions, schedules: [], envelopes: ENVELOPES, getNextOccurrences: () => [], includeSchedules: true, rateios })
  const env = gastoEnvelopes(ENVELOPES, transactions, COMP, 1, rateios).map(x => x.spent)
  return { sp, fc: { saldoFinal: fc.saldoFinal, envelopesTotal: fc.envelopesTotal, env: fc.rows.filter(r => r._envelope).map(r => [r._key, r.saida]) }, env }
}
// Saldo por conta (AppContext getAccountSaldos): o mesmo laço, com a mesma função.
const restanteDaConta = (accountId, transactions, rateios = null) => {
  let total = 0
  for (const env of ENVELOPES.filter(e => e.accountId === accountId)) {
    let spent = 0
    for (const tx of transactions) {
      if (tx.type !== 'expense') continue
      const parte = parteDoEnvelope(tx, rateios, env.categoryIds)
      if (!parte || tx.date.slice(0, 7) !== '2026-11') continue
      spent += parte
    }
    total = Math.round((total + Math.max(0, Math.round(((env.limitAmount || 0) - spent) * 100) / 100)) * 100) / 100
  }
  return total
}

// computeFluxoCaixa usa o "hoje" do relógio: lançamentos de [start, hoje] são desfeitos do saldo atual
// (já estão no balance). O antes.json foi capturado em 31/10/2026, antes do início do período (01/11):
// o relógio fica fixo nesse dia para o resultado não depender do dia em que a suíte roda.
const HOJE_DA_CAPTURA = new Date(2026, 9, 31, 12, 0, 0)

describe('envelope nos saldos', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(HOJE_DA_CAPTURA) })
  afterEach(() => { vi.useRealTimers() })

  it('SEM rateio: os quatro cálculos e a tela Envelopes iguais ao de antes, centavo por centavo', () => {
    for (const seed of SEMENTES) {
      const agora = rodar(transacoes(seed))
      expect(agora).toEqual(ANTES[seed])
      expect(rodar(transacoes(seed), new Map())).toEqual(ANTES[seed]) // Map vazio = sem rateio
    }
  })

  it('COM rateio: Saldo Principal, Fluxo, saldo por conta e tela Envelopes batem entre si', () => {
    const transactions = [
      { id: 'mc', type: 'expense', accountId: 'cc', amount: 200, categoryId: 'confra', date: '2026-11-05' },
      { id: 'merc1', type: 'expense', accountId: 'cc', amount: 300, categoryId: 'merc', date: '2026-11-06' },
    ]
    const rateios = new Map([['mc', [{ categoriaId: 'confra', valor: 100 }, { categoriaId: 'merc', valor: 100 }]]])
    const r = rodar(transactions, rateios)
    // Tela Envelopes: Mercado 300 + 100 (parte do McDonald's); Lazer 100 (confraternização).
    expect(r.env).toEqual([400, 100, 0])
    const restanteEsperado = (800 - 400) + (300 - 100) // envelopes da conta cc
    expect(restanteDaConta('cc', transactions, rateios)).toBe(restanteEsperado)
    expect(r.sp.projetado.envelopes.map(e => e.restante).reduce((s, v) => s + v, 0)).toBe(restanteEsperado + 150.55)
    // Fluxo: a linha de envelope é datada no FIM do ciclo; com dueDay 1, o ciclo dos gastos (02/11–01/12)
    // fecha em 01/12. O ciclo anterior (fecha 01/11) entra com o limite cheio, sem gastos.
    const nov = r.fc.env.filter(([k]) => k.endsWith('2026-12-01')).reduce((s, [, v]) => s + v, 0)
    expect(Math.round(nov * 100) / 100).toBe(restanteEsperado + 150.55)
    expect(Math.round((r.fc.envelopesTotal - nov) * 100) / 100).toBe(800 + 300 + 150.55)
    // Sem o rateio, o McDonald's inteiro iria para Lazer (confra) e nada para Mercado.
    expect(rodar(transactions).env).toEqual([300, 200, 0])
  })
})
