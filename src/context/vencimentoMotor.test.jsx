// @vitest-environment jsdom
// Vencimento 29/30/31 em fevereiro no motor real (AppProvider): ajustarParcelasGrupoGerencial e
// propagarValorParcelas montam a data com faturaToDate — a mesma que reconcileFaturaState procura.
// A API é simulada: nada aqui fala com banco nem servidor. Dados FICTÍCIOS.
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { render, waitFor, act, cleanup } from '@testing-library/react'

const base = () => ({
  settings: { financialMonthStartDay: 1, financialMonthMode: 'calendar', currency: 'BRL', recurringMatchExceptions: [], categoryGroups: [], faturasFechadas: {} },
  costCenters: [], transactions: [], schedules: [], budgets: [], classificationRules: [], gerencialRules: [], payables: [],
  payees: [], envelopes: [], accountGroups: null, cardImports: [], rateios: [], scheduleReservaFuncoes: [], favorecidoAliases: [],
  profiles: [{ id: 'p1', name: 'Pessoal', ordem: 0 }],
  categories: [{ id: 'cat', name: 'Seguro', type: 'expense' }],
  accounts: [
    { id: 'cc', name: 'Conta', type: 'checking', profileId: 'p1', contaCorrentePrincipal: true, balance: 0, initialBalance: 0, active: true },
    { id: 'c31', name: 'Cartão 31', apelido: 'C31', type: 'credit', profileId: 'p1', closingDay: 20, dueDay: 31, paymentAccountId: 'cc', active: true },
    { id: 'c30', name: 'Cartão 30', apelido: 'C30', type: 'credit', profileId: 'p1', closingDay: 20, dueDay: 30, paymentAccountId: 'cc', active: true },
    { id: 'c20', name: 'Cartão 20', apelido: 'C20', type: 'credit', profileId: 'p1', closingDay: 10, dueDay: 20, paymentAccountId: 'cc', active: true },
    { id: 'ra', name: 'Reserva A', type: 'savings', profileId: 'p1', isReserva: true, reservaType: 'geral', balance: 0, initialBalance: 0, active: true },
    { id: 'rb', name: 'Reserva B', type: 'savings', profileId: 'p1', isReserva: true, reservaType: 'geral', balance: 0, initialBalance: 0, active: true },
  ],
  gerencialGroups: [
    { id: 'g1', number: 1, name: 'Gerencial', alias: 'G', fixed: true },
    { id: 'gD', number: 'D', name: 'Despesa', alias: 'D', fixed: true },
    { id: 'gA', number: 2, name: 'Grupo A', alias: 'A', defaultAccountId: 'ra' },
    { id: 'gB', number: 3, name: 'Grupo B', alias: 'B', defaultAccountId: 'rb' },
  ],
  reserveFunctions: [],
})
let dados = base()

vi.mock('../lib/db', async (orig) => ({
  ...(await orig()),
  loadFromDb: vi.fn(async () => ({ status: 'connected', assinatura: null, recursos: null, data: dados })),
}))

const { AppProvider, useApp } = await import('./AppContext')

let app
function Espiao() { app = useApp(); return null }

beforeAll(() => {
  globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
  localStorage.setItem('auth_token', 'x.' + btoa(JSON.stringify({ nivel: 'admin', sub: 't', exp: 4102444800 })) + '.y')
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
})
afterEach(() => { cleanup(); vi.useRealTimers(); dados = base() })

// Hoje = 07/11/2026: as faturas de fevereiro de 2027/2028 são de ciclo futuro.
async function montar({ transactions = [], schedules = [] }) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 7, 12, 0, 0))
  dados = { ...base(), transactions, schedules }
  render(<AppProvider><Espiao /></AppProvider>)
  await waitFor(() => expect(app.accounts.some(a => a.id === 'c31')).toBe(true), { timeout: 15000 })
}

const parcela = (id, num, cardId, fatura, grupo, amount = 100) => ({
  id, description: `Seguro ${num}/3`, type: 'expense', accountId: cardId, accountType: 'credit', amount,
  date: `${fatura}-05`, faturaMonthYear: fatura, grupoGerencial: grupo, categoryId: 'cat', origin: 'manual',
})
const agGerNum = (id, grupo, conta, cardId, data, txId, amount = 100) => ({
  id, description: `Resgate - Fatura ${data.slice(5, 7)}/${data.slice(0, 4)}`, transactionType: 'transfer',
  accountId: conta, toAccountId: 'cc', frequency: 'once', occurrenceType: 'installment', installments: 1,
  autoRegister: false, startDate: data, amount, registered: [], skipped: [],
  overrides: { _gerencialKey: `ger_num_${grupo}_${cardId}_${data}`, _originTxId: txId, _originAmount: amount },
})
const gerNum = () => app.schedules.filter(s => String(s.overrides?._gerencialKey || '').startsWith('ger_num_'))
// Pendentes de resgate de uma fatura (tipo novo ou ger_num_ legado), por conta de origem.
const resgatesPendentes = (cardId, fatura) => app.schedules.filter(s =>
  !(s.registered || []).length && (
    (s.tipo === 'resgate_reserva' && s.cardId === cardId && s.faturaMesAno === fatura) ||
    (String(s.overrides?._gerencialKey || '').startsWith(`ger_num_`) && s.overrides._gerencialKey.includes(`_${cardId}_`) && s.startDate.slice(0, 7) === fatura)
  ))
