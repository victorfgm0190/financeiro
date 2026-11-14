// @vitest-environment jsdom
// Ajuste ao valor do banco × grupo G (decisão de 14/11/2026), com o MOTOR REAL (AppProvider):
//   • devolução gerencial JÁ EXECUTADA → etapa A com o novo valor, devolução intocada e UM ajuste da
//     diferença na fatura da compra; saldo gerencial da fatura = 0; motor de integridade e "Verificar
//     e corrigir" sem pendência;
//   • devolução AGENDADA → só o motor recalcula (sem ajuste).
// O fluxo é o mesmo da confirmação da importação (ImportPanel): updateTransaction do gasto, plano de
// lib/ajusteValorBanco, updateTransaction da etapa A e addTransaction do ajuste. API simulada; dados FICTÍCIOS.
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { render, waitFor, act, cleanup } from '@testing-library/react'
import { planoDoAjuste } from '../lib/ajusteValorBanco'
import { executarRegras } from '../lib/integridade/regras'
import { verificarCartao, contarPendencias, avisoDaFatura } from '../lib/verificarCartao'

const SETTINGS = { financialMonthStartDay: 15, financialMonthMode: 'custom', currency: 'BRL', recurringMatchExceptions: [], categoryGroups: [], faturasFechadas: {} }
const DEV10 = 'fsch_card_202610_gerencial_devolucao'
const DEV11 = 'fsch_card_202611_gerencial_devolucao'
const gasto = (id, amount, fmy, extra = {}) => ({
  id, type: 'expense', accountId: 'card', accountType: 'credit', amount, faturaMonthYear: fmy, faturaRef: `${fmy.slice(5)}/${fmy.slice(0, 4)}`,
  grupoGerencial: 'grp_1', origin: 'importacao_fatura', ...extra,
})
const devolucao = (id, fmy, amount, ids, registered) => ({
  id, tipo: 'gerencial_devolucao', transactionType: 'transfer', accountId: 'ger', toAccountId: 'cc', amount,
  cardId: 'card', faturaMesAno: fmy, faturaRef: `${fmy.slice(5)}/${fmy.slice(0, 4)}`, frequency: 'once', occurrenceType: 'installment', installments: 1,
  startDate: `${fmy}-20`, registered, skipped: [], autoRegister: false, sourceExpenseIds: ids, description: `Devolução Gerencial Card - Fatura ${fmy}`,
})
let cenario
const dados = () => ({
  settings: SETTINGS,
  costCenters: [], budgets: [], classificationRules: [], gerencialRules: [], payables: [],
  payees: [], envelopes: [], accountGroups: null, cardImports: [], rateios: [], scheduleReservaFuncoes: [], favorecidoAliases: [],
  profiles: [{ id: 'p1', name: 'Pessoal', ordem: 0 }], categories: [], reserveFunctions: [],
  accounts: [
    { id: 'cc', name: 'Conta', type: 'checking', profileId: 'p1', contaCorrentePrincipal: true, balance: 5000, initialBalance: 5000, active: true },
    { id: 'card', name: 'Cartão', apelido: 'Card', type: 'credit', profileId: 'p1', closingDay: 13, dueDay: 20, paymentAccountId: 'cc', active: true },
    { id: 'ger', name: 'Ger. Card', type: 'gerencial', isGerencial: true, profileId: 'p1', grupoGerencial: 'grp_1', balance: cenario.saldoGer, initialBalance: 0, active: true },
  ],
  gerencialGroups: [
    { id: 'grp_1', number: 1, name: 'Gerencial', alias: 'G', fixed: true },
    { id: 'grp_D', number: 'D', name: 'Despesa', alias: 'D', fixed: true },
  ],
  transactions: cenario.transactions,
  schedules: cenario.schedules,
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

// Fatura 10/2026 (vencida, ciclo passado): parcela 2/3 com etapa A do "Executar Gerenciais" e uma
// compra à vista com etapa A automática; devolução executada em 20/10 (R$ 150).
const faturaPaga = () => {
  const p2 = gasto('p2', 100, '2026-10', { date: '2026-09-20', dateCartao: '2026-08-02', description: 'Loja 2/3', installmentNum: 2, installmentTotal: 3, serieId: 's1' })
  const av = gasto('av', 50, '2026-10', { date: '2026-09-25', dateCartao: '2026-09-25', description: 'Mercado' })
  return {
    saldoGer: 0,
    transactions: [
      p2, av,
      { id: 'tx_ger_1_x', type: 'transfer', accountId: 'cc', toAccountId: 'ger', amount: 100, date: '2026-09-15', description: 'Reserva Gerencial - Loja 2/3', grupoGerencial: 'grp_1', cardId: 'card', faturaRef: '10/2026', sourceExpenseId: 'p2', parentTxId: 'p2', origin: 'gerencial_auto' },
      { id: 'tx_gerA_av', type: 'transfer', accountId: 'cc', toAccountId: 'ger', amount: 50, date: '2026-09-25', description: 'Reserva Gerencial - Mercado', grupoGerencial: 'grp_1', cardId: 'card', faturaRef: '10/2026', sourceExpenseId: 'av', origin: 'etapa_a' },
      { id: 'tx_dev10', type: 'transfer', accountId: 'ger', toAccountId: 'cc', amount: 150, date: '2026-10-20', description: 'Devolução Gerencial Card - Fatura 10/2026', cardId: 'card', faturaRef: '10/2026', sourceScheduleId: DEV10, scheduleId: DEV10, origin: 'agendamento' },
    ],
    schedules: [devolucao(DEV10, '2026-10', 150, ['p2', 'av'], ['2026-10-20'])],
  }
}

async function abrir(c) {
  cenario = c
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 14, 10, 0, 0)) // 14/11/2026
  render(<AppProvider><Espiao /></AppProvider>)
  await waitFor(() => expect(app?.accounts?.some(a => a.id === 'card')).toBe(true), { timeout: 15000 })
}
const esperar = () => act(async () => { await new Promise(r => setTimeout(r, 50)) })
const tx = (id) => app.transactions.find(t => t.id === id)
const sched = (id) => app.schedules.find(s => s.id === id)
const ajustes = () => app.transactions.filter(t => t.origin === 'resgate_ajuste')
const saldoGer = () => app.accounts.find(a => a.id === 'ger').balance

