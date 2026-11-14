// @vitest-environment jsdom
// Motor REAL (AppProvider): a etapa A de parcela 2..N criada pelo "Executar Gerenciais" no dia 15
// (início do mês financeiro) para uma fatura cujo VENCIMENTO ainda está fora do ciclo atual (12/2026,
// vence 20/12; ciclo 15/11–14/12) não é removida nem refeita pelo recálculo da fatura
// (recalcularAgendamentosFatura / reconcileFaturaState) nem pelo reconciliarGerencial, e o saldo da
// conta Ger. não muda. API simulada; dados FICTÍCIOS.
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { render, waitFor, act, cleanup } from '@testing-library/react'

const dados = () => ({
  settings: { financialMonthStartDay: 15, financialMonthMode: 'custom', currency: 'BRL', recurringMatchExceptions: [], categoryGroups: [], faturasFechadas: {} },
  costCenters: [], budgets: [], classificationRules: [], gerencialRules: [], payables: [], schedules: [],
  payees: [], envelopes: [], accountGroups: null, cardImports: [], rateios: [], scheduleReservaFuncoes: [], favorecidoAliases: [],
  profiles: [{ id: 'p1', name: 'Pessoal', ordem: 0 }], categories: [], reserveFunctions: [],
  accounts: [
    { id: 'cc', name: 'Conta', type: 'checking', profileId: 'p1', contaCorrentePrincipal: true, balance: 5000, initialBalance: 5000, active: true },
    { id: 'card', name: 'Cartão', apelido: 'Card', type: 'credit', profileId: 'p1', closingDay: 13, dueDay: 20, paymentAccountId: 'cc', active: true },
    { id: 'ger', name: 'Ger. Card', type: 'gerencial', isGerencial: true, profileId: 'p1', grupoGerencial: 'grp_1', balance: 0, initialBalance: 0, active: true },
  ],
  gerencialGroups: [
    { id: 'grp_1', number: 1, name: 'Gerencial', alias: 'G', fixed: true },
    { id: 'grp_D', number: 'D', name: 'Despesa', alias: 'D', fixed: true },
  ],
  // Parcela 2/3 confirmada (com data do cartão) na fatura 12/2026, grupo G, ainda sem etapa A.
  transactions: [{
    id: 'parc2', type: 'expense', accountId: 'card', accountType: 'credit', amount: 49.37, date: '2026-11-15', dateCartao: '2026-10-03',
    faturaMonthYear: '2026-12', faturaRef: '12/2026', description: 'Amazon 2/3', installmentNum: 2, installmentTotal: 3, serieId: 's1',
    grupoGerencial: 'grp_1', origin: 'importacao_fatura',
  }],
})
vi.mock('../lib/db', async (orig) => ({
  ...(await orig()),
  loadFromDb: vi.fn(async () => ({ status: 'connected', assinatura: null, recursos: null, data: dados() })),
}))
const { AppProvider, useApp } = await import('./AppContext')

let app
function Espiao() { app = useApp(); return null }
beforeAll(() => {
  globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
  localStorage.setItem('auth_token', 'x.' + btoa(JSON.stringify({ nivel: 'admin', sub: 't', exp: 4102444800 })) + '.y')
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
})
afterEach(() => { cleanup(); app = null; vi.useRealTimers() })

describe('motor da fatura × etapa A do "Executar Gerenciais" em fatura com vencimento fora do ciclo', () => {
  it('etapa A criada em 15/11 para a fatura 12/2026 continua lá depois do recálculo; saldo da Ger. não muda', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 15, 10, 0, 0)) // 15/11/2026 — ciclo 15/11–14/12; a 12/2026 vence 20/12
    render(<AppProvider><Espiao /></AppProvider>)
    await waitFor(() => expect(app?.accounts?.some(a => a.id === 'card')).toBe(true), { timeout: 15000 })
    // Executar Gerenciais (a mesma rotina do botão).
    await act(async () => { app.executarProvisoesGerenciais(['parc2']) })
    const etapa = () => app.transactions.find(t => t.type === 'transfer' && (t.parentTxId === 'parc2' || t.sourceExpenseId === 'parc2'))
    await waitFor(() => expect(etapa()).toBeTruthy())
    const antes = { etapa: { ...etapa() }, ger: app.accounts.find(a => a.id === 'ger').balance }
    expect(antes.ger).toBeCloseTo(49.37, 2)
    // Recálculo da fatura 12/2026 (motor) e o reconciliador (inclui o passo B dos saldos Ger.).
    // O reconciliador resolve dentro do updater do estado: chamado no act e esperado fora dele.
    let resumo
    await act(async () => {
      app.recalcularAgendamentosFatura('card', '2026', '12')
      resumo = app.reconciliarGerencial('card')
    })
    const r = await resumo
    expect(r.saldosCorrigidos).toBe(0)
    await act(async () => { await new Promise(r => setTimeout(r, 50)) })
    const depois = etapa()
    expect(depois).toBeTruthy()
    expect(depois.id).toBe(antes.etapa.id)
    expect(depois.amount).toBe(antes.etapa.amount)
    // Nenhuma etapa A duplicada (tx_gerA_) por cima da do Executar Gerenciais.
    expect(app.transactions.filter(t => t.type === 'transfer' && (t.parentTxId === 'parc2' || t.sourceExpenseId === 'parc2'))).toHaveLength(1)
    expect(app.accounts.find(a => a.id === 'ger').balance).toBe(antes.ger)
  }, 30000)
})
