// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

const api = vi.hoisted(() => ({ vender: vi.fn() }))
const app = vi.hoisted(() => ({}))
vi.mock('../../lib/bemApi', () => ({ venderBem: (...a) => api.vender(...a) }))
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))
const { default: VendaDoBem } = await import('./VendaDoBem.jsx')

const conta = { id: 'bem', name: 'Carro' }
const previa = { saldo_contabil: 50000, resultado: 8000, divida: { saldo_devedor: 20000, parcelas_abertas: 4, agendamentos: ['s1'] }, categorias: { ganho: 'g', perda: 'p' } }
const montar = (bem = { foi_vendido: false }, props = {}) => render(<VendaDoBem conta={conta} bem={bem} podeVender podeEstornar onMudou={vi.fn()} avisar={vi.fn()} {...props} />)

beforeEach(() => {
  api.vender.mockReset()
  api.vender.mockImplementation(async (_id, b) => (b.acao === 'previa' ? previa : b.acao === 'consultar'
    ? { venda: { id: 'v', data: '2026-10-15', valor: 58000, resultado: 8000, comprador: 'Fulano', divida_aberta: 20000 } }
    : { venda: {}, efeitos: { lancamentos: [{ id: 'l1' }], saldo: 0, conta: { foiVendido: true, dataVenda: '2026-10-15' }, divida: { id: 'd', saldo: 0 }, agendamentos: [{ id: 's1', occurrenceType: 'continuous' }] } }))
  Object.assign(app, {
    accounts: [{ id: 'cc', name: 'Conta', type: 'checking' }, { id: 'c', name: 'Visa', type: 'credit' }, { id: 'b2', name: 'Outro bem', type: 'asset' }],
    categories: [], payees: [], activeProfileId: null, categoryGroupOrder: [],
    schedules: [{ id: 's1', description: 'Parcela', amount: 500, transactionType: 'expense' }, { id: 's2', description: 'Sem relação', amount: 5, transactionType: 'expense' }],
    getNextOccurrences: () => ['2026-11-01'], addTransaction: vi.fn(), deleteTransaction: vi.fn(), updateAccount: vi.fn(), updateSchedule: vi.fn(), addPayee: vi.fn(),
  })
})
afterEach(() => { cleanup() })

describe('venda na tela', () => {
  const abrir = async () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: /Vender/ }))
    await screen.findByTestId('venda-previa')
  }
  it('sem permissão, não há botão', () => {
    montar({ foi_vendido: false }, { podeVender: false })
    expect(screen.queryByRole('button', { name: /Vender/ })).toBeNull()
  })
  it('só contas que não são cartão nem bem; mostra a dívida e os agendamentos ligados', async () => {
    await abrir()
    const opcoes = [...screen.getByLabelText(/Conta onde o dinheiro entrou/).querySelectorAll('option')].map(o => o.textContent)
    expect(opcoes).toEqual(['Escolha…', 'Conta'])
    expect(screen.getByTestId('venda-divida').textContent).toMatch(/20\.000,00/)
    const ag = screen.getByTestId('venda-agendamentos').textContent
    expect(ag).toMatch(/Parcela/)
    expect(ag).not.toMatch(/Sem relação/)
  })
  it('sem quitar, avisa que a dívida continua', async () => {
    await abrir()
    fireEvent.click(screen.getByLabelText(/Quitar com o dinheiro da venda/))
    expect(screen.getByTestId('venda-divida').textContent).toMatch(/dívida continua aberta/)
  })
  it('confirmar espelha o resultado no app e encerra os agendamentos marcados', async () => {
    await abrir()
    fireEvent.change(screen.getByLabelText(/Valor recebido/), { target: { value: '58000' } })
    fireEvent.change(screen.getByLabelText(/Conta onde o dinheiro entrou/), { target: { value: 'cc' } })
    const botao = screen.getByRole('button', { name: /Confirmar venda/ })
    await waitFor(() => expect(botao.disabled).toBe(false))
    fireEvent.click(botao)
    await waitFor(() => expect(app.addTransaction).toHaveBeenCalledWith({ id: 'l1' }))
    const pedido = api.vender.mock.calls.find(c => c[1].acao === 'confirmar')[1]
    expect(pedido).toMatchObject({ quitar: true, conta_destino_id: 'cc' })
    expect(pedido.agendamentos.map(a => a.id)).toEqual(['s1'])
    expect(app.updateAccount).toHaveBeenCalledWith('bem', { balance: 0, foiVendido: true, dataVenda: '2026-10-15' })
    expect(app.updateAccount).toHaveBeenCalledWith('d', { balance: 0 })
    expect(app.updateSchedule.mock.calls.map(c => c[0])).toEqual(['s1'])
  })
  it('bem vendido: mostra a venda e o estorno devolve tudo ao app', async () => {
    const onMudou = vi.fn()
    montar({ foi_vendido: true }, { onMudou })
    const resumo = await screen.findByTestId('venda-resumo')
    expect(resumo.textContent).toMatch(/Fulano/)
    expect(resumo.textContent).toMatch(/dívida aberta/)
    api.vender.mockResolvedValueOnce({ efeitos: { lancamentos: ['l1'], saldo: 50000, conta: { foiVendido: false, dataVenda: null }, divida: null, agendamentos: [{ id: 's1', occurrenceType: 'continuous' }] } })
    fireEvent.click(screen.getByRole('button', { name: /Estornar venda/ }))
    await waitFor(() => expect(onMudou).toHaveBeenCalled())
    expect(app.deleteTransaction).toHaveBeenCalledWith('l1')
    expect(app.updateAccount).toHaveBeenCalledWith('bem', { balance: 50000, foiVendido: false, dataVenda: null })
    expect(app.updateSchedule).toHaveBeenCalledWith('s1', { occurrenceType: 'continuous' })
  })
})
