// @vitest-environment jsdom
// Resgate agendado junto com a despesa de conta com classificação gerencial que gera resgate: o
// modal real (ScheduleForm) grava no AppProvider real; pagar, pular, estornar e excluir pelas
// funções reais do contexto. API simulada: nada aqui fala com banco nem servidor. Dados fictícios.
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, cleanup, within } from '@testing-library/react'

const dados = () => ({
  settings: { financialMonthStartDay: 1, financialMonthMode: 'custom', currency: 'BRL', recurringMatchExceptions: [], categoryGroups: [], faturasFechadas: {} },
  costCenters: [], transactions: [], budgets: [], classificationRules: [], gerencialRules: [], payables: [],
  payees: [], envelopes: [], accountGroups: null, cardImports: [], rateios: [], scheduleReservaFuncoes: [], favorecidoAliases: [],
  profiles: [{ id: 'p1', name: 'Pessoal', ordem: 0 }],
  categories: [{ id: 'cat_esc', name: 'Escola', type: 'expense', icon: '🎒' }],
  accounts: [
    { id: 'cc', name: 'Conta Corrente', type: 'checking', profileId: 'p1', contaCorrentePrincipal: true, balance: 10000, initialBalance: 10000, active: true },
    { id: 'res', name: 'Contas Anuais', type: 'savings', profileId: 'p1', isReserva: true, reservaType: 'geral', balance: 50000, initialBalance: 50000, active: true },
    { id: 'imp', name: 'Imperium', type: 'savings', profileId: 'p1', balance: 1000, initialBalance: 1000, active: true },
    { id: 'card', name: 'Cartão', type: 'credit', profileId: 'p1', closingDay: 14, dueDay: 20, paymentAccountId: 'cc', active: true },
  ],
  gerencialGroups: [
    { id: 'grp_1', number: 1, name: 'Gerencial', alias: 'G', fixed: true },
    { id: 'grp_D', number: 'D', name: 'Despesa', alias: 'D', fixed: true },
    { id: 'grp_ca', number: 2, name: 'Contas Anuais', alias: 'CA', defaultAccountId: 'res' },
    { id: 'grp_imp', number: 4, name: 'Imperium', alias: 'Impr', defaultAccountId: 'imp' },
  ],
  reserveFunctions: [
    { id: 'fn_esc', name: 'Escola', accountId: 'res', ordem: 0 },
    { id: 'fn_ipva', name: 'IPVA', accountId: 'res', ordem: 1 },
  ],
  schedules: [
    // Provisão aberta da função Escola em jan/2027 (para o aviso).
    { id: 'prov_mat', description: 'MATERIAL ESCOLAR', transactionType: 'expense', accountId: 'cc', amount: 1300, frequency: 'annual',
      startDate: '2027-01-26', occurrenceType: 'continuous', installments: 0, isProvisao: true, provisaoEfetivada: false,
      reservaFuncaoId: 'fn_esc', grupoGerencial: null, registered: [], skipped: [], overrides: {}, categoryId: 'cat_esc' },
    // Agendamento ANTIGO de conta com CA, 2 ocorrências já pagas, sem resgate ligado.
    { id: 'sch_antigo', description: 'CURSO ANTIGO', transactionType: 'expense', accountId: 'cc', accountType: 'checking', amount: 500,
      frequency: 'monthly', startDate: '2026-09-05', occurrenceType: 'installment', installments: 6, grupoGerencial: 'grp_ca',
      reservaFuncaoId: null, registered: ['2026-09-05', '2026-10-05'], registeredMeta: {}, skipped: [], overrides: {}, categoryId: 'cat_esc',
      tipoDocumentoId: 'doc', autoRegister: false, nextOccurrence: '2026-11-05' },
  ],
})

vi.mock('../lib/db', async (orig) => ({
  ...(await orig()),
  loadFromDb: vi.fn(async () => ({ status: 'connected', assinatura: null, recursos: null, data: dados() })),
}))

const { AppProvider, useApp } = await import('./AppContext')
const { default: ScheduleForm } = await import('../components/Schedule/ScheduleForm')
const { computeOccurrences } = await import('../lib/occurrences')

let app
function Espiao() { app = useApp(); return null }

beforeAll(() => {
  globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
  localStorage.setItem('auth_token', 'x.' + btoa(JSON.stringify({ nivel: 'admin', sub: 't', exp: 4102444800 })) + '.y')
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
})
afterEach(() => cleanup())

const escola = {
  description: 'ESCOLA EXEMPLO 2027', transactionType: 'expense', accountId: 'cc', amount: 1268, frequency: 'monthly',
  startDate: '2027-01-08', occurrenceType: 'installment', installments: 12, categoryId: 'cat_esc', autoRegister: false,
  grupoGerencial: 'grp_ca', reservaFuncaoId: '', tipoDocumentoId: 'doc',
}

