// @vitest-environment jsdom
// Lista de Agendamentos: alerta ao lado do "x/N" quando a série tem baixa sem lançamento e a revisão
// "Baixas sem lançamento" (vincular / desfazer / manter assim). Automáticos ficam de fora.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { computeOccurrences } from '../../lib/occurrences'
import { mapaBaixasSemLancamento } from '../../lib/baixasSemLancamento'

const app = vi.hoisted(() => ({}))
vi.mock('../../context/AppContext', () => ({
  useApp: () => new Proxy(app, { get: (o, k) => (k in o ? o[k] : (typeof k === 'string' && /^(get|pode|tem|set|add|update|delete|mark|register|skip|executar|efetivar)/.test(k) ? () => [] : undefined)) }),
}))
vi.mock('../../context/atalhosHooks', async (orig) => ({ ...(await orig()), useAtalho: () => {}, useTituloAtalho: (t) => t, useAtalhoTitulo: (t) => t }))
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('../shared/ShortcutHint', () => ({ default: () => null }))
vi.mock('../Transactions/TransactionForm', () => ({ default: () => null }))
const { default: SchedulePanel } = await import('./SchedulePanel.jsx')

const accounts = [{ id: 'banco', name: 'Banco', type: 'checking' }]
const hoje = new Date().toISOString().slice(0, 10)
const mais = (dias) => { const d = new Date(); d.setDate(d.getDate() + dias); return d.toISOString().slice(0, 10) }
const SERIE = {
  id: 'ag', description: 'MATERIAL', transactionType: 'expense', accountId: 'banco', amount: 276, categoryId: 'cat',
  frequency: 'monthly', occurrenceType: 'installment', installments: 5, startDate: mais(-40), nextOccurrence: mais(20),
  registered: [mais(-10)], skipped: [], registeredMeta: {}, overrides: {},
}
const solto = { id: 'tx_solto', type: 'expense', amount: 276, date: mais(-9), accountId: 'banco', description: 'PAPELARIA', categoryId: 'cat' }

beforeEach(() => {
  localStorage.clear()
  const schedules = [SERIE]
  Object.assign(app, {
    profileSchedules: schedules, schedules, categories: [{ id: 'cat', name: 'Escola', type: 'expense' }],
    profileAccounts: accounts, accounts, payables: [], gerencialGroups: [], activeProfileId: null, settings: {}, tiposDocumento: [],
    transactions: [solto], profileTransactions: [solto], usuario: { id: 'u1' }, pode: () => true, getNextOccurrences: (s, n) => computeOccurrences(s, n),
    getProvisoesPendentes: () => [], getFaturasProvisaoGerencial: () => [], temHistorico: () => false,
    scheduleReservaFuncoes: [], reserveFunctions: [], rateiosByLancamento: new Map(), coberturaCartao: new Map(), possiveisDuplicados: new Map(),
    profiles: [], contratosHabilitado: false, contratoPorId: () => null, categoryGroupOrder: [],
    baixasSemLancamento: mapaBaixasSemLancamento(schedules, [solto]),
    markScheduleRegistered: vi.fn(), marcarDataOcorrencia: vi.fn(), desfazerBaixaOcorrencia: vi.fn(), manterBaixaPagoFora: vi.fn(),
  })
})
afterEach(() => { cleanup() })

describe('baixas sem lançamento na lista de Agendamentos', () => {
  it('alerta ao lado do x/N com o texto da dica', () => {
    render(<SchedulePanel />)
    const alerta = screen.getAllByTestId('alerta-baixa-sem-lancamento')[0]
    expect(alerta.getAttribute('title')).toBe('1 parcela baixada sem lançamento')
    expect(hoje).toBeTruthy()
  })

  it('revisão: lista a baixa com o lançamento parecido e as 3 ações', () => {
    render(<SchedulePanel />)
    fireEvent.click(screen.getByTestId('botao-baixas-sem-lancamento'))
    const linha = screen.getByTestId('linha-baixa-sem-lancamento')
    expect(linha.textContent).toMatch('MATERIAL')
    expect(linha.textContent).toMatch(/Parece ser o pagamento: PAPELARIA/)
    fireEvent.click(within(linha).getByRole('button', { name: /Vincular a este lançamento/ }))
    expect(app.markScheduleRegistered).toHaveBeenCalledWith('ag', SERIE.registered[0], expect.objectContaining({ lancamento_id: 'tx_solto' }))
    fireEvent.click(within(linha).getByRole('button', { name: /Desfazer baixa/ }))
    expect(app.desfazerBaixaOcorrencia).toHaveBeenCalledWith('ag', SERIE.registered[0])
    fireEvent.click(within(linha).getByRole('button', { name: /Manter assim \(pago fora do Finup\)/ }))
    expect(app.manterBaixaPagoFora).toHaveBeenCalledWith('ag', SERIE.registered[0])
  })

  it('agendamento automático não ganha alerta nem entra na revisão', () => {
    const motor = { ...SERIE, id: 'fsch_banco_202610_pagamento_fatura', tipo: 'pagamento_fatura' }
    app.profileSchedules = [motor]; app.schedules = [motor]
    app.baixasSemLancamento = mapaBaixasSemLancamento([motor], [solto])
    render(<SchedulePanel />)
    expect(screen.queryByTestId('alerta-baixa-sem-lancamento')).toBeNull()
    expect(screen.queryByTestId('botao-baixas-sem-lancamento')).toBeNull()
  })
})
