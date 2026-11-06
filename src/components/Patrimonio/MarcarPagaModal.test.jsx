// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import MarcarPagaModal from './MarcarPagaModal'
import BemParcelasTab from './BemParcelasTab'
import { registrarBaixaBem } from '../../lib/bemApi'
import { espelharRegistro, espelharEstorno } from '../../lib/baixaSemMovimento'

vi.mock('../../lib/bemApi', () => ({ registrarBaixaBem: vi.fn() }))
vi.mock('../../context/AppContext', () => ({
  useApp: () => ({ payees: ['Fernando'], categories: [{ id: 'cat_b', name: 'Benefícios', type: 'income' }, { id: 'cat_d', name: 'Mercado', type: 'expense' }] }),
}))

afterEach(() => { cleanup(); vi.clearAllMocks() })

const abrir = (props = {}) => render(<MarcarPagaModal bemId="b" alvo={{ scheduleId: 's1', ocorrencia: '2026-11-10' }} valorSugerido={800} dataSugerida="2026-11-10" onCancel={() => {}} onSuccess={() => {}} {...props} />)

describe('Marcar como paga', () => {
  it('o motivo é obrigatório; terceiro pede quem pagou e só oferece categorias de receita', () => {
    abrir()
    expect(screen.getByLabelText(/Motivo/).required).toBe(true)
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: 'terceiro' } })
    expect(screen.getByLabelText(/Quem pagou/).required).toBe(true)
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('option', { name: 'Benefícios' })).toBeTruthy()
    expect(screen.queryByRole('option', { name: 'Mercado' })).toBeNull()
  })
  it('envia motivo, valor editado e a ocorrência', async () => {
    registrarBaixaBem.mockResolvedValue({ efeitos: {} })
    const onSuccess = vi.fn()
    abrir({ onSuccess })
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: 'conta_externa' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
    expect(registrarBaixaBem).toHaveBeenCalledWith(expect.objectContaining({
      bem_id: 'b', tipo: 'conta_externa', valor: 800, schedule_id: 's1', ocorrencia: '2026-11-10', gerar_receita: false,
    }))
  })
  it('crédito avulso não pede motivo, e o erro da API aparece', async () => {
    registrarBaixaBem.mockRejectedValue(new Error('falhou'))
    abrir({ alvo: {}, soCredito: true })
    expect(screen.queryByLabelText(/Motivo/)).toBeNull()
    expect(screen.getByText(/Valor do crédito/)).toBeTruthy()
    fireEvent.change(document.getElementById('baixa-valor'), { target: { value: '2,07' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(await screen.findByText('falhou')).toBeTruthy()
    expect(registrarBaixaBem.mock.calls[0][0]).toMatchObject({ tipo: 'credito', schedule_id: null })
  })
})

describe('Aba Parcelas', () => {
  const parcela = (extra) => ({ id: 'p', numero: 1, status: 'open', data_vencimento: '2026-11-10', principal_provisioned: 1, juros_provisioned: 0, total_provisioned: 1, total_pago: 0, ...extra })
  const tab = (p, onMarcarPaga = vi.fn()) => render(<BemParcelasTab financiamento={{ num_parcelas: 2, realizado: {}, analise: {} }} parcelas={[p]} page={1} totalPages={1} onPagar={() => {}} onMarcarPaga={onMarcarPaga} onPage={() => {}} />)
  it('parcela em aberto oferece marcar como paga', () => {
    const fn = vi.fn()
    tab(parcela(), fn)
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como paga' }))
    expect(fn).toHaveBeenCalled()
  })
  it('parcela já quitada sem lançamento mostra o selo do motivo, sem as ações', () => {
    tab(parcela({ status: 'paid', baixa_tipo: 'credito', saldo_restante: 0 }))
    expect(screen.getByText(/Crédito ou rendimento, sem lançamento em conta/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Marcar como paga' })).toBeNull()
  })
  it('parcela com pagamento parcial não oferece a baixa sem movimento', () => {
    tab(parcela({ status: 'partial' }))
    expect(screen.queryByRole('button', { name: 'Marcar como paga' })).toBeNull()
  })
})

describe('Espelho no estado do app', () => {
  it('registro: receita primeiro, agendamento e saldo copiado por último', () => {
    const ordem = []
    espelharRegistro({ lancamento: { id: 'l' }, agendamento: { id: 's', ocorrencia: 'd' }, bem: { id: 'b', saldo: 10 }, divida: { id: 'dv', saldo: -5 }, agendamentos_removidos: ['x'] }, {
      addTransaction: () => ordem.push('tx'), markScheduleRegistered: (i, o) => ordem.push(`ag:${i}:${o}`), deleteSchedule: (i) => ordem.push(`del:${i}`), atualizarSaldo: (i, v) => ordem.push(`${i}=${v}`),
    })
    expect(ordem).toEqual(['tx', 'ag:s:d', 'del:x', 'b=10', 'dv=-5'])
  })
  it('estorno: apaga a receita e reabre a ocorrência', () => {
    const updateSchedule = vi.fn(); const deleteTransaction = vi.fn(); const atualizarSaldo = vi.fn()
    espelharEstorno({ lancamento_removido: 'l', agendamento: { id: 's', ocorrencia: '2026-11-10' }, bem: { id: 'b', saldo: 0 } }, {
      deleteTransaction, updateSchedule, atualizarSaldo, schedules: [{ id: 's', frequency: 'monthly', registered: ['2026-11-10'], nextOccurrence: '2026-12-10' }],
    })
    expect(deleteTransaction).toHaveBeenCalledWith('l')
    expect(updateSchedule).toHaveBeenCalledWith('s', expect.objectContaining({ registered: [], nextOccurrence: '2026-11-10' }))
    expect(atualizarSaldo).toHaveBeenCalledWith('b', 0)
  })
})
