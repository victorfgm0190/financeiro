// @vitest-environment jsdom
// Fechar formulário de cadastro com alteração NÃO salva (agendamento, lançamento, transferência):
// Esc, X, clique fora e Cancelar perguntam "Descartar as alterações?" (Descartar / Continuar
// editando); sem alteração fecha direto; Esc numa lista aberta (busca, favorecido) só fecha a lista.
// Formulários reais no Modal real e no AppProvider real (API simulada). Dados fictícios.
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act, cleanup, within } from '@testing-library/react'

const dados = () => ({
  settings: { financialMonthStartDay: 1, financialMonthMode: 'custom', currency: 'BRL', recurringMatchExceptions: [], categoryGroups: [], faturasFechadas: {} },
  costCenters: [], transactions: [], budgets: [], classificationRules: [], gerencialRules: [], payables: [],
  payees: ['Escola Exemplo'], envelopes: [], accountGroups: null, cardImports: [], rateios: [], scheduleReservaFuncoes: [], favorecidoAliases: [],
  profiles: [{ id: 'p1', name: 'Pessoal', ordem: 0 }],
  categories: [{ id: 'cat_esc', name: 'Escola', type: 'expense', icon: '🎒' }],
  accounts: [
    { id: 'cc', name: 'Conta Corrente', type: 'checking', profileId: 'p1', contaCorrentePrincipal: true, balance: 0, initialBalance: 0, active: true },
    { id: 'pp', name: 'Poupança', type: 'savings', profileId: 'p1', balance: 0, initialBalance: 0, active: true },
  ],
  gerencialGroups: [], reserveFunctions: [], schedules: [],
})

vi.mock('../lib/db', async (orig) => ({
  ...(await orig()),
  loadFromDb: vi.fn(async () => ({ status: 'connected', assinatura: null, recursos: null, data: dados() })),
}))
vi.mock('./atalhosHooks', async (orig) => ({ ...(await orig()), useAtalho: () => {}, useTituloAtalho: (t) => t, useAtalhoTitulo: (t) => t }))
vi.mock('../components/shared/ShortcutHint', () => ({ default: () => null }))

const { AppProvider, useApp } = await import('./AppContext')
const { default: Modal } = await import('../components/shared/Modal')
const { default: ScheduleForm } = await import('../components/Schedule/ScheduleForm')
const { default: TransactionForm } = await import('../components/Transactions/TransactionForm')
const { haTrabalhoEmAndamento } = await import('../lib/trabalhoEmAndamento')
// Digita até o formulário marcar a alteração (a mesma marca do aviso de atualização). Sob carga a
// "foto" de abertura pode sair depois da 1ª digitação; digitar de novo é o que a pessoa faria.
// A digitação fica FORA do waitFor: dentro dele, cada digitação muda a tela e dispara o waitFor de
// novo na hora, um ciclo que nunca deixa o relógio andar (o teste pendurava sem estourar o limite).
let n = 0
async function alterar(placeholder, valor) {
  for (let tentativa = 0; tentativa < 10; tentativa++) {
    fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value: `${valor}${n++ ? ' ' + n : ''}` } })
    try {
      await waitFor(() => expect(haTrabalhoEmAndamento()).toBe(true), { timeout: 1500, interval: 100 })
      return
    } catch { /* digita de novo */ }
  }
  expect(haTrabalhoEmAndamento()).toBe(true)
}

let app
function Espiao() { app = useApp(); return null }

beforeAll(() => {
  globalThis.fetch = vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
  localStorage.setItem('auth_token', 'x.' + btoa(JSON.stringify({ nivel: 'admin', sub: 't', exp: 4102444800 })) + '.y')
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || function () {}
})
// app = null: o próximo teste espera o AppProvider NOVO carregar (não o do teste anterior).
afterEach(async () => { cleanup(); app = null; const { _reiniciarTrabalhos } = await import('../lib/trabalhoEmAndamento'); _reiniciarTrabalhos() })

