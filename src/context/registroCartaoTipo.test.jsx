// @vitest-environment jsdom
// Registro de agendamento de CARTÃO grava o tipo da conta ('credit') e, no grupo G, gera a etapa A —
// com o AppProvider e o motor reais. Caso real (30/10/2026): o agendamento sem account_type gerava
// gastos fora do motor gerencial (sem etapa A). API simulada; dados FICTÍCIOS.
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { render, waitFor, act, cleanup } from '@testing-library/react'

const dados = () => ({
  settings: { financialMonthStartDay: 1, financialMonthMode: 'custom', currency: 'BRL', recurringMatchExceptions: [], categoryGroups: [], faturasFechadas: {} },
  costCenters: [], budgets: [], classificationRules: [], gerencialRules: [], payables: [], transactions: [],
  payees: [], envelopes: [], accountGroups: null, cardImports: [], rateios: [], scheduleReservaFuncoes: [], favorecidoAliases: [],
  profiles: [{ id: 'p1', name: 'Pessoal', ordem: 0 }], categories: [{ id: 'cat_tel', name: 'Telefone', type: 'expense' }], reserveFunctions: [],
  accounts: [
    { id: 'cc', name: 'Conta', type: 'checking', profileId: 'p1', contaCorrentePrincipal: true, balance: 1000, initialBalance: 1000, active: true },
    { id: 'card', name: 'Cartão', apelido: 'Card', type: 'credit', profileId: 'p1', closingDay: 14, dueDay: 20, paymentAccountId: 'cc', active: true },
    { id: 'ger', name: 'Ger. Card', type: 'checking', profileId: 'p1', grupoGerencial: 'grp_1', balance: 0, initialBalance: 0, active: true },
  ],
  gerencialGroups: [
    { id: 'grp_1', number: 1, name: 'Gerencial', alias: 'G', fixed: true },
    { id: 'grp_D', number: 'D', name: 'Despesa', alias: 'D', fixed: true },
  ],
  // Agendamento de cartão SEM accountType (como os do caso real).
  schedules: [{ id: 'sch_vivo', description: 'VIVO', transactionType: 'expense', accountId: 'card', amount: 216, frequency: 'monthly',
    startDate: '2026-11-10', occurrenceType: 'continuous', installments: 0, registered: [], skipped: [], overrides: {}, grupoGerencial: 'grp_1', categoryId: 'cat_tel', autoRegister: false }],
})
let base = dados()
vi.mock('../lib/db', async (orig) => ({
  ...(await orig()),
  loadFromDb: vi.fn(async () => ({ status: 'connected', assinatura: null, recursos: null, data: base })),
}))
const { AppProvider, useApp } = await import('./AppContext')

let app
function Espiao() { app = useApp(); return null }
beforeAll(() => {
  globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
  localStorage.setItem('auth_token', 'x.' + btoa(JSON.stringify({ nivel: 'admin', sub: 't', exp: 4102444800 })) + '.y')
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
})
afterEach(() => { cleanup(); base = dados(); app = null })

async function montar() {
  render(<AppProvider><Espiao /></AppProvider>)
  await waitFor(() => expect(app?.accounts?.some(a => a.id === 'card')).toBe(true), { timeout: 15000 })
}

describe('lançamento de cartão criado por agendamento: tipo da conta', () => {
  it('"Pagar" do agendamento (addTransaction sem accountType, grupo G): grava "credit" e gera a etapa A', async () => {
    await montar()
    let id
    // O mesmo objeto que o Pagar de Agendamentos manda (SchedulePanel): sem accountType.
    await act(async () => {
      id = app.addTransaction({ type: 'expense', accountId: 'card', payee: 'VIVO', amount: 216, date: '2026-11-10', categoryId: 'cat_tel',
        grupoGerencial: 'grp_1', description: 'VIVO', scheduleId: 'sch_vivo', dataOcorrencia: '2026-11-10', origin: 'agendamento' })
    })
    await waitFor(() => expect(app.transactions.find(t => t.id === id)?.accountType).toBe('credit'))
    await waitFor(() => expect(app.transactions.some(t => t.type === 'transfer' && t.sourceExpenseId === id && t.toAccountId === 'ger')).toBe(true), { timeout: 10000 })
  }, 30000)

  it('Registrar ocorrência (registerScheduleOccurrence) grava o tipo da conta, não o do agendamento', async () => {
    await montar()
    let id
    await act(async () => { id = app.registerScheduleOccurrence('sch_vivo', '2026-11-10', '2026-11-10') })
    await waitFor(() => expect(app.transactions.find(t => t.id === id)?.accountType).toBe('credit'))
  }, 30000)
})
