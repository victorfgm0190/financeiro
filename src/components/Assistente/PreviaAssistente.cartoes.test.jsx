// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const app = vi.hoisted(() => ({}))
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))
vi.mock('../../lib/assistenteApi', () => ({
  aprenderApelidos: async () => ({}), concluirPreLancamento: async () => ({}), listarPreLancamentos: async () => [],
  guardarPreLancamento: async () => ({}), cotacaoDolar: async () => ({}), listarApelidos: async () => [],
}))
vi.mock('../Transactions/TransactionForm', () => ({
  default: ({ repeticaoExterna, rotuloGravar }) => (
    <p data-testid="despesa">{`repetir=${repeticaoExterna ? String(repeticaoExterna.repeat) : '-'} freq=${repeticaoExterna?.repeatFrequency || '-'} botao=${rotuloGravar || '-'}`}</p>
  ),
}))
vi.mock('../Schedule/ScheduleForm', () => ({ default: ({ initial }) => <p data-testid="agendamento">{`AGENDAMENTO ${initial.frequency} ${initial.startDate}`}</p> }))
const { default: PreviaAssistente } = await import('./PreviaAssistente.jsx')

Object.assign(app, {
  transactions: [], schedules: [], accounts: [{ id: 'cc', name: 'Conta', type: 'checking' }],
  activeProfileId: null, updateAccount: vi.fn(), pode: () => true, getNextOccurrences: () => [], settings: {},
  addTransaction: vi.fn(), setReconciled: vi.fn(), categories: [{ id: 'luz', name: 'Energia' }], payees: [],
  gerencialGroups: [], reserveFunctions: [], tiposDocumento: [],
})
const sug = { tipo: 'despesa', valor: 250, data: '2026-11-12', conta_id: 'cc', categoria_id: 'luz', descricao: 'Energia', favorecido_novo: 'Cia', confianca: {}, termos: {}, repetir: 'monthly', repetir_dia: 10 }
afterEach(() => cleanup())

describe('11) prévia com cartões separados', () => {
  it('Despesa + agendamento: dois cartões e "Confirmar tudo"; desmarcar o agendamento = só a despesa', () => {
    render(<PreviaAssistente ferramenta="registrar_lancamento" sugestao={sug} textoOriginal="energia 250 e agende todo dia 10" onClose={() => {}} onToast={() => {}} guardarAoFechar={false} />)
    expect(screen.getByRole('region', { name: 'Cartão da despesa' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Cartão do agendamento' })).toBeTruthy()
    expect(screen.getByTestId('despesa').textContent).toBe('repetir=true freq=monthly botao=Confirmar tudo')
    fireEvent.change(screen.getByLabelText('Recorrência'), { target: { value: 'annual' } })
    expect(screen.getByTestId('despesa').textContent).toBe('repetir=true freq=annual botao=Confirmar tudo')
    const [, ag] = screen.getAllByRole('checkbox')
    fireEvent.click(ag)
    expect(screen.getByTestId('despesa').textContent).toBe('repetir=false freq=annual botao=Confirmar tudo')
  })
  it('desmarcar a despesa = só o agendamento (com o que estava no cartão)', () => {
    render(<PreviaAssistente ferramenta="registrar_lancamento" sugestao={sug} textoOriginal="x" onClose={() => {}} onToast={() => {}} guardarAoFechar={false} />)
    const [despesa] = screen.getAllByRole('checkbox')
    fireEvent.click(despesa)
    expect(screen.getByTestId('agendamento').textContent).toBe('AGENDAMENTO monthly 2026-11-10')
    expect(screen.getByText(/só o agendamento será gravado/)).toBeTruthy()
  })
})
