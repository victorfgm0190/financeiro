// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import PagarParcelaModal from './PagarParcelaModal'
import { pagarParcela } from '../../lib/bemApi'

vi.mock('../../lib/bemApi', () => ({ pagarParcela: vi.fn() }))

const parcela = {
  id: 'p1', numero: 1, data_vencimento: '2026-11-10', total_provisioned: 6000, principal_provisioned: 5000,
  juros_provisioned: 1000, total_pago: 0, principal_pago: 0, juros_pago: 0,
}
const abrir = (props = {}) => render(
  <PagarParcelaModal
    bem={{ nome: 'Carro' }} financiamento={{ num_parcelas: 10, conta_origem_id: 'itau' }} parcela={parcela}
    contasCorrentes={[{ id: 'itau', name: 'Itaú' }]} onCancel={() => {}} onSuccess={() => {}} onErro={() => {}} {...props}
  />,
)

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('Pagar parcela pela aba Parcelas', () => {
  it('debita a conta de origem, como a baixa por Contas a Pagar', async () => {
    const resposta = { parcela: { status: 'paid' } }
    pagarParcela.mockResolvedValue(resposta)
    const onSuccess = vi.fn()
    abrir({ onSuccess })
    fireEvent.click(screen.getByRole('button', { name: /^Pagar/ }))
    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
    expect(pagarParcela).toHaveBeenCalledWith('p1', expect.objectContaining({ conta_origem_id: 'itau', debitar_origem: true }))
    expect(onSuccess.mock.calls[0][0]).toBe(resposta)
    expect(onSuccess.mock.calls[0][1].contaOrigemId).toBe('itau')
  })
  it('sem conta de origem, não envia', () => {
    abrir({ financiamento: { num_parcelas: 10 } })
    expect(screen.getByRole('button', { name: /^Pagar/ }).disabled).toBe(true)
  })
})