async function montar(init = escola) {
  let fechou = false
  const arvore = (ini, key) => <AppProvider><Espiao /><ScheduleForm key={key} initial={ini} onClose={() => { fechou = true }} /></AppProvider>
  const r = render(arvore(init, 'a'))
  await waitFor(() => expect(app.accounts.some(a => a.id === 'res')).toBe(true), { timeout: 15000 })
  // Abre outro agendamento no MESMO AppProvider (o estado criado continua).
  return { fechou: () => fechou, abrir: (ini) => r.rerender(arvore(ini, 'b')) }
}
const despesa = () => app.schedules.find(s => s.description === 'ESCOLA EXEMPLO 2027' && !s.agendamentoVinculadoId)
const resgateDe = (id) => app.schedules.find(s => s.agendamentoVinculadoId === id)
const saldo = (id) => app.accounts.find(a => a.id === id).balance

async function criarEscola(funcao = 'fn_esc', m0 = null) {
  const m = m0 || await montar()
  fireEvent.change(await screen.findByTestId('agendamento-resgatar-de'), { target: { value: funcao } })
  fireEvent.click(screen.getByRole('button', { name: 'Criar Agendamento' }))
  await waitFor(() => expect(m.fechou()).toBe(true))
  await waitFor(() => expect(resgateDe(despesa().id)).toBeTruthy())
  return despesa()
}

