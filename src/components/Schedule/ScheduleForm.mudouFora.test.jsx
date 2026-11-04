// @vitest-environment jsdom
// Editar Agendamento aberto e o agendamento muda FORA dele (ficha do contrato por cima, composição do
// boleto, pagamento, outro aparelho). Caso real de 04/11/2026: parcela de condomínio aberta com
// 1.424,67; a composição informada pela ficha levou a 1.544,37 e o modal continuava com 1.424,67 —
// salvar gravaria o valor antigo por cima.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { computeOccurrences } from '../../lib/occurrences'

const app = vi.hoisted(() => ({}))
vi.mock('../../context/AppContext', () => ({
  useApp: () => new Proxy(app, { get: (o, k) => (k in o ? o[k] : (typeof k === 'string' && /^(get|pode|tem|set|add|update|delete|salvar|registrar|recarregar|abrir|fechar)/.test(k) ? vi.fn(() => []) : [])) }),
}))
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('./ContratoDoAgendamento', () => ({ default: () => null }))
vi.mock('./OcorrenciasRegistradas', () => ({ default: () => null }))
const { default: ScheduleForm } = await import('./ScheduleForm.jsx')

const PARCELA = {
  id: 'ctr_c1_condominio_202611', description: 'Condomínio · Apto', transactionType: 'expense', accountId: 'cc', amount: 1424.67,
  categoryId: 'cat', payee: 'Cond Ed Sol', frequency: 'once', startDate: '2026-11-10', occurrenceType: 'continuous',
  registered: [], skipped: [], overrides: {}, remindDaysBefore: 3, autoRegister: false, tipoDocumentoId: 'td',
}
const montar = (sch = PARCELA) => {
  Object.assign(app, {
    schedules: [sch], accounts: [{ id: 'cc', name: 'Conta', type: 'checking' }], accountGroups: [], categories: [{ id: 'cat', name: 'Condomínio', type: 'expense' }],
    payees: [], transactions: [], gerencialGroups: [], reserveFunctions: [], scheduleReservaFuncoes: [], tiposDocumento: [],
    rateiosByLancamento: new Map(), settings: {}, activeProfileId: null, categoryGroupOrder: [],
    getNextOccurrences: (s, n) => computeOccurrences(s, n), pode: () => true, temHistorico: () => false,
    updateSchedule: vi.fn(), registrarEdicao: vi.fn(async () => ({})), contratoPorId: () => null,
  })
  const onClose = vi.fn()
  const r = render(<ScheduleForm initial={sch} onClose={onClose} onAviso={() => {}} />)
  return { ...r, onClose, mudar: async (changes) => {
    app.schedules = [{ ...app.schedules[0], ...changes }]
    await act(async () => { r.rerender(<ScheduleForm initial={sch} onClose={onClose} onAviso={() => {}} />) })
  } }
}
const campoValor = () => screen.getByPlaceholderText(/^0,00$|valor/i)
const valorNaTela = () => campoValor().value
const salvar = () => screen.getByRole('button', { name: 'Salvar' })

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('Editar Agendamento — mudança feita fora do formulário', () => {
  it('sem edição do usuário: o formulário passa ao valor novo e o Salvar grava 1.544,37 (nunca 1.424,67)', async () => {
    const { mudar } = montar()
    expect(valorNaTela()).toMatch(/1\.?424,67|1424\.67/)
    await mudar({ amount: 1544.37, composicao: { informada: true, total: 1544.37 } })
    expect(valorNaTela()).toMatch(/1\.?544,37|1544\.37/)
    expect(screen.getByTestId('agendamento-atualizado-fora').textContent).toMatch(/valor R\$ 1\.424,67 → R\$ 1\.544,37/)
    expect(screen.queryByTestId('agendamento-mudou-fora')).toBeNull()
    await act(async () => { fireEvent.click(salvar()) })
    expect(app.updateSchedule).toHaveBeenCalled()
    for (const [, d] of app.updateSchedule.mock.calls) expect(d.amount).toBe(1544.37)
  })

  it('com edição do usuário: avisa, bloqueia o Salvar; "Manter a minha edição" fica com o que ele mexeu e o valor novo', async () => {
    const { mudar } = montar()
    fireEvent.change(screen.getByDisplayValue('Condomínio · Apto'), { target: { value: 'Condomínio · Apto 302' } })
    await mudar({ amount: 1544.37 })
    const aviso = screen.getByTestId('agendamento-mudou-fora')
    expect(aviso.textContent).toMatch(/alterado enquanto você editava \(valor R\$ 1\.424,67 → R\$ 1\.544,37\)/)
    expect(salvar().disabled).toBe(true)
    await act(async () => { fireEvent.submit(salvar().closest('form')) })
    expect(app.updateSchedule).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Manter a minha edição' }))
    expect(screen.queryByTestId('agendamento-mudou-fora')).toBeNull()
    expect(screen.getByDisplayValue('Condomínio · Apto 302')).toBeTruthy()
    expect(valorNaTela()).toMatch(/1\.?544,37|1544\.37/)
    await act(async () => { fireEvent.click(salvar()) })
    expect(app.updateSchedule).toHaveBeenCalled()
    const [, d] = app.updateSchedule.mock.calls.at(-1)
    expect(d).toMatchObject({ amount: 1544.37, description: 'Condomínio · Apto 302' })
  })

  it('com edição do usuário: "Recarregar com os dados novos" descarta a edição e mostra o valor novo', async () => {
    const { mudar } = montar()
    fireEvent.change(screen.getByDisplayValue('Condomínio · Apto'), { target: { value: 'Outro nome' } })
    await mudar({ amount: 1544.37 })
    fireEvent.click(screen.getByRole('button', { name: 'Recarregar com os dados novos' }))
    expect(screen.getByDisplayValue('Condomínio · Apto')).toBeTruthy()
    expect(valorNaTela()).toMatch(/1\.?544,37|1544\.37/)
    expect(salvar().disabled).toBe(false)
  })

  it('agendamento recorrente (não só contrato): a prévia e o campo seguem a série atualizada', async () => {
    const serie = { ...PARCELA, id: 'sch_luz', description: 'Luz', amount: 200, frequency: 'monthly', startDate: '2026-11-10', nextOccurrence: '2026-11-10' }
    const { mudar } = montar(serie)
    await mudar({ amount: 230 })
    expect(valorNaTela()).toMatch(/230/)
    expect(screen.getByTestId('agendamento-atualizado-fora')).toBeTruthy()
  })

  it('mudança que não altera o formulário (ex.: carimbo) não mexe em nada', async () => {
    const { mudar } = montar()
    await mudar({ updatedAt: '2026-11-04T22:00:00Z' })
    expect(screen.queryByTestId('agendamento-atualizado-fora')).toBeNull()
    expect(screen.queryByTestId('agendamento-mudou-fora')).toBeNull()
  })
})
