// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { computeOccurrences } from '../../lib/occurrences'

// Aba Pagos: lista feita dos lançamentos em conta, selo Avulso, edição do avulso e filtro de categoria.
const app = vi.hoisted(() => ({}))
const mobile = vi.hoisted(() => ({ valor: false }))
vi.mock('../../context/AppContext', () => ({
  useApp: () => new Proxy(app, { get: (o, k) => (k in o ? o[k] : (typeof k === 'string' && /^(get|pode|tem|set|add|update|delete|mark|register|skip|executar|efetivar)/.test(k) ? () => [] : undefined)) }),
}))
vi.mock('../../context/atalhosHooks', async (orig) => ({ ...(await orig()), useAtalho: () => {}, useTituloAtalho: (t) => t, useAtalhoTitulo: (t) => t }))
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => mobile.valor }))
vi.mock('../shared/ShortcutHint', () => ({ default: () => null }))
vi.mock('../Transactions/TransactionForm', () => ({ default: ({ initial }) => <div data-testid="form-lancamento">{initial.id}</div> }))
const { default: SchedulePanel } = await import('./SchedulePanel.jsx')

const accounts = [
  { id: 'banco', name: 'Banco', type: 'checking' }, { id: 'res', name: 'Reserva', type: 'savings' }, { id: 'cartao', name: 'Visa', type: 'credit' }, { id: 'cons', name: 'Consórcio', type: 'asset' },
]
const tx = (id, type, amount, extra = {}) => ({ id, type, amount, date: '2026-06-12', accountId: 'banco', description: id.toUpperCase(), payee: '', ...extra })
const agendamento = { id: 'ag', description: 'ALUGUEL', transactionType: 'expense', accountId: 'banco', amount: 900, frequency: 'monthly', startDate: '2026-06-05', occurrenceType: 'continuous', registered: ['2026-06-05'], skipped: [], overrides: {} }
const transactions = [
  tx('reembolso', 'income', 341.5, { categoryId: 'cat' }),
  tx('aluguel', 'expense', 900, { date: '2026-06-05', scheduleId: 'ag', description: 'ALUGUEL' }),
  tx('transf', 'transfer', 50, { toAccountId: 'cons' }),
  tx('entrecontas', 'transfer', 77, { toAccountId: 'res' }),
  tx('fatura', 'transfer', 700, { toAccountId: 'cartao' }),
  tx('compra', 'expense', 80, { accountId: 'cartao' }),
]

beforeEach(() => {
  mobile.valor = false
  localStorage.clear()
  Object.assign(app, {
    profileSchedules: [agendamento], schedules: [agendamento], categories: [{ id: 'cat', name: 'Reembolsos', type: 'income' }],
    profileAccounts: accounts, accounts, payables: [], gerencialGroups: [], activeProfileId: null, settings: {}, tiposDocumento: [],
    transactions, profileTransactions: transactions, usuario: { id: 'u1' }, pode: () => true, getNextOccurrences: (s, n) => computeOccurrences(s, n),
    getProvisoesPendentes: () => [], getFaturasProvisaoGerencial: () => [], temHistorico: () => false,
    scheduleReservaFuncoes: [], reserveFunctions: [], rateiosByLancamento: new Map(), coberturaCartao: new Map(), possiveisDuplicados: new Map(),
    profiles: [], contratosHabilitado: false, contratoPorId: () => null, categoryGroupOrder: [],
  })
})
afterEach(() => { cleanup() })

const abrirPagos = () => {
  render(<SchedulePanel />)
  fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Status' })).getByRole('radio', { name: /^Pagos/ }))
  fireEvent.change(screen.getByLabelText(/Período/i), { target: { value: 'tudo' } })
}
const linhaDe = (texto) => screen.getByText(texto).closest('tr')

describe('aba Pagos', () => {
  it('mostra avulso com selo, baixa uma vez, transferência origem → destino; cartão fica fora', () => {
    abrirPagos()
    const avulso = linhaDe('REEMBOLSO')
    expect(within(avulso).getByText('Avulso')).toBeTruthy()
    const celulas = avulso.querySelectorAll('td')
    expect(celulas[0].textContent).toBe('12/06/2026')
    expect(celulas[1].textContent).toBe('—')
    expect(celulas[8].textContent).toBe('')
    expect(screen.getAllByText('ALUGUEL').length).toBe(1)
    expect(within(linhaDe('ALUGUEL')).queryByText('Avulso')).toBeNull()
    expect(within(linhaDe('TRANSF')).getByText('Banco → Consórcio')).toBeTruthy()
    expect(screen.queryByText('COMPRA')).toBeNull()
    expect(screen.queryByText('ENTRECONTAS')).toBeNull()
  })
  it('clicar no avulso abre Editar Lançamento; linha de agendamento não abre', () => {
    abrirPagos()
    fireEvent.click(linhaDe('ALUGUEL'))
    expect(screen.queryByTestId('form-lancamento')).toBeNull()
    fireEvent.click(linhaDe('REEMBOLSO'))
    expect(screen.getByText('Editar Lançamento')).toBeTruthy()
    expect(screen.getByTestId('form-lancamento').textContent).toBe('reembolso')
  })
  it('pagamento de fatura só em Pagamentos de cartão', () => {
    abrirPagos()
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Tipo' })).getByRole('radio', { name: /^Pagamentos de cartão/ }))
    expect(screen.getByText('FATURA')).toBeTruthy()
    expect(screen.queryByText('TRANSF')).toBeNull()
  })
  it('rodapé: um total por tipo e o Líquido; com um tipo escolhido, só ele', () => {
    abrirPagos()
    const valor = (id) => screen.getByTestId(`pagos-total-${id}`).textContent.replace(/\s/g, ' ')
    expect(valor('entradas')).toContain('341,50')
    expect(valor('saidas')).toContain('900,00')
    expect(valor('transferencias')).toContain('50,00')
    expect(valor('pagamentos_cartao')).toContain('700,00')
    expect(valor('liquido')).toContain('1.308,50') // 341,50 − 900 − 50 − 700
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Tipo' })).getByRole('radio', { name: /^Saídas/ }))
    expect(valor('saidas')).toContain('900,00')
    expect(screen.queryByTestId('pagos-total-entradas')).toBeNull()
    expect(screen.queryByTestId('pagos-total-liquido')).toBeNull()
  })
  it('filtro de categoria abre em Todas; Sem categoria deixa só os sem categoria', () => {
    abrirPagos()
    const botao = screen.queryAllByRole('button', { name: /Filtros/ })[0]
    if (botao) fireEvent.click(botao)
    const rotulo = screen.getByText('Categoria', { selector: 'label' })
    const select = rotulo.parentElement.querySelector('select')
    expect(select.value).toBe('')
    expect(select.options[0].textContent).toBe('Todas')
    expect(select.options[1].textContent).toBe('Sem categoria')
    fireEvent.change(select, { target: { value: select.options[1].value } })
    expect(screen.queryByText('REEMBOLSO')).toBeNull()
    expect(screen.getByText('TRANSF')).toBeTruthy()
  })
  it('celular: o avulso abre a edição e a lista não quebra sem agendamento', () => {
    mobile.valor = true
    abrirPagos()
    fireEvent.click(screen.getByText('REEMBOLSO'))
    expect(screen.getByTestId('form-lancamento').textContent).toBe('reembolso')
  })
})
