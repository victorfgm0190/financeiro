// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

// Despesa de cartão: "Será pago com reserva" define a Classificação gerencial (e o inverso), sem
// perder a função escolhida ao trocar de caminho (src/lib/reservaGerencialForm.js). Cadastro
// genérico: grupo 2 → reserva A (2 funções), 3 → reserva B (1 função), 4 → conta comum.
const app = vi.hoisted(() => ({}))
const tela = vi.hoisted(() => ({ mobile: false }))
vi.mock('../../context/AppContext', () => ({ useApp: () => app, isResgatePago: () => false }))
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => tela.mobile }))
const { default: TransactionForm } = await import('./TransactionForm.jsx')

const gerencialGroups = [
  { id: 'gD', number: 'D', name: 'Despesa' }, { id: 'g1', number: 1, name: 'Gerencial' },
  { id: 'g2', number: 2, name: 'Anuais', defaultAccountId: 'resA' }, { id: 'g3', number: 3, name: 'Loja', defaultAccountId: 'resB' },
  { id: 'g4', number: 4, name: 'Outro', defaultAccountId: 'comum' },
]
const accounts = [
  { id: 'card', name: 'Cartão X', type: 'credit', closingDay: 5, dueDay: 12 },
  { id: 'comum', name: 'Comum', type: 'checking' },
  { id: 'resA', name: 'Reserva A', isReserva: true }, { id: 'resB', name: 'Reserva B', isReserva: true },
]
const reserveFunctions = [
  { id: 'fA1', name: 'Férias', accountId: 'resA' }, { id: 'fA2', name: 'Fralda', accountId: 'resA' },
  { id: 'fB', name: 'Única B', accountId: 'resB' },
]

function abrir(initial = { type: 'expense', accountId: 'card', amount: 50, description: 'Compra' }) {
  Object.assign(app, {
    accounts, accountGroups: [], categories: [], costCenters: [], payees: [], transactions: [], schedules: [],
    gerencialGroups, reserveFunctions, settings: { controleGerencial: true }, profiles: [], tiposDocumento: [],
    rateiosByLancamento: new Map(), findLinkedResgate: () => null, pode: () => true, temHistorico: () => false,
    activeProfileId: null, categoryGroupOrder: [],
  })
  return render(<TransactionForm initial={initial} onClose={() => {}} onToast={() => {}} preLancamentos={[]} />)
}
const chave = () => screen.getByText('Será pago com reserva').closest('label').querySelector('input')
const selectApos = (texto) => screen.getByText(texto).nextElementSibling
const classificacao = () => screen.getByText('Classificação Gerencial').nextElementSibling
const travada = () => screen.queryByText('definida pela reserva')

afterEach(cleanup)

describe.each([['desktop', false], ['celular', true]])('TransactionForm (%s): reserva × classificação', (_, mobile) => {
  it('reserva A → classificação 2 travada, pede a função; Férias se mantém', () => {
    tela.mobile = mobile
    abrir()
    fireEvent.click(chave())
    fireEvent.change(selectApos('Conta de Reserva'), { target: { value: 'resA' } })
    expect(travada()).toBeTruthy()
    expect(classificacao().textContent).toMatch(/2 · Anuais/)
    expect(selectApos('Função de Reserva').value).toBe('')
    expect([...selectApos('Função de Reserva').options].some(o => /Sem função/.test(o.text))).toBe(false)
    fireEvent.change(selectApos('Função de Reserva'), { target: { value: 'fA1' } })
    expect(selectApos('Função de Reserva').value).toBe('fA1')
  })

  it('reserva B → classificação 3 travada e a única função já escolhida', () => {
    tela.mobile = mobile
    abrir()
    fireEvent.click(chave())
    fireEvent.change(selectApos('Conta de Reserva'), { target: { value: 'resB' } })
    expect(classificacao().textContent).toMatch(/3 · Loja/)
    expect(selectApos('Função de Reserva').value).toBe('fB')
  })

  it('classificação 2 lá embaixo → liga a reserva A e pede só a função', () => {
    tela.mobile = mobile
    abrir()
    fireEvent.change(classificacao(), { target: { value: 'g2' } })
    expect(chave().checked).toBe(true)
    expect(selectApos('Conta de Reserva').value).toBe('resA')
    expect(travada()).toBeTruthy()
  })

  it('classificação 4 → nada muda; desligar a reserva → volta para D', () => {
    tela.mobile = mobile
    abrir()
    fireEvent.change(classificacao(), { target: { value: 'g4' } })
    expect(chave().checked).toBe(false)
    expect(classificacao().value).toBe('g4')
    fireEvent.change(classificacao(), { target: { value: 'g2' } })
    fireEvent.click(chave())
    expect(chave().checked).toBe(false)
    expect(travada()).toBeNull()
    expect(classificacao().value).toBe('gD')
  })

  it('vídeo: reserva → A → Férias → mexer na classificação/reserva não perde nada', () => {
    tela.mobile = mobile
    abrir()
    fireEvent.click(chave())
    fireEvent.change(selectApos('Conta de Reserva'), { target: { value: 'resA' } })
    fireEvent.change(selectApos('Função de Reserva'), { target: { value: 'fA1' } })
    // a classificação está travada (não há select para mexer) e o interruptor continua ligado
    expect(classificacao().tagName).not.toBe('SELECT')
    expect(chave().checked).toBe(true)
    // trocar de reserva e voltar devolve Férias
    fireEvent.change(selectApos('Conta de Reserva'), { target: { value: 'resB' } })
    fireEvent.change(selectApos('Conta de Reserva'), { target: { value: 'resA' } })
    expect(selectApos('Função de Reserva').value).toBe('fA1')
    // desligar e ligar de novo na mesma reserva também
    fireEvent.click(chave())
    fireEvent.click(chave())
    fireEvent.change(selectApos('Conta de Reserva'), { target: { value: 'resA' } })
    expect(selectApos('Função de Reserva').value).toBe('fA1')
  })
})

describe('edição de lançamento divergente', () => {
  it('grupo 3 com função da reserva A: abre como gravado e só avisa', () => {
    tela.mobile = false
    abrir({ id: 'tx1', type: 'expense', accountId: 'card', amount: 34.99, date: '2026-05-15', description: 'Compra 5/5', grupoGerencial: 'g3', reservaFuncaoId: 'fA2', faturaMonthYear: '2026-06' })
    expect(chave().checked).toBe(true)
    expect(selectApos('Conta de Reserva').value).toBe('resB')
    expect(selectApos('Função de Reserva').value).toBe('fA2')
    expect(screen.getByText(/Fralda.*Reserva A.*Reserva B/)).toBeTruthy()
  })
})