// O mesmo que a confirmação da importação faz para uma linha ajustada ao valor do banco.
async function ajustarAoBanco(id, para) {
  const antes = { ...tx(id) }
  await act(async () => { app.updateTransaction(id, { amount: para }) })
  await esperar()
  const plano = planoDoAjuste({
    tx: antes, de: antes.amount, para, schedules: app.schedules, scheduleReservaFuncoes: app.scheduleReservaFuncoes,
    hoje: '2026-11-14', transactions: app.transactions, gerencialGroups: app.gerencialGroups,
    card: app.accounts.find(a => a.id === 'card'), gerencialLigado: true,
  })
  await act(async () => {
    const g = plano.gerencial
    if (g && Math.abs(g.etapaPara - g.etapaDe) > 0.005) app.updateTransaction(g.etapa.id, { amount: g.etapaPara })
    if (g?.txAjuste) app.addTransaction(g.txAjuste)
  })
  await esperar()
  return plano
}
const pendenciasGer = (fatura) => executarRegras({
  transactions: app.transactions, accounts: app.accounts, schedules: app.schedules, gerencialGroups: app.gerencialGroups,
  settings: SETTINGS, faturasFechadas: {},
}, { hoje: '2026-11-14' }).filter(d => d.regra.startsWith('GER_') && (!fatura || d.fatura_ref === fatura || d.regra === 'GER_SALDO_SUBCONTA'))
const verificar = (faturas) => {
  const card = app.accounts.find(a => a.id === 'card')
  return contarPendencias(verificarCartao({
    transactions: app.transactions, accounts: app.accounts, schedules: app.schedules, scheduleReservaFuncoes: app.scheduleReservaFuncoes,
    gerencialGroups: app.gerencialGroups, card, faturas, hoje: '2026-11-14', settings: SETTINGS,
  }))
}

describe('hoje (antes da regra): o que o motor faz sozinho quando só o gasto muda', () => {
  it('à vista: a etapa A acompanha; parcela do "Executar Gerenciais": não; a devolução executada fica parada', async () => {
    await abrir(faturaPaga())
    await act(async () => { app.updateTransaction('av', { amount: 51 }); app.updateTransaction('p2', { amount: 101 }) })
    await esperar()
    expect(tx('tx_gerA_av').amount).toBe(51) // applyEnsureGerencial (à vista / parcela 1)
    expect(tx('tx_ger_1_x').amount).toBe(100) // parcela 2..N com etapa A manual: não acompanha
    expect(sched(DEV10).amount).toBe(150)
    expect(sched(DEV10).registered).toEqual(['2026-10-20'])
    expect(tx('tx_dev10').amount).toBe(150)
    expect(ajustes()).toHaveLength(0)
  }, 30000)
})

