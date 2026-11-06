// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

const api = vi.hoisted(() => ({ salvar: vi.fn() }))
const app = vi.hoisted(() => ({}))
vi.mock('../../lib/bemApi', () => ({ salvarPlanoConsorcio: (b) => api.salvar(b) }))
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))
const { default: PlanoVendaConsorcio } = await import('./PlanoVendaConsorcio.jsx')

const cota = (numero, extra = {}) => ({ numero, valor_parcela_cheia: 400, percentual_parcela: 100, plano_mes: null, plano_valor: null, ...extra })
const proximo = (d) => { const x = new Date(); x.setMonth(x.getMonth() + d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}` }
const montar = (consorcio, props = {}) => render(<PlanoVendaConsorcio bemId="bem" consorcio={{ situacao: 'ativa', ...consorcio }} resumo={{ custoProprioLiquido: 900 }} pagasPorCota={null} podeEditar onMudou={vi.fn()} avisar={vi.fn()} {...props} />)

beforeEach(() => {
  api.salvar.mockReset()
  api.salvar.mockResolvedValue({ success: true })
  Object.assign(app, {
    reserveFunctions: [{ id: 'f', name: 'Função', accountId: 'res', saldoInicial: 1000 }, { id: 'x', name: 'De outra conta', accountId: 'nao_visivel' }],
    reservePeriods: [], reserveAdjustments: [], transactions: [], accounts: [{ id: 'res', isReserva: true }],
    schedules: [], scheduleReservaFuncoes: [], getNextOccurrences: () => [],
  })
})
afterEach(() => { cleanup() })

describe('Plano de venda na tela', () => {
  it('vazio por padrão: pede o mês e o valor', () => {
    montar({ cotas: [cota('1')] })
    expect(screen.getByTestId('plano-vazio')).toBeTruthy()
  })
  it('meses diferentes não avisam; mesmo mês acima do limite, sim', () => {
    const m1 = proximo(2)
    const m2 = proximo(3)
    montar({ cotas: [cota('1', { plano_mes: m1, plano_valor: 30000 }), cota('2', { plano_mes: m2, plano_valor: 30000 })] })
    expect(screen.getByTestId('plano-tabela')).toBeTruthy()
    expect(screen.queryByTestId('plano-aviso-isencao')).toBeNull()
    cleanup()
    montar({ cotas: [cota('1', { plano_mes: m1, plano_valor: 30000 }), cota('2', { plano_mes: m1, plano_valor: 30000 })] })
    expect(screen.getByTestId('plano-aviso-isencao').textContent).toMatch(/acima de R\$ 35\.000.*Confirme com seu contador/)
  })
  it('sem função: sem saldo nem gráfico; com função: aparecem', () => {
    const cotas = [cota('1', { plano_mes: proximo(1), plano_valor: 5000 })]
    montar({ cotas })
    expect(screen.queryByText('Saldo da função')).toBeNull()
    expect(screen.queryByTestId('plano-grafico')).toBeNull()
    expect(screen.getByTestId('plano-resultado').textContent).toMatch(/Ganho total/)
    cleanup()
    montar({ cotas, funcao_reserva_id: 'f' })
    expect(screen.getByText('Saldo da função')).toBeTruthy()
    expect(screen.getByTestId('plano-grafico')).toBeTruthy()
  })
  it('só oferece funções de contas que o usuário enxerga', () => {
    montar({ cotas: [cota('1')] })
    const opcoes = [...screen.getByLabelText(/Função de reserva/).querySelectorAll('option')].map(o => o.textContent)
    expect(opcoes).toEqual(['Nenhuma: mostrar só o bem', 'Função'])
  })
  it('consórcio vendido: cotas fora e nada a projetar', () => {
    montar({ situacao: 'vendida', cotas: [cota('1', { plano_mes: proximo(1), plano_valor: 5000 })] })
    expect(screen.getByTestId('plano-vazio').textContent).toMatch(/já foi vendido/)
  })
  it('marcar a cota como vendida tira da projeção na hora; salvar manda por cota', async () => {
    const cotas = [cota('1', { plano_mes: proximo(1), plano_valor: 5000 }), cota('2', { plano_mes: proximo(1), plano_valor: 6000 })]
    montar({ cotas })
    fireEvent.click(screen.getAllByLabelText(/Já vendida/)[0])
    expect(screen.getByTestId('plano-resultado').textContent).not.toMatch(/Cota 1/)
    fireEvent.click(screen.getByRole('button', { name: /Salvar plano/ }))
    await waitFor(() => expect(api.salvar).toHaveBeenCalledTimes(1))
    const b = api.salvar.mock.calls[0][0]
    expect(b.bem_id).toBe('bem')
    expect(b.cotas[0].vendida_em).toBeTruthy()
    expect(b.cotas[1]).toMatchObject({ numero: '2', vendida_em: null, plano_valor: 6000 })
  })
  it('sem permissão, não salva nem edita', () => {
    montar({ cotas: [cota('1')] }, { podeEditar: false })
    expect(screen.queryByRole('button', { name: /Salvar plano/ })).toBeNull()
    expect(screen.getByLabelText(/Mês previsto/).disabled).toBe(true)
  })
})
