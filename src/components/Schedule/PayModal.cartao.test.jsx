// @vitest-environment jsdom
// "Registrar Agendamento" de pagamento de fatura: a aba e o botão dizem "Pagamento de cartão" (só o
// nome — grava a mesma transferência). Transferência comum continua "Transferência".
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { registrarContas } from '../../lib/rotuloMovimento'

const app = vi.hoisted(() => ({}))
vi.mock('../../context/AppContext', () => ({
  useApp: () => new Proxy(app, { get: (o, k) => (k in o ? o[k] : (typeof k === 'string' && /^(get|pode|tem|set|add|update|delete|mark|register|skip|execut|efetiv|toggle|definir|baixar|confirm|criar|recalc|reconcil|desfazer|vincular|possiveis)/.test(k) ? vi.fn(() => []) : [])) }),
}))
vi.mock('../../context/atalhosHooks', async (orig) => ({ ...(await orig()), useAtalho: () => {}, useTituloAtalho: (t) => t, useCamadaModal: () => {} }))
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('../shared/ShortcutHint', () => ({ default: () => null }))
const { PayModal } = await import('./SchedulePanel.jsx')

const CONTAS = [
  { id: 'cc', name: 'Conta', type: 'checking', profileId: 'pf' },
  { id: 'poup', name: 'Poupança', type: 'savings', profileId: 'pf' },
  { id: 'card', name: 'Cartão Exemplo', type: 'credit', profileId: 'pf', closingDay: 5, dueDay: 12 },
]
const ag = (o) => ({
  id: 's1', description: 'Fatura Cartão Exemplo', transactionType: 'transfer', accountId: 'cc', toAccountId: 'card', amount: 850,
  frequency: 'once', startDate: '2026-11-12', occurrenceType: 'continuous', registered: [], skipped: [], overrides: {}, ...o,
})

beforeEach(() => {
  Object.assign(app, {
    accounts: CONTAS, profiles: [], payees: [], transactions: [], schedules: [], settings: {}, accountGroups: [], reserveFunctions: [],
    scheduleReservaFuncoes: [], rateiosByLancamento: new Map(), possiveisDuplicados: new Map(), tiposDocumento: [],
  })
})
afterEach(() => { cleanup(); registrarContas([]) })

const abrir = (schedule, contas = CONTAS) => {
  const addTransaction = vi.fn(() => 'tx_novo')
  const markScheduleRegistered = vi.fn()
  render(<PayModal schedule={schedule} nextDate={schedule.startDate} accounts={contas} categories={[]} gerencialGroups={[]}
    addTransaction={addTransaction} markScheduleRegistered={markScheduleRegistered} onClose={() => {}} />)
  return { addTransaction }
}

describe('Registrar Agendamento — pagamento de fatura', () => {
  it('aba "Pagamento de cartão" e botão "Confirmar pagamento de cartão"; grava a mesma transferência', () => {
    const { addTransaction } = abrir(ag())
    expect(screen.getByRole('button', { name: 'Pagamento de cartão' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Transferência' })).toBeNull()
    const confirmar = screen.getByRole('button', { name: /Confirmar pagamento de cartão/ })
    expect(screen.queryByText(/Confirmar Transferência/)).toBeNull()
    fireEvent.click(confirmar)
    expect(addTransaction).toHaveBeenCalledWith(expect.objectContaining({ type: 'transfer', accountId: 'cc', toAccountId: 'card', amount: 850 }))
  })

  it('agendamento do motor (tipo pagamento_fatura) também', () => {
    abrir(ag({ tipo: 'pagamento_fatura' }))
    expect(screen.getByRole('button', { name: /Confirmar pagamento de cartão/ })).toBeTruthy()
  })

  it('cartão de OUTRO perfil (só as contas deste perfil na mão): ainda "Pagamento de cartão"', () => {
    registrarContas([...CONTAS, { id: 'card_pj', type: 'credit', profileId: 'pj' }])
    abrir(ag({ toAccountId: 'card_pj' }), CONTAS)
    expect(screen.getByRole('button', { name: /Confirmar pagamento de cartão/ })).toBeTruthy()
  })

  it('transferência comum continua "Transferência" / "Confirmar Transferência"', () => {
    const { addTransaction } = abrir(ag({ id: 's2', description: 'Guardar', toAccountId: 'poup' }))
    expect(screen.getByRole('button', { name: 'Transferência' })).toBeTruthy()
    const confirmar = screen.getByRole('button', { name: /Confirmar Transferência/ })
    expect(screen.queryByText(/Pagamento de cartão/)).toBeNull()
    fireEvent.click(confirmar)
    expect(addTransaction).toHaveBeenCalledWith(expect.objectContaining({ type: 'transfer', toAccountId: 'poup' }))
  })
})
