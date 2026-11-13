// @vitest-environment jsdom
// Resgate ligado na LISTA de Agendamentos (tela real + AppProvider real, API simulada). Na linha do
// resgate: Pagar, Vincular a um resgate já feito e Excluir (esta ocorrência ou o resgate inteiro);
// Pular/Estornar ficam na despesa; selo "Acompanha" abre a despesa; Editar abre o painel do resgate
// (mudar a data de uma ocorrência). A despesa continua mandando. Pagar a despesa efetiva o resgate
// UMA vez. No mesmo dia, o resgate vem antes da despesa. Dados fictícios.
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, within, act } from '@testing-library/react'
import { novoResgateVinculado } from '../lib/resgateVinculado'
import { opcoesAplicarData } from '../lib/fluxoCaixaDatas'
import { computeOccurrences } from '../lib/occurrences'
import { occEfetiva } from '../lib/fluxoCaixa'

const hoje = new Date()
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const inicio = iso(new Date(hoje.getFullYear(), hoje.getMonth(), Math.min(hoje.getDate(), 28)))
let extras = []

const base = () => {
  const accounts = [
    { id: 'cc', name: 'Conta Corrente', type: 'checking', profileId: 'p1', contaCorrentePrincipal: true, balance: 10000, initialBalance: 10000, active: true },
    { id: 'res', name: 'Contas Anuais', type: 'savings', profileId: 'p1', isReserva: true, reservaType: 'geral', balance: 50000, initialBalance: 50000, active: true },
  ]
  const gerencialGroups = [
    { id: 'grp_1', number: 1, name: 'Gerencial', alias: 'G', fixed: true },
    { id: 'grp_D', number: 'D', name: 'Despesa', alias: 'D', fixed: true },
    { id: 'grp_ca', number: 2, name: 'Contas Anuais', alias: 'CA', defaultAccountId: 'res' },
  ]
  const reserveFunctions = [{ id: 'fn_esc', name: 'Escola', accountId: 'res', ordem: 0 }, { id: 'fn_ipva', name: 'IPVA', accountId: 'res', ordem: 1 }]
  const despesa = {
    id: 'sch_esc', description: 'ESCOLA EXEMPLO', transactionType: 'expense', accountId: 'cc', accountType: 'checking', amount: 1268,
    frequency: 'monthly', startDate: inicio, occurrenceType: 'installment', installments: 3, grupoGerencial: 'grp_ca', reservaFuncaoId: 'fn_esc',
    registered: [], registeredMeta: {}, skipped: [], overrides: {}, categoryId: 'cat_esc', autoRegister: false, tipoDocumentoId: null, payee: '',
  }
  const resgate = novoResgateVinculado(despesa, { accounts, gerencialGroups, reserveFunctions })
  return {
    settings: { financialMonthStartDay: 1, financialMonthMode: 'custom', currency: 'BRL', recurringMatchExceptions: [], categoryGroups: [], faturasFechadas: {} },
    costCenters: [], transactions: [...extras], budgets: [], classificationRules: [], gerencialRules: [], payables: [],
    payees: [], envelopes: [], accountGroups: null, cardImports: [], rateios: [], scheduleReservaFuncoes: [], favorecidoAliases: [],
    profiles: [{ id: 'p1', name: 'Pessoal', ordem: 0 }],
    categories: [{ id: 'cat_esc', name: 'Escola', type: 'expense', icon: '🎒' }],
    accounts, gerencialGroups, reserveFunctions, schedules: [despesa, resgate],
  }
}

vi.mock('../lib/db', async (orig) => ({
  ...(await orig()),
  loadFromDb: vi.fn(async () => ({ status: 'connected', assinatura: null, recursos: null, data: base() })),
}))
vi.mock('./atalhosHooks', async (orig) => ({ ...(await orig()), useAtalho: () => {}, useTituloAtalho: (t) => t, useAtalhoTitulo: (t) => t }))
vi.mock('../components/shared/ShortcutHint', () => ({ default: () => null }))

