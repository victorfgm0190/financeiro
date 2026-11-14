// @vitest-environment jsdom
// VALE O VALOR DA FATURA DO BANCO — o que acompanha o ajuste de UMA parcela, com o AppProvider e o
// motor REAIS (reconcileFaturaState / recalcularAgendamentosFatura). A API é simulada. Dados FICTÍCIOS:
// seguro em 5x de R$ 74,30 no cartão, grupo Contas Anuais (CA), resgate da função "Seguro".
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { render, waitFor, act, cleanup } from '@testing-library/react'

const base = () => ({
  settings: { financialMonthStartDay: 1, financialMonthMode: 'custom', currency: 'BRL', recurringMatchExceptions: [], categoryGroups: [], faturasFechadas: {} },
  costCenters: [], schedules: [], budgets: [], classificationRules: [], gerencialRules: [], payables: [],
  payees: [], envelopes: [], accountGroups: null, cardImports: [], rateios: [], scheduleReservaFuncoes: [], favorecidoAliases: [],
  profiles: [{ id: 'p1', name: 'Pessoal', ordem: 0 }],
  categories: [{ id: 'cat_seg', name: 'Seguro', type: 'expense', icon: '🛡' }],
  accounts: [
    { id: 'cc', name: 'Conta', type: 'checking', profileId: 'p1', contaCorrentePrincipal: true, balance: 0, initialBalance: 0, active: true },
    { id: 'card', name: 'Cartão', apelido: 'Card', type: 'credit', profileId: 'p1', closingDay: 14, dueDay: 20, paymentAccountId: 'cc', active: true },
    { id: 'res', name: 'Reserva CA', type: 'savings', profileId: 'p1', isReserva: true, reservaType: 'geral', balance: 1000, initialBalance: 1000, active: true },
  ],
  gerencialGroups: [
    { id: 'grp_1', number: 1, name: 'Gerencial', alias: 'G', fixed: true },
    { id: 'grp_D', number: 'D', name: 'Despesa', alias: 'D', fixed: true },
    { id: 'grp_ca', number: 2, name: 'Contas Anuais', alias: 'CA', defaultAccountId: 'res' },
  ],
  reserveFunctions: [{ id: 'fn_seg', name: 'Seguro', accountId: 'res', ordem: 0 }],
  // Parcelas 3/5 (fatura 2027-03) e 4/5 (2027-04), previstas em R$ 74,30.
  transactions: [3, 4].map(n => ({
    id: `parc${n}`, type: 'expense', accountId: 'card', accountType: 'credit', amount: 74.3, date: `2027-0${n - 1}-20`,
    faturaMonthYear: `2027-0${n}`, faturaRef: `0${n}/2027`, description: `Seguro Parc${n}`, installmentNum: n, installmentTotal: 5,
    serieId: 'serie_seg', grupoGerencial: 'grp_ca', reservaFuncaoId: 'fn_seg', categoryId: 'cat_seg', origin: 'importacao_fatura',
  })),
})
let dados = base()

vi.mock('../lib/db', async (orig) => ({
  ...(await orig()),
  loadFromDb: vi.fn(async () => ({ status: 'connected', assinatura: null, recursos: null, data: dados })),
}))

const { AppProvider, useApp } = await import('./AppContext')
const { planoDoAjuste } = await import('../lib/ajusteValorBanco')
const { reserveMovOf } = await import('../lib/saldoReserva')

let app
function Espiao() { app = useApp(); return null }

beforeAll(() => {
  globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
  localStorage.setItem('auth_token', 'x.' + btoa(JSON.stringify({ nivel: 'admin', sub: 't', exp: 4102444800 })) + '.y')
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
})
afterEach(() => { cleanup(); dados = base() })

async function montar() {
  render(<AppProvider><Espiao /></AppProvider>)
  await waitFor(() => expect(app.accounts.some(a => a.id === 'card')).toBe(true), { timeout: 15000 })
  await act(async () => { app.recalcularAgendamentosFatura('card', '2027', '03'); app.recalcularAgendamentosFatura('card', '2027', '04') })
}
const resgateDa = (fatura) => app.schedules.find(s => s.tipo === 'resgate_reserva' && s.faturaMesAno === fatura)
const linhaDe = (txId) => app.scheduleReservaFuncoes.find(l => l.sourceLancamentoId === txId)

describe('ajuste ao valor do banco: o resgate da mesma ocorrência acompanha', () => {
  it('resgate agendado: parcela e resgate do mês vão para R$ 74,29; o resto fica igual', async () => {
    await montar()
    expect(Number(resgateDa('2027-04').amount)).toBe(74.3)
    const plano = planoDoAjuste({ tx: app.transactions.find(t => t.id === 'parc4'), de: 74.3, para: 74.29, schedules: app.schedules, scheduleReservaFuncoes: app.scheduleReservaFuncoes })
    expect(plano.resgate).toMatchObject({ executado: false, funcaoId: 'fn_seg', de: 74.3, para: 74.29, txAjuste: null })
    // O que a importação faz: grava o valor do banco e recalcula a fatura pelo motor existente.
    await act(async () => { app.updateTransaction('parc4', { amount: 74.29 }); app.recalcularAgendamentosFatura('card', '2027', '04') })
    await waitFor(() => expect(Number(resgateDa('2027-04').amount)).toBe(74.29))
    expect(Number(linhaDe('parc4').valor)).toBe(74.29)
    // Outra parcela e outro resgate: sem mudança.
    expect(app.transactions.find(t => t.id === 'parc3').amount).toBe(74.3)
    expect(Number(resgateDa('2027-03').amount)).toBe(74.3)
  }, 30000)

  it('resgate já executado: a diferença volta para a função (devolução) e o saldo dela fica coerente', async () => {
    await montar()
    const r = resgateDa('2027-04')
    // Executado: a ocorrência registrada (o lançamento do resgate sai da reserva com R$ 74,30).
    const executado = { ...r, registered: [r.startDate] }
    const plano = planoDoAjuste({
      tx: app.transactions.find(t => t.id === 'parc4'), de: 74.3, para: 74.29,
      schedules: app.schedules.map(s => (s.id === r.id ? executado : s)), scheduleReservaFuncoes: app.scheduleReservaFuncoes, hoje: '2027-04-21',
    })
    const aj = plano.resgate.txAjuste
    expect(aj).toMatchObject({ type: 'transfer', accountId: r.toAccountId, toAccountId: 'res', amount: 0.01, reservaFuncaoId: 'fn_seg', sourceScheduleId: r.id, origin: 'resgate_ajuste' })
    // Saldo da função: resgate 74,30 saindo + devolução 0,01 entrando = 74,29 líquido (o valor do banco).
    const resgateTx = { type: 'transfer', accountId: 'res', toAccountId: r.toAccountId, amount: 74.3, reservaFuncaoId: 'fn_seg' }
    const liquido = [resgateTx, aj].reduce((s, t) => { const m = reserveMovOf(t, 'res'); return s + m.entrada - m.saida }, 0)
    expect(Math.round(liquido * 100) / 100).toBe(-74.29)
  }, 30000)

  it('controle gerencial desligado: o ajuste do lançamento funciona sem quebrar', async () => {
    dados = { ...base(), settings: { ...base().settings, controleGerencial: false } }
    await montar()
    await act(async () => { app.updateTransaction('parc4', { amount: 74.29 }); app.recalcularAgendamentosFatura('card', '2027', '04') })
    await waitFor(() => expect(app.transactions.find(t => t.id === 'parc4').amount).toBe(74.29))
    expect(app.transactions.find(t => t.id === 'parc3').amount).toBe(74.3)
  }, 30000)
})