describe('devolução gerencial JÁ EXECUTADA', () => {
  it('banco cobrou MAIS (100 → 101): etapa A 101, devolução 100 (150), ajuste de R$ 1 saindo da Ger.; saldo da fatura = 0', async () => {
    await abrir(faturaPaga())
    const plano = await ajustarAoBanco('p2', 101)
    expect(plano.gerencial).toMatchObject({ executada: true, etapaDe: 100, etapaPara: 101 })
    expect(tx('tx_ger_1_x').amount).toBe(101)
    expect(sched(DEV10).amount).toBe(150)
    expect(tx('tx_dev10').amount).toBe(150)
    const [aj] = ajustes()
    expect(ajustes()).toHaveLength(1)
    expect(aj).toMatchObject({
      type: 'transfer', accountId: 'ger', toAccountId: 'cc', amount: 1, faturaRef: '10/2026', cardId: 'card',
      sourceScheduleId: DEV10, dataOcorrencia: '2026-10-20', parentTxId: 'p2', date: '2026-11-14',
    })
    expect(aj.description.replace(/\s/g, ' ')).toBe('Ajuste ao valor da fatura do banco — Loja 2/3 (R$ 100,00 → R$ 101,00)')
    // Fatura 10 na Ger.: entradas 101 + 50, saídas 150 + 1 → 0.
    expect(saldoGer()).toBe(0)
    expect(pendenciasGer('10/2026')).toEqual([])
    expect(verificar(['2026-10']).total).toBe(0)
    const card = app.accounts.find(a => a.id === 'card')
    expect(avisoDaFatura({ transactions: app.transactions, accounts: app.accounts, schedules: app.schedules, gerencialGroups: app.gerencialGroups, card, fatura: '2026-10', hoje: '2026-11-14', settings: SETTINGS })?.erro ?? null).toBeNull()
  }, 30000)

  it('banco cobrou MENOS (50 → 49, à vista): etapa A 49, ajuste de R$ 1 entrando na Ger.; saldo = 0', async () => {
    await abrir(faturaPaga())
    const plano = await ajustarAoBanco('av', 49)
    expect(plano.gerencial).toMatchObject({ executada: true, etapaPara: 49 })
    expect(tx('tx_gerA_av').amount).toBe(49)
    expect(tx('tx_dev10').amount).toBe(150)
    expect(ajustes()).toHaveLength(1)
    expect(ajustes()[0]).toMatchObject({ accountId: 'cc', toAccountId: 'ger', amount: 1, faturaRef: '10/2026', parentTxId: 'av' })
    expect(saldoGer()).toBe(0)
    expect(pendenciasGer('10/2026')).toEqual([])
    expect(verificar(['2026-10']).total).toBe(0)
  }, 30000)
})

describe('devolução gerencial AGENDADA', () => {
  it('só o motor recalcula: devolução 101, etapa A 101, sem ajuste', async () => {
    const av = gasto('av11', 100, '2026-11', { date: '2026-11-01', dateCartao: '2026-11-01', description: 'Farmácia' })
    await abrir({
      saldoGer: 100,
      transactions: [av, { id: 'tx_gerA_av11', type: 'transfer', accountId: 'cc', toAccountId: 'ger', amount: 100, date: '2026-11-01', description: 'Reserva Gerencial - Farmácia', grupoGerencial: 'grp_1', cardId: 'card', faturaRef: '11/2026', sourceExpenseId: 'av11', origin: 'etapa_a' }],
      schedules: [devolucao(DEV11, '2026-11', 100, ['av11'], [])],
    })
    const plano = await ajustarAoBanco('av11', 101)
    expect(plano.gerencial).toMatchObject({ executada: false, txAjuste: null })
    expect(ajustes()).toHaveLength(0)
    expect(tx('tx_gerA_av11').amount).toBe(101)
    expect(sched(DEV11).amount).toBe(101)
    expect(saldoGer()).toBe(101)
    expect(pendenciasGer('11/2026')).toEqual([])
  }, 30000)
})
