// @vitest-environment jsdom
// Help de campo (F1) no "Registrar Agendamento": F1 no Valor abre o help do campo e não a ajuda do
// navegador; sem campo, o help do formulário. Dados fictícios.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'

const app = vi.hoisted(() => ({}))
vi.mock('../../context/AppContext', () => ({
  useApp: () => new Proxy(app, { get: (o, k) => (k in o ? o[k] : (typeof k === 'string' && /^(get|pode|tem|set|add|update|delete|mark|register|skip|execut|efetiv|toggle|definir|baixar|confirm|criar|recalc|reconcil|desfazer|vincular|possiveis)/.test(k) ? vi.fn(() => []) : [])) }),
}))
vi.mock('../../context/atalhosHooks', async (orig) => ({ ...(await orig()), useAtalho: () => {}, useTituloAtalho: (t) => t, useCamadaModal: () => {} }))
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('../shared/ShortcutHint', () => ({ default: () => null }))
const { PayModal } = await import('./SchedulePanel.jsx')
const { default: HelpCampoPainel } = await import('../Ajuda/HelpCampoPainel.jsx')
const { fecharHelpCampo } = await import('../../help/helpCampoEstado.js')

const CONTAS = [{ id: 'cc', name: 'Conta', type: 'checking', profileId: 'pf' }]
const AG = {
  id: 's1', description: 'Conta de luz', transactionType: 'expense', accountId: 'cc', amount: 180, frequency: 'monthly',
  startDate: '2026-11-12', occurrenceType: 'continuous', registered: [], skipped: [], overrides: {},
}
beforeEach(() => {
  Object.assign(app, {
    accounts: CONTAS, profiles: [], payees: [], transactions: [], schedules: [], settings: {}, accountGroups: [], reserveFunctions: [],
    scheduleReservaFuncoes: [], rateiosByLancamento: new Map(), possiveisDuplicados: new Map(), tiposDocumento: [],
  })
})
afterEach(() => { act(() => fecharHelpCampo()); cleanup() })
const f1 = () => {
  const ev = new KeyboardEvent('keydown', { key: 'F1', bubbles: true, cancelable: true })
  act(() => { document.activeElement.dispatchEvent(ev) })
  return ev
}

describe('F1 no Registrar Agendamento', () => {
  it('foco no Valor: F1 abre o help do campo (não a ajuda do navegador)', () => {
    render(<><HelpCampoPainel /><PayModal schedule={AG} nextDate={AG.startDate} accounts={CONTAS} categories={[]} gerencialGroups={[]}
      addTransaction={vi.fn()} markScheduleRegistered={vi.fn()} onClose={() => {}} /></>)
    const valor = document.querySelector('[data-help-id="registrarAgendamento.valor"] input')
    act(() => valor.focus())
    expect(f1().defaultPrevented).toBe(true)
    const p = screen.getByTestId('help-campo-painel')
    expect(p.textContent).toContain('Quanto foi pago ou recebido de fato nesta ocorrência.')
    // Rodapé: ajuda da tela; "Preencher com guia" escondido até o formulário guiado (Etapa 4).
    expect(screen.getByRole('button', { name: /Ajuda da tela/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Preencher com guia/ })).toBeNull()
    // ⓘ em cada campo marcado do Registrar.
    expect(document.querySelector('[data-help-id="registrarAgendamento.valor"] [data-testid="help-campo"]')).toBeTruthy()
    expect(document.querySelector('[data-help-id="registrarAgendamento.data"] [data-testid="help-campo"]')).toBeTruthy()
  })

  it('sem campo com foco: o help do formulário', () => {
    render(<><HelpCampoPainel /><PayModal schedule={AG} nextDate={AG.startDate} accounts={CONTAS} categories={[]} gerencialGroups={[]}
      addTransaction={vi.fn()} markScheduleRegistered={vi.fn()} onClose={() => {}} /></>)
    act(() => document.body.focus())
    f1()
    expect(screen.getByTestId('help-campo-painel').textContent).toContain('Registrar que esta ocorrência foi paga ou recebida.')
  })
})