// O formulário dentro de um Modal (a guarda de fechamento é do Modal). onClose conta os fechamentos.
async function montar(Form, titulo) {
  const fechar = vi.fn()
  function Tela() {
    return <Modal open onClose={fechar} title={titulo}><Form initial={null} onClose={fechar} onAviso={() => {}} onToast={() => {}} /></Modal>
  }
  render(<AppProvider><Espiao /><Tela /></AppProvider>)
  await waitFor(() => expect(app?.accounts?.some(a => a.id === 'cc')).toBe(true), { timeout: 15000 })
  // A "foto" do formulário é tirada um instante depois de abrir (useAlteradoDesdeAbertura).
  await act(() => new Promise(r => setTimeout(r, 500)))
  return fechar
}
const esc = () => fireEvent.keyDown(document.activeElement || document.body, { key: 'Escape' })
const dialogo = () => screen.queryByText('Descartar as alterações?')

describe('Novo Agendamento', () => {
  it('sem alteração: Esc fecha direto', async () => {
    const fechar = await montar(ScheduleForm, 'Novo Agendamento')
    esc()
    expect(fechar).toHaveBeenCalledTimes(1)
    expect(dialogo()).toBeNull()
  }, 40000)

  it('com alteração: Esc, X e Cancelar perguntam; "Continuar editando" mantém; "Descartar" fecha', async () => {
    const fechar = await montar(ScheduleForm, 'Novo Agendamento')
    await alterar('Digite a descrição do agendamento', 'ESCOLA EXEMPLO')
    const digitado = screen.getByPlaceholderText('Digite a descrição do agendamento').value
    esc()
    expect(dialogo()).toBeTruthy()
    expect(fechar).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }))
    expect(dialogo()).toBeNull()
    expect(screen.getByDisplayValue(digitado)).toBeTruthy()
    // X do modal
    fireEvent.click(screen.getAllByRole('button', { name: 'Fechar' })[0])
    expect(dialogo()).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }))
    // Cancelar do formulário
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(dialogo()).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))
    expect(fechar).toHaveBeenCalledTimes(1)
  }, 40000)

  it('Esc com a lista de busca aberta (conta) fecha só a lista', async () => {
    const fechar = await montar(ScheduleForm, 'Novo Agendamento')
    fireEvent.change(screen.getByPlaceholderText('Digite a descrição do agendamento'), { target: { value: 'ESCOLA EXEMPLO' } })
    const gatilhos = document.querySelectorAll('button[aria-haspopup="listbox"]')
    fireEvent.click(gatilhos[0])
    const busca = screen.getByPlaceholderText('Buscar...')
    fireEvent.keyDown(busca, { key: 'Escape' })
    expect(screen.queryByPlaceholderText('Buscar...')).toBeNull()
    expect(dialogo()).toBeNull()
    expect(fechar).not.toHaveBeenCalled()
  }, 40000)
})

describe('Novo Lançamento / transferência', () => {
  it('sem alteração: Esc fecha direto', async () => {
    const fechar = await montar(TransactionForm, 'Novo Lançamento')
    esc()
    expect(fechar).toHaveBeenCalledTimes(1)
    expect(dialogo()).toBeNull()
  }, 40000)

  it('com alteração: Esc pergunta; Descartar fecha', async () => {
    const fechar = await montar(TransactionForm, 'Novo Lançamento')
    await alterar('Digite a descrição do lançamento', 'Mensalidade')
    esc()
    expect(dialogo()).toBeTruthy()
    expect(fechar).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))
    expect(fechar).toHaveBeenCalledTimes(1)
  }, 40000)

  it('Esc na lista de favorecidos fecha só a lista', async () => {
    const fechar = await montar(TransactionForm, 'Novo Lançamento')
    const fav = screen.getByPlaceholderText('Digite o nome do favorecido')
    fireEvent.focus(fav)
    fireEvent.change(fav, { target: { value: 'Esc' } })
    expect(await screen.findByText('Escola Exemplo')).toBeTruthy()
    fireEvent.keyDown(fav, { key: 'Escape' })
    expect(screen.queryByText('Escola Exemplo')).toBeNull()
    expect(dialogo()).toBeNull()
    expect(fechar).not.toHaveBeenCalled()
  }, 40000)

  it('transferência: com alteração pergunta antes de fechar', async () => {
    const fechar = await montar(TransactionForm, 'Nova Transferência')
    fireEvent.click(within(document.querySelector('[data-modal-painel]')).getAllByRole('button', { name: /Transferência/ })[0])
    await alterar('Digite a descrição do lançamento', 'Para a poupança')
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(dialogo()).toBeTruthy()
    expect(fechar).not.toHaveBeenCalled()
  }, 40000)
})
