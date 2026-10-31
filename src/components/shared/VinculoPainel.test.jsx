// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { computeOccurrences } from '../../lib/occurrences'

const app = vi.hoisted(() => ({}))
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))
const { default: VinculoPainel } = await import('./VinculoPainel.jsx')

const INTERNET = { id: 'ag', description: 'Internet', payee: 'Provedor', transactionType: 'expense', accountId: 'cc', amount: 99.9, frequency: 'monthly', startDate: '2026-11-05', occurrenceType: 'continuous', registered: [], skipped: [], overrides: {} }
const P10 = { id: 'seg_10', type: 'expense', accountId: 'card', accountType: 'credit', amount: 150, date: '2026-11-15', description: 'SEGURO X 10/12', payee: 'Seguro X', installmentNum: 10, installmentTotal: 12, faturaMonthYear: '2026-12' }
const base = (o = {}) => Object.assign(app, {
  schedules: [INTERNET], transactions: [P10],
  accounts: [{ id: 'cc', name: 'Conta', type: 'checking' }, { id: 'card', name: 'Cartão', type: 'credit', closingDay: 25 }],
  getNextOccurrences: (s, n) => computeOccurrences(s, n), rateiosByLancamento: new Map(),
  vincularLancamento: vi.fn(() => ({ ok: true })), mesclarComParcela: vi.fn(() => ({ ok: true, rotulo: '10/12' })), ...o,
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('VinculoPainel', () => {
  it('ocorrência pendente: valor de 1 centavo diferente pergunta o que manter; padrão = o real', () => {
    base()
    const onClose = vi.fn()
    render(<VinculoPainel tx={{ id: 'av', type: 'expense', accountId: 'cc', amount: 99.91, date: '2026-11-06', description: 'Internet' }} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Vincular' }))
    expect(screen.getByText(/O que fica na ocorrência\?/)).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: /Vincular/ }).at(-1))
    expect(app.vincularLancamento).toHaveBeenCalledWith({ txId: 'av', scheduleId: 'ag', data: '2026-11-05', manter: 'lancamento' })
    expect(onClose).toHaveBeenCalledWith(true)
  })

  it('parcela: mesclar só depois da confirmação explícita', () => {
    base()
    render(<VinculoPainel tx={{ id: 'av', type: 'expense', accountId: 'card', accountType: 'credit', amount: 150, date: '2026-11-28', description: 'SEGURO X', faturaMonthYear: '2026-12' }} onClose={() => {}} />)
    expect(screen.getByText(/parcela 10\/12 – fatura 12\/2026/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Mesclar' }))
    fireEvent.click(screen.getByRole('button', { name: /Mesclar com a parcela/ }))
    expect(app.mesclarComParcela).not.toHaveBeenCalled()
    expect(screen.getByText('O lançamento avulso será removido e a parcela 10/12 mantida. Confirmar?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(app.mesclarComParcela).toHaveBeenCalledWith({ avulsoId: 'av', parcelaId: 'seg_10', campos: [] })
  })
})
