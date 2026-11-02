// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

// Card da consulta de agendamento: números da lib, escolha por botão no empate, "não achei" pede
// detalhe, "Abrir o agendamento" deixa o handoff para a tela de Agendamentos. Dados FICTÍCIOS.
const app = vi.hoisted(() => ({}))
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))
vi.mock('../../lib/saldos', () => ({ hojeStr: () => '2026-11-02' }))
const { default: ConsultaAgendamento } = await import('./ConsultaAgendamento.jsx')
const { ABRIR_AGENDAMENTO_KEY, EVENTO_NAVEGAR } = await import('../../lib/abrirTela')

const base = { transactionType: 'expense', accountId: 'c1', overrides: {}, registered: [], skipped: [], frequency: 'monthly' }
const tv = {
  ...base, id: 'tv', description: 'TV SALA', payee: 'João Pedro Exemplo', amount: 150, startDate: '2026-06-20',
  occurrenceType: 'installment', installments: 8, nextOccurrence: '2026-11-20',
  registered: ['2026-06-20', '2026-07-20', '2026-08-20', '2026-09-20', '2026-10-20'],
}
const aluguel = { ...base, id: 'alu', description: 'ALUGUEL SALA', payee: 'João Pedro Exemplo', amount: 900, startDate: '2026-01-05', occurrenceType: 'continuous', nextOccurrence: '2026-11-05' }

beforeEach(() => Object.assign(app, { profileSchedules: [tv, aluguel], transactions: [] }))
afterEach(() => { cleanup(); sessionStorage.clear() })
const props = { onClose: vi.fn(), onNovo: vi.fn() }

describe('ConsultaAgendamento', () => {
  it('parcelado: resposta, pagas/restantes/total, datas, total restante e última parcela', () => {
    render(<ConsultaAgendamento parametros={{ descricao: 'TV Sala', favorecido: 'João Pedro Exemplo' }} textoOriginal="dívida com João chamada TV Sala, quantas parcelas faltam?" {...props} />)
    expect(screen.getByText('Faltam 3 de 8 parcelas de TV SALA: 20/11/2026, 20/12/2026 e 20/01/2027. Total restante: R$ 450,00.')).toBeTruthy()
    const card = screen.getByTestId('card-agendamento')
    expect(card.textContent).toMatch(/Pagas5/)
    expect(card.textContent).toMatch(/Restantes3/)
    expect(card.textContent).toMatch(/Total8/)
    expect(card.textContent).toMatch(/Última parcela20\/01\/2027/)
    expect(card.textContent).toMatch(/6\/8/)
    // Nada de lançamento sem relação: só o agendamento consultado.
    expect(card.textContent).not.toMatch(/ALUGUEL/)
  })

  it('empate: pergunta com botões e mostra o card do escolhido', () => {
    render(<ConsultaAgendamento parametros={{ descricao: 'sala', favorecido: null }} textoOriginal="situação da sala?" {...props} />)
    expect(screen.getByText(/Achei 2 agendamentos parecidos/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /ALUGUEL SALA/ }))
    expect(screen.getByText(/ALUGUEL SALA é recorrente \(mensal\) e não tem número final de parcelas/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar à lista' }))
    expect(screen.getByText(/Achei 2 agendamentos parecidos/)).toBeTruthy()
  })

  it('nenhum: pede mais um detalhe e procura de novo', () => {
    render(<ConsultaAgendamento parametros={{ descricao: 'piscina', favorecido: null }} textoOriginal="quanto falta da piscina?" {...props} />)
    expect(screen.getByText(/Não achei agendamento com “piscina”/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Detalhe do agendamento'), { target: { value: 'tv' } })
    fireEvent.click(screen.getByRole('button', { name: 'Procurar' }))
    expect(screen.getByText(/^Faltam 3 de 8 parcelas de TV SALA/)).toBeTruthy()
  })

  it('perfil sem o agendamento (isolamento): não acha', () => {
    app.profileSchedules = [aluguel]
    render(<ConsultaAgendamento parametros={{ descricao: 'TV Sala', favorecido: null }} textoOriginal="quantas parcelas faltam da TV?" {...props} />)
    expect(screen.queryByText(/Faltam/)).toBeNull()
  })

  it('Abrir o agendamento: handoff para o Editar e navegação', () => {
    const nav = vi.fn()
    window.addEventListener(EVENTO_NAVEGAR, nav)
    render(<ConsultaAgendamento parametros={{ descricao: 'TV Sala', favorecido: null }} textoOriginal="quantas parcelas faltam da TV Sala?" {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /Abrir o agendamento/ }))
    expect(JSON.parse(sessionStorage.getItem(ABRIR_AGENDAMENTO_KEY))).toEqual({ scheduleId: 'tv' })
    expect(nav.mock.calls[0][0].detail).toEqual({ page: 'schedule' })
    expect(props.onClose).toHaveBeenCalled()
    window.removeEventListener(EVENTO_NAVEGAR, nav)
  })
})