const semDuplicado = (lista) => {
  const porOrigem = new Map()
  for (const s of lista) porOrigem.set(s.accountId, (porOrigem.get(s.accountId) || 0) + 1)
  return [...porOrigem.values()].every(n => n === 1)
}

describe.each([
  ['vencimento 31, fevereiro comum', 'c31', '2027-02', '2027-02-28'],
  ['vencimento 31, fevereiro bissexto', 'c31', '2028-02', '2028-02-29'],
  ['vencimento 30, fevereiro comum', 'c30', '2027-02', '2027-02-28'],
  ['vencimento 30, fevereiro bissexto', 'c30', '2028-02', '2028-02-29'],
])('%s', (_, cardId, fatura, esperado) => {
  it(`trocar o grupo grava ${esperado}; a reconciliação reconhece o agendamento e nada duplica`, async () => {
    await montar({
      transactions: [parcela('t2', 2, cardId, fatura, 'gA')],
      schedules: [agGerNum('s_old', 'gA', 'ra', cardId, esperado, 't2')],
    })
    await act(async () => { app.ajustarParcelasGrupoGerencial('t2', { prevGrupoId: 'gA', newGrupoId: 'gB', amount: 100, accountId: cardId }) })
    await waitFor(() => expect(gerNum().map(s => s.overrides._gerencialKey)).toEqual([`ger_num_gB_${cardId}_${esperado}`]))
    expect(gerNum()[0].startDate).toBe(esperado)

    const [y, m] = fatura.split('-')
    await act(async () => { app.recalcularAgendamentosFatura(cardId, y, m) })
    // Reconhecido como resgate gerido (mesma data que a reconciliação procura): o pendente do grupo
    // antigo sai e fica, no máximo, um resgate por conta de origem — nada duplicado.
    await waitFor(() => expect(gerNum()).toHaveLength(0))
    expect(semDuplicado(resgatesPendentes(cardId, fatura))).toBe(true)
  }, 30000)

  it(`propagar o valor acha o agendamento de ${esperado} e ajusta o valor`, async () => {
    await montar({
      transactions: [parcela('t1', 1, cardId, '2027-01', 'gA'), parcela('t2', 2, cardId, fatura, 'gA')],
      schedules: [agGerNum('s_a', 'gA', 'ra', cardId, esperado, 't2')],
    })
    await act(async () => { app.propagarValorParcelas('t1', 150) })
    await waitFor(() => expect(app.transactions.find(t => t.id === 't2').amount).toBe(150))
    expect(app.schedules.find(s => s.id === 's_a').amount).toBe(150)
  }, 30000)
})

describe('controle: o legado com data impossível é o que a reconciliação não reconhecia', () => {
  it('ger_num_ gravado como 2027-02-31 sobra ao lado da reconciliação (por isso a correção)', async () => {
    await montar({
      transactions: [parcela('t2', 2, 'c31', '2027-02', 'gB')],
      schedules: [agGerNum('s_31', 'gB', 'rb', 'c31', '2027-02-31', 't2')],
    })
    await act(async () => { app.recalcularAgendamentosFatura('c31', '2027', '02') })
    await waitFor(() => expect(gerNum().map(s => s.id)).toEqual(['s_31']))
  }, 30000)
})

describe('vencimento até o dia 28: igual ao de antes', () => {
  const cenario = () => montar({
    transactions: [parcela('t1', 1, 'c20', '2027-01', 'gA'), parcela('t2', 2, 'c20', '2027-02', 'gA')],
    schedules: [agGerNum('s_a', 'gA', 'ra', 'c20', '2027-02-20', 't2')],
  })
  it('trocar o grupo grava 2027-02-20, como a concatenação antiga', async () => {
    await cenario()
    await act(async () => { app.ajustarParcelasGrupoGerencial('t2', { prevGrupoId: 'gA', newGrupoId: 'gB', amount: 100, accountId: 'c20' }) })
    await waitFor(() => expect(gerNum().map(s => [s.overrides._gerencialKey, s.startDate])).toEqual([['ger_num_gB_c20_2027-02-20', '2027-02-20']]))
  }, 30000)
  it('propagar acha o agendamento de 2027-02-20', async () => {
    await cenario()
    await act(async () => { app.propagarValorParcelas('t1', 120) })
    await waitFor(() => expect(app.schedules.find(s => s.id === 's_a').amount).toBe(120))
  }, 30000)
})