const { AppProvider, useApp } = await import('./AppContext')
const { default: SchedulePanel } = await import('../components/Schedule/SchedulePanel')

let app
function Espiao() { app = useApp(); return null }

beforeAll(() => {
  globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
  localStorage.setItem('auth_token', 'x.' + btoa(JSON.stringify({ nivel: 'admin', sub: 't', exp: 4102444800 })) + '.y')
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || function () {}
})
afterEach(() => { cleanup(); extras = [] })

async function montar() {
  render(<AppProvider><Espiao /><SchedulePanel /></AppProvider>)
  await waitFor(() => expect(app.schedules.length).toBe(2), { timeout: 15000 })
  await screen.findAllByText(/ESCOLA EXEMPLO/, {}, { timeout: 15000 })
}
const resgate = () => app.schedules.find(s => s.agendamentoVinculadoId === 'sch_esc')
const linhaDoResgate = () => screen.getByTestId('selo-acompanha').closest('tr')
const linhaDaDespesa = () => screen.getAllByText('ESCOLA EXEMPLO').map(el => el.closest('tr')).find(tr => tr && !within(tr).queryByTestId('selo-acompanha'))
const saldo = (id) => app.accounts.find(a => a.id === id).balance

describe('linha do resgate ligado', () => {
  it('Pagar, Vincular e Excluir; sem Pular/Estornar; selo "Acompanha" abre a despesa; vem antes da despesa', async () => {
    await montar()
    const r = linhaDoResgate()
    expect(within(r).getByTestId('selo-acompanha').textContent).toMatch('Acompanha: ESCOLA EXEMPLO')
    for (const nome of ['Pagar', 'Vincular', 'Excluir']) expect(within(r).getByRole('button', { name: nome })).toBeTruthy()
    for (const nome of ['Pular', 'Estornar']) expect(within(r).queryByRole('button', { name: nome })).toBeNull()
    const d = linhaDaDespesa()
    for (const nome of ['Pagar', 'Pular', 'Estornar', 'Excluir']) expect(within(d).getByRole('button', { name: nome })).toBeTruthy()
    // Mesmo dia: o resgate antes da despesa.
    expect(r.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(within(r).getByTestId('selo-acompanha'))
    expect(await screen.findByText('Editar Agendamento')).toBeTruthy()
    expect(screen.getByDisplayValue('ESCOLA EXEMPLO')).toBeTruthy()
    expect(screen.queryByTestId('painel-resgate-ligado')).toBeNull()
  }, 40000)

  it('Excluir só esta ocorrência do resgate: a despesa não muda e mudar a despesa não a traz de volta', async () => {
    await montar()
    const primeira = computeOccurrences(resgate(), 1)[0]
    fireEvent.click(within(linhaDoResgate()).getByRole('button', { name: 'Excluir' }))
    fireEvent.click(await screen.findByRole('button', { name: /Só esta ocorrência/ }))
    await waitFor(() => expect(computeOccurrences(resgate(), 10)).not.toContain(primeira))
    expect(computeOccurrences(app.schedules.find(s => s.id === 'sch_esc'), 10)).toContain(primeira)
    act(() => app.updateSchedule('sch_esc', { amount: 1300 }))
    await waitFor(() => expect(resgate().amount).toBe(1300))
    expect(computeOccurrences(resgate(), 10)).not.toContain(primeira)
  }, 40000)

  it('Excluir o resgate inteiro: some e não volta ao mudar a despesa', async () => {
    await montar()
    fireEvent.click(within(linhaDoResgate()).getByRole('button', { name: 'Excluir' }))
    fireEvent.click(await screen.findByRole('button', { name: 'O resgate inteiro' }))
    await waitFor(() => expect(resgate()).toBeUndefined())
    act(() => app.updateSchedule('sch_esc', { amount: 1300 }))
    act(() => app.garantirResgateVinculado('sch_esc'))
    await new Promise(r => setTimeout(r, 50))
    expect(resgate()).toBeUndefined()
  }, 40000)

  it('Vincular a um resgate já feito e pagar a despesa: sem resgate em dobro; saldos da reserva e da conta certos', async () => {
    extras = [{ id: 'tx_feito', type: 'transfer', accountId: 'res', toAccountId: 'cc', amount: 1268, date: inicio, description: 'Resgate feito à mão', createdAt: '2020-01-01T00:00:00.000Z' }]
    await montar()
    fireEvent.click(within(linhaDoResgate()).getByRole('button', { name: 'Vincular' }))
    const lista = await screen.findByTestId('vincular-resgate-lista')
    fireEvent.click(within(lista).getByRole('button', { name: 'Vincular' }))
    await waitFor(() => expect(resgate().registered).toHaveLength(1))
    const res0 = saldo('res')
    const cc0 = saldo('cc')
    fireEvent.click(within(linhaDaDespesa()).getByRole('button', { name: 'Pagar' }))
    fireEvent.click(await screen.findByRole('button', { name: /Confirmar Pagamento/ }))
    await waitFor(() => expect(app.transactions.some(t => t.type === 'expense' && t.scheduleId === 'sch_esc')).toBe(true))
    await new Promise(r => setTimeout(r, 50))
    expect(app.transactions.filter(t => t.type === 'transfer').map(t => t.id)).toEqual(['tx_feito'])
    expect(saldo('res')).toBe(res0)
    expect(saldo('cc')).toBe(cc0 - 1268)
  }, 40000)

  it('Editar abre o painel do resgate: mudar a data de uma ocorrência; depois a da despesa manda', async () => {
    await montar()
    fireEvent.click(within(linhaDoResgate()).getByRole('button', { name: 'Editar' }))
    expect(await screen.findByTestId('painel-resgate-ligado')).toBeTruthy()
    const chave = computeOccurrences(resgate(), 1)[0]
    const nova = iso(new Date(Date.parse(`${chave}T12:00:00`) - 2 * 86400000))
    fireEvent.change(screen.getByLabelText('Data desta ocorrência'), { target: { value: nova } })
    fireEvent.click(screen.getByRole('button', { name: /Salvar data/ }))
    await waitFor(() => expect(occEfetiva(resgate(), chave).date).toBe(nova))
    const daDespesa = iso(new Date(Date.parse(`${chave}T12:00:00`) + 3 * 86400000))
    act(() => app.updateSchedule('sch_esc', { overrides: { [chave]: { date: daDespesa } } }))
    await waitFor(() => expect(occEfetiva(resgate(), chave).date).toBe(daDespesa))
  }, 40000)

  it('Pagar a despesa efetiva o resgate ligado UMA vez (sem o "Resgate <grupo>" avulso), antes da despesa', async () => {
    await montar()
    fireEvent.click(within(linhaDaDespesa()).getByRole('button', { name: 'Pagar' }))
    fireEvent.click(await screen.findByRole('button', { name: /Confirmar Pagamento/ }))
    await waitFor(() => expect(resgate().registered).toHaveLength(1))
    const transfers = app.transactions.filter(t => t.type === 'transfer')
    expect(transfers).toHaveLength(1)
    expect(transfers[0]).toMatchObject({ accountId: 'res', toAccountId: 'cc', amount: 1268, reservaFuncaoId: 'fn_esc' })
    const desp = app.transactions.find(t => t.type === 'expense' && t.scheduleId === 'sch_esc')
    expect(transfers[0].createdAt < desp.createdAt).toBe(true)
    expect(app.transactions.indexOf(transfers[0])).toBeLessThan(app.transactions.indexOf(desp))
  }, 40000)
})

describe('Fluxo de Caixa: mudar data do resgate ligado', () => {
  it('só esta ocorrência pode; a série segue a despesa', () => {
    const r = base().schedules[1]
    const op = opcoesAplicarData(r, inicio, '2099-01-01', inicio)
    expect(op.bloqueio).toBeUndefined()
    expect(op.serie.ok).toBe(false)
    expect(op.serie.motivo).toMatch('mude a despesa')
  })
})