describe('formulário: "Resgatar de"', () => {
  it('Contas Anuais com várias funções: campo obrigatório e a frase nova', async () => {
    await montar()
    const sel = await screen.findByTestId('agendamento-resgatar-de')
    expect([...sel.options].map(o => o.textContent)).toEqual(['Escolha a função…', 'Contas Anuais › Escola', 'Contas Anuais › IPVA', '+ Nova função'])
    expect(screen.queryByText(/resgatará automaticamente/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Criar Agendamento' }))
    expect((await screen.findByTestId('erro-salvar-agendamento')).textContent).toMatch('Resgatar de')
    fireEvent.change(sel, { target: { value: 'fn_esc' } })
    expect(screen.getByTestId('agendamento-frase-resgate').textContent)
      .toMatch(/^Ao salvar, o Finup agenda também 12 resgates de R\$\s*1\.268,00 de Contas Anuais › Escola para Conta Corrente, nas mesmas datas\.$/)
  }, 30000)

  it('provisão aberta da mesma função no mesmo mês: aviso com "abrir provisão"', async () => {
    await montar()
    fireEvent.change(await screen.findByTestId('agendamento-resgatar-de'), { target: { value: 'fn_esc' } })
    const aviso = await screen.findByTestId('aviso-provisao-mesma-funcao')
    expect(aviso.textContent).toMatch(/provisão "MATERIAL ESCOLAR" \(R\$\s*1\.300,00\) desta função em jan\/2027/)
    fireEvent.click(within(aviso).getByRole('button', { name: 'abrir provisão' }))
    expect(await screen.findByText('Editar Provisão de Despesa')).toBeTruthy()
    fireEvent.change(screen.getByTestId('agendamento-resgatar-de'), { target: { value: 'fn_ipva' } })
    expect(screen.queryByTestId('aviso-provisao-mesma-funcao')).toBeNull()
  }, 30000)

  it('"+ Nova função" cria a função na conta do grupo e já a seleciona', async () => {
    await montar()
    fireEvent.change(await screen.findByTestId('agendamento-resgatar-de'), { target: { value: '__nova__' } })
    expect(await screen.findByText('Nova Função de Reserva')).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText('Digite o nome da função'), { target: { value: 'Escola Nova' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }))
    await waitFor(() => expect(app.reserveFunctions.some(f => f.name === 'Escola Nova' && f.accountId === 'res')).toBe(true))
    const nova = app.reserveFunctions.find(f => f.name === 'Escola Nova')
    await waitFor(() => expect(screen.getByTestId('agendamento-resgatar-de').value).toBe(nova.id))
    expect(screen.getByTestId('agendamento-frase-resgate').textContent).toMatch('Contas Anuais › Escola Nova')
  }, 30000)

  it('grupo sem funções (Imperium): vem preenchido com a conta', async () => {
    await montar({ ...escola, grupoGerencial: 'grp_imp' })
    expect(await screen.findByText(/Resgatar de:/)).toBeTruthy()
    expect(screen.queryByTestId('agendamento-resgatar-de')).toBeNull()
    expect(screen.getByTestId('agendamento-frase-resgate').textContent).toMatch(/12 resgates de R\$\s*1\.268,00 de Imperium para Conta Corrente/)
  }, 30000)

  it('celular 380 px e temas claro/escuro: só cores do tema, sem largura fixa nem texto que não quebra', async () => {
    await montar()
    fireEvent.change(await screen.findByTestId('agendamento-resgatar-de'), { target: { value: 'fn_esc' } })
    const bloco = document.querySelector('[data-help-id="agendamento.resgatarDe"]')
    // O ícone de ajuda (HelpCampo, igual em todos os campos) fica fora: é só o "?" ao lado do rótulo.
    const classes = [bloco, ...bloco.querySelectorAll('*')].filter(el => !el.closest('.help-campo-alvo'))
      .map(el => el.getAttribute('class') || '').join(' ')
    expect(classes).not.toMatch(/\b(min-)?w-\[|\bwhitespace-nowrap\b|#[0-9a-fA-F]{3,6}\b|\b(text|bg|border)-(red|green|blue|gray|slate|zinc|white|black)\b/)
    expect(classes).toMatch(/\btext-reserva\b/)
    expect(classes).toMatch(/\btext-aviso\b/)
    expect(screen.getByTestId('agendamento-resgatar-de').className).toMatch(/\binput\b/)
  }, 30000)

  it('cartão: sem "Resgatar de" (o resgate é no vencimento da fatura)', async () => {
    await montar({ ...escola, accountId: 'card' })
    expect(await screen.findByText(/No vencimento de cada fatura, o Finup agenda o resgate de "Contas Anuais"/)).toBeTruthy()
    expect(screen.queryByTestId('agendamento-resgatar-de')).toBeNull()
  }, 30000)
})

describe('criar e andar junto (contexto real)', () => {
  it('cria 12 resgates com a mesma data e valor; pagar efetiva o resgate; estornar desfaz', async () => {
    const d = await criarEscola()
    const r = resgateDe(d.id)
    expect(r).toMatchObject({ tipo: 'resgate_reserva', accountId: 'res', toAccountId: 'cc', amount: 1268, reservaFuncaoId: 'fn_esc' })
    expect(computeOccurrences(r, 400)).toEqual(computeOccurrences(d, 400))
    expect(computeOccurrences(r, 400)).toHaveLength(12)
    const res0 = saldo('res')

    let txId
    act(() => { txId = app.registerScheduleOccurrence(d.id, '2027-01-10', '2027-01-08', 1300) })
    await waitFor(() => expect(resgateDe(d.id).registered).toEqual(['2027-01-08']))
    const tr = app.transactions.find(t => t.type === 'transfer' && t.scheduleId === r.id)
    expect(tr).toMatchObject({ accountId: 'res', toAccountId: 'cc', amount: 1300, date: '2027-01-10', reservaFuncaoId: 'fn_esc' })
    expect(saldo('res')).toBe(res0 - 1300)

    act(() => app.reverseTransaction(txId))
    await waitFor(() => expect(resgateDe(d.id).registered).toEqual([]))
    expect(app.transactions.some(t => t.scheduleId === r.id)).toBe(false)
    expect(saldo('res')).toBe(res0)
    expect(computeOccurrences(resgateDe(d.id), 400)).toHaveLength(12)
  }, 30000)

  it('pular e excluir a despesa', async () => {
    const d = await criarEscola()
    act(() => app.skipScheduleOccurrence(d.id, '2027-01-08'))
    await waitFor(() => expect(computeOccurrences(resgateDe(d.id), 400)).not.toContain('2027-01-08'))
    expect(computeOccurrences(resgateDe(d.id), 400)).toEqual(computeOccurrences(despesa(), 400))
    act(() => app.deleteSchedule(d.id))
    await waitFor(() => expect(resgateDe(d.id)).toBeUndefined())
  }, 30000)

  it('excluir o lançamento da despesa desfaz o resgate da mesma ocorrência', async () => {
    const d = await criarEscola()
    let txId
    act(() => { txId = app.registerScheduleOccurrence(d.id, '2027-01-08', '2027-01-08') })
    await waitFor(() => expect(resgateDe(d.id).registered).toEqual(['2027-01-08']))
    act(() => app.deleteTransaction(txId))
    await waitFor(() => expect(resgateDe(d.id).registered).toEqual([]))
    expect(app.transactions.filter(t => t.type === 'transfer')).toHaveLength(0)
  }, 30000)

  it('abrir o resgate: somente leitura, aponta para a despesa', async () => {
    const m = await montar()
    const d = await criarEscola('fn_esc', m)
    act(() => m.abrir(resgateDe(d.id)))
    expect((await screen.findByTestId('aviso-resgate-ligado')).textContent).toMatch('ESCOLA EXEMPLO 2027')
    expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull()
  }, 30000)
})

describe('agendamento antigo', () => {
  it('editar e salvar pede "Resgatar de" e cria resgate só das pendentes', async () => {
    await montar(dados().schedules.find(s => s.id === 'sch_antigo'))
    const sel = await screen.findByTestId('agendamento-resgatar-de')
    fireEvent.change(sel, { target: { value: 'fn_ipva' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(resgateDe('sch_antigo')).toBeTruthy())
    const r = resgateDe('sch_antigo')
    expect(r.registered).toEqual([])
    expect(computeOccurrences(r, 400)).toEqual(['2026-11-05', '2026-12-05', '2027-01-05', '2027-02-05'])
    expect(app.transactions.filter(t => t.type === 'transfer')).toHaveLength(0)
  }, 30000)
})
