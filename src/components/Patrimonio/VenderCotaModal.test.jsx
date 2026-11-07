// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

const api = vi.hoisted(() => ({ previa: vi.fn(), registrar: vi.fn() }))
const app = vi.hoisted(() => ({}))
vi.mock('../../lib/bemApi', () => ({ previaVendaCota: (b) => api.previa(b), registrarEventoConsorcio: (b) => api.registrar(b) }))
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))
const { default: VenderCotaModal } = await import('./VenderCotaModal.jsx')

const cota = (numero) => ({ numero, valor_parcela_cheia: 500, percentual_parcela: 100 })
const cotas = [cota('1'), cota('2'), cota('3')]
const agendamento = { id: 's', description: 'Parcelas', amount: 1500, transactionType: 'transfer', toAccountId: 'bem', registered: [], skipped: [], overrides: {} }
const previa = { custo_estimado: 3000, custo: 3000, resultado: 2000, aviso_isencao: null, categorias: { ganho: 'g', perda: 'p' }, funcao: null }

beforeEach(() => {
  api.previa.mockReset(); api.registrar.mockReset()
  api.previa.mockResolvedValue(previa)
  api.registrar.mockResolvedValue({ evento_id: 'e', efeitos: { lancamentos: [{ id: 'l1' }], saldo: 6000 } })
  Object.assign(app, {
    accounts: [{ id: 'cc', name: 'Conta', type: 'checking' }, { id: 'c', name: 'Visa', type: 'credit' }],
    categories: [], payees: [], schedules: [agendamento], activeProfileId: null, categoryGroupOrder: [],
    getNextOccurrences: () => ['2099-01-15'], addTransaction: vi.fn(), updateAccount: vi.fn(), updateSchedule: vi.fn(), addPayee: vi.fn(),
  })
})
afterEach(() => { cleanup() })

const abrir = async (onVendida = vi.fn()) => {
  render(<VenderCotaModal bemId="bem" cota={cotas[0]} cotas={cotas} onCancelar={vi.fn()} onVendida={onVendida} />)
  await screen.findByTestId('cota-previa')
}

describe('Vender cota na tela', () => {
  it('mostra o custo estimado, editável, e o que muda nos agendamentos', async () => {
    await abrir()
    expect(screen.getByTestId('cota-previa').textContent).toMatch(/3\.000,00/)
    expect(screen.getByLabelText(/Custo da cota/).value).toContain('3.000')
    expect(screen.getByTestId('cota-agendamentos').textContent).toMatch(/Parcelas: R\$\s*1\.500,00 → R\$\s*1\.000,00/)
    const opcoes = [...screen.getByLabelText(/Conta onde o dinheiro entrou/).querySelectorAll('option')].map(o => o.textContent)
    expect(opcoes).toEqual(['Escolha…', 'Conta'])
  })
  it('aviso de isenção e função vinculada aparecem na prévia', async () => {
    api.previa.mockResolvedValue({ ...previa, aviso_isencao: 'Vendas no mesmo mês acima de R$ 35.000', funcao: { id: 'f', nome: 'Carro' } })
    await abrir()
    expect(screen.getByTestId('cota-aviso-isencao').textContent).toMatch(/35\.000/)
    expect(screen.getByTestId('cota-previa').textContent).toMatch(/função Carro/)
  })
  it('confirmar manda a venda e a foto, e espelha no app', async () => {
    const onVendida = vi.fn()
    await abrir(onVendida)
    fireEvent.change(screen.getByLabelText(/Valor recebido/), { target: { value: '5000' } })
    fireEvent.change(screen.getByLabelText(/Conta onde o dinheiro entrou/), { target: { value: 'cc' } })
    const botao = screen.getByRole('button', { name: /Confirmar venda/ })
    await waitFor(() => expect(botao.disabled).toBe(false))
    fireEvent.click(botao)
    await waitFor(() => expect(onVendida).toHaveBeenCalled())
    const b = api.registrar.mock.calls[0][0]
    expect(b).toMatchObject({ bem_id: 'bem', tipo: 'vender_cota' })
    expect(b.dados).toMatchObject({ cota_numero: '1', conta_destino_id: 'cc' })
    expect(b.agendamentos.map(a => a.id)).toEqual(['s'])
    expect(app.addTransaction).toHaveBeenCalledWith({ id: 'l1' })
    expect(app.updateAccount).toHaveBeenCalledWith('bem', { balance: 6000 })
    expect(app.updateSchedule.mock.calls[0][0]).toBe('s')
    expect(app.updateSchedule.mock.calls[0][1].amount).toBe(1000)
  })
})
