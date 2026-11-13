// @vitest-environment jsdom
// Editar Agendamento × ocorrências já baixadas (lib/edicaoSerieBaixas). Caso real de 13/11/2026,
// anonimizado: série 4× de 150 com a parcela de 10/10 baixada sem lançamento, reaproveitada para
// outro ano (Data de Início 05/01/2027) — a baixa ficava antes do início e a 1ª pendente repetia o
// vencimento; e a próxima data empurrada para frente fazia parcelas sumirem sem registro.
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
vi.mock('../shared/DateInput', () => ({ default: ({ value, onChange, disabled }) => <input value={value || ''} onChange={onChange} disabled={disabled} /> }))
const { default: ScheduleForm } = await import('./ScheduleForm.jsx')

const SERIE = {
  id: 'sch_material', description: 'MATERIAL', transactionType: 'expense', accountId: 'cc', amount: 150,
  categoryId: 'cat', payee: 'ESCOLA', frequency: 'monthly', startDate: '2026-09-10', nextOccurrence: '2026-11-10',
  occurrenceType: 'installment', installments: 4, registered: ['2026-10-10'], skipped: [], registeredMeta: {}, overrides: {},
  remindDaysBefore: 3, autoRegister: false, tipoDocumentoId: 'td',
}
const montar = (sch = SERIE, transactions = []) => {
  Object.assign(app, {
    schedules: [sch], accounts: [{ id: 'cc', name: 'Conta', type: 'checking' }], accountGroups: [], categories: [{ id: 'cat', name: 'Escola', type: 'expense' }],
    payees: [], transactions, gerencialGroups: [], reserveFunctions: [], scheduleReservaFuncoes: [], tiposDocumento: [],
    rateiosByLancamento: new Map(), settings: {}, activeProfileId: null, categoryGroupOrder: [],
    getNextOccurrences: (s, n) => computeOccurrences(s, n), pode: () => true, temHistorico: () => false,
    updateSchedule: vi.fn(), registrarEdicao: vi.fn(async () => ({})), contratoPorId: () => null,
  })
  return render(<ScheduleForm initial={sch} onClose={vi.fn()} onAviso={() => {}} />)
}
const salvar = async () => { await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Salvar' })) }) }
const clicar = async (nome) => { await act(async () => { fireEvent.click(screen.getByRole('button', { name: nome })) }) }
const ultimoUpdate = () => app.updateSchedule.mock.calls.at(-1)[1]
const camposHistorico = () => app.registrarEdicao.mock.calls.flatMap(([a]) => a.historico || []).map(h => h.campo)

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('Editar Agendamento — datas × ocorrências baixadas', () => {
  it('próxima data em cima da baixada: bloqueia e explica', async () => {
    montar()
    fireEvent.change(screen.getByDisplayValue('2026-11-10'), { target: { value: '2026-10-10' } })
    await salvar()
    expect(screen.getByTestId('erro-datas-serie').textContent).toMatch(/depois da última ocorrência baixada \(10\/10\/2026\)/)
    expect(app.updateSchedule).not.toHaveBeenCalled()
  })

  it('Data de Início depois de baixa COM lançamento: bloqueia', async () => {
    montar(SERIE, [{ id: 'tx1', date: '2026-10-10', amount: 150, scheduleId: 'sch_material', accountId: 'cc' }])
    fireEvent.change(screen.getByDisplayValue('2026-09-10'), { target: { value: '2027-01-05' } })
    await salvar()
    expect(screen.getByTestId('erro-datas-serie').textContent).toMatch(/já paga de 10\/10\/2026/)
    expect(app.updateSchedule).not.toHaveBeenCalled()
  })

  it('reaproveitar a série: pergunta se desfaz a baixa sem lançamento; "Sim" grava sem a baixa e registra no histórico', async () => {
    montar()
    fireEvent.change(screen.getByDisplayValue('2026-09-10'), { target: { value: '2027-01-05' } })
    fireEvent.change(screen.getByDisplayValue('2026-11-10'), { target: { value: '2027-01-05' } })
    await salvar()
    // A data mudou com pendentes depois: primeiro a pergunta de escopo de sempre.
    await clicar('Sim, a esta e às próximas')
    expect(screen.getByTestId('pergunta-datas-serie').textContent).toMatch('Esta série tem 1 baixa sem lançamento de 10/10/2026. Deseja desfazê-la?')
    await clicar('Sim, desfazer')
    // A série recomeçou na nova Data de Início: as pendentes antigas não viram puladas.
    expect(screen.queryByTestId('pergunta-datas-serie')).toBeNull()
    const d = ultimoUpdate()
    expect(d.registered).toEqual([])
    expect(d.startDate).toBe('2027-01-05')
    expect(d.skipped).toEqual([])
    expect(computeOccurrences(d, 10)).toEqual(['2027-01-05', '2027-02-05', '2027-03-05', '2027-04-05'])
    expect(camposHistorico()).toEqual(expect.arrayContaining(['startDate', 'baixa']))
  })

  it('empurrar a próxima data: "Marcar como puladas" registra as que ficam para trás; nada some', async () => {
    montar()
    fireEvent.change(screen.getByDisplayValue('2026-11-10'), { target: { value: '2027-01-05' } })
    await salvar()
    await clicar('Sim, a esta e às próximas')
    await clicar('Marcar como puladas')
    const d = ultimoUpdate()
    expect(d.nextOccurrence).toBe('2027-01-05')
    expect(d.skipped).toEqual(['2026-11-10', '2026-12-10'])
    expect(d.registered).toEqual(['2026-10-10'])
    // 1 baixada + 2 puladas + 1 pendente = as 4 parcelas.
    expect(computeOccurrences(d, 10)).toEqual(['2027-01-05'])
  })

  it('"Desfazer a alteração" não grava e volta a data de antes', async () => {
    montar()
    fireEvent.change(screen.getByDisplayValue('2026-11-10'), { target: { value: '2027-01-05' } })
    await salvar()
    await clicar('Sim, a esta e às próximas')
    await clicar('Desfazer a alteração')
    expect(app.updateSchedule).not.toHaveBeenCalled()
    expect(screen.getByDisplayValue('2026-11-10')).toBeTruthy()
  })

  it('A2: nº de parcelas entra no histórico', async () => {
    montar()
    const campo = screen.getAllByRole('spinbutton').find(i => i.value === '4')
    fireEvent.change(campo, { target: { value: '5' } })
    await salvar()
    expect(ultimoUpdate().installments).toBe(5)
    const linha = app.registrarEdicao.mock.calls.flatMap(([a]) => a.historico || []).find(h => h.campo === 'installments')
    expect(linha).toMatchObject({ valor_anterior: 4, valor_novo: 5, escopo: 'serie' })
  })
})
