// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { computeOccurrences } from '../../lib/occurrences'

// Tela Agendamentos: título novo, seletor de tipo (Todos · Entradas · Saídas · Transferências) com
// contagens, lista recortada e combinação com o filtro de período.
const app = vi.hoisted(() => ({}))
vi.mock('../../context/AppContext', () => ({
  useApp: () => new Proxy(app, { get: (o, k) => (k in o ? o[k] : (typeof k === 'string' && /^(get|pode|tem|set|add|update|delete|mark|register|skip|execut|efetiv|toggle|definir|baixar|confirm|criar|recalc|reconcil)/.test(k) ? vi.fn(() => []) : [])) }),
}))
vi.mock('../../context/atalhosHooks', async (orig) => ({ ...(await orig()), useAtalho: () => {}, useTituloAtalho: (t) => t, useCamadaModal: () => {} }))
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('../shared/ShortcutHint', () => ({ default: () => null }))
const { default: SchedulePanel } = await import('./SchedulePanel.jsx')

const ag = (id, transactionType, startDate, amount, extra = {}) => ({
  id, description: id.toUpperCase(), transactionType, accountId: 'cc', toAccountId: transactionType === 'transfer' ? 'res' : null,
  amount, frequency: 'once', startDate, occurrenceType: 'continuous', registered: [], skipped: [], overrides: {}, ...extra,
})
const hoje = new Date()
const iso = (d) => d.toISOString().slice(0, 10)
const emDias = (n) => iso(new Date(hoje.getTime() + n * 86_400_000))
const schedules = [
  ag('salario', 'income', emDias(5), 5000),
  ag('aluguel recebido', 'income', emDias(70), 1200),
  ag('luz', 'expense', emDias(8), 210),
  ag('reserva mensal', 'transfer', emDias(10), 300),
]

beforeEach(() => {
  localStorage.clear()
  Object.assign(app, {
    profileSchedules: schedules, schedules, categories: [], profileAccounts: [{ id: 'cc', name: 'Conta', type: 'checking' }, { id: 'res', name: 'Reserva', type: 'savings' }],
    accounts: [{ id: 'cc', name: 'Conta', type: 'checking' }, { id: 'res', name: 'Reserva', type: 'savings' }],
    payables: [], gerencialGroups: [], activeProfileId: null, settings: {}, tiposDocumento: [], transactions: [], profileTransactions: [],
    usuario: { id: 'u1' }, pode: () => true, getNextOccurrences: (s, n) => computeOccurrences(s, n),
    getProvisoesPendentes: () => [], getFaturasProvisaoGerencial: () => [], temHistorico: () => false,
    scheduleReservaFuncoes: [], reserveFunctions: [], rateiosByLancamento: new Map(), coberturaCartao: new Map(), possiveisDuplicados: new Map(),
    profiles: [], contratosHabilitado: false, contratoPorId: () => null,
  })
})
afterEach(() => { cleanup() })

const grupoTipo = () => screen.getByRole('radiogroup', { name: 'Tipo' })
const botaoTipo = (nome) => within(grupoTipo()).getByRole('radio', { name: new RegExp(`^${nome}`) })

describe('Agendamentos: nome e filtro por tipo', () => {
  it('título "Agendamentos" e contagens por tipo', () => {
    render(<SchedulePanel />)
    expect(screen.getByRole('heading', { name: 'Agendamentos' })).toBeTruthy()
    expect(botaoTipo('Todos').textContent).toMatch(/Todos\s*4/)
    expect(botaoTipo('Entradas').textContent).toMatch(/Entradas\s*2/)
    expect(botaoTipo('Saídas').textContent).toMatch(/Saídas\s*1/)
    expect(botaoTipo('Transferências').textContent).toMatch(/Transferências\s*1/)
  })

  it('alternar os tipos recorta a lista e lembra a escolha', () => {
    render(<SchedulePanel />)
    fireEvent.click(botaoTipo('Entradas'))
    expect(screen.queryAllByText('SALARIO').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('LUZ').length).toBe(0)
    expect(localStorage.getItem('finup:agendamentos:tipo')).toBe('entradas')
    fireEvent.click(botaoTipo('Transferências'))
    expect(screen.queryAllByText('RESERVA MENSAL').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('SALARIO').length).toBe(0)
    cleanup()
    render(<SchedulePanel />)
    expect(botaoTipo('Transferências').getAttribute('aria-checked')).toBe('true')
  })

  it('combina com o período: "Próximos 30 dias" tira o aluguel de daqui a 70 dias da contagem e da lista', () => {
    localStorage.setItem('finup.agendamentos.filtros.v1', JSON.stringify({ conta: { status: 'apagar', periodos: { apagar: 'next30' } } }))
    render(<SchedulePanel />)
    expect(botaoTipo('Todos').textContent).toMatch(/Todos\s*3/)
    expect(botaoTipo('Entradas').textContent).toMatch(/Entradas\s*1/)
    fireEvent.click(botaoTipo('Entradas'))
    expect(screen.queryAllByText('SALARIO').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('ALUGUEL RECEBIDO').length).toBe(0)
  })
})
