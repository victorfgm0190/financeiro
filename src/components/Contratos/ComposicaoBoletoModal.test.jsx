// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

// Composição do boleto: colar o texto do app do condomínio, classificar pelas regras, fechar a soma
// com o valor pago e confirmar → itens do proprietário = 104,85.
const app = vi.hoisted(() => ({}))
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))
const { default: ComposicaoBoletoModal } = await import('./ComposicaoBoletoModal.jsx')

const BOLETO = `Taxa de Condomínio 795,11
Espaço Gourmet (16/09/2026-Espaço Gourmet Seg T Q Qui - 1) 243,15
Taxa de Mudança (04/09/2026- Mudança - 08:00 as 12:00) 162,10
Fundo de Reserva 79,10
Controle 70,00
Água M³: 552,7500(Set)-543,7900(Ago)= 8,9600 49,46
Fundo Trabalhista 25,75
Encargos 0,00`

afterEach(cleanup)

describe('ComposicaoBoletoModal', () => {
  it('colar → regras → itens sem regra do inquilino → confirmar (proprietário 104,85)', async () => {
    Object.assign(app, {
      regrasContratos: [
        { id: 'g1', contrato_id: null, padrao: 'fundo de reserva', tipo_match: 'comeca_com', responsavel: 'proprietario' },
        { id: 'g2', contrato_id: null, padrao: 'fundo trabalhista', tipo_match: 'comeca_com', responsavel: 'proprietario' },
      ],
    })
    const onConfirmar = vi.fn(async () => {})
    render(<ComposicaoBoletoModal contrato={{ id: 'c1', objeto: 'Apto' }} tx={{ id: 't', date: '2026-10-08', amount: 1424.67 }}
      modo="pagamento" onConfirmar={onConfirmar} onPular={() => {}} onClose={() => {}} />)

    fireEvent.change(screen.getByPlaceholderText(/Cole aqui o texto/), { target: { value: BOLETO } })
    fireEvent.click(screen.getByRole('button', { name: 'Ler texto' }))
    expect(screen.getAllByText(/Sem regra — de quem é\?/)).toHaveLength(6)
    expect(screen.getByRole('button', { name: 'Confirmar composição' }).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Itens sem regra são do inquilino' }))
    const confirmar = screen.getByRole('button', { name: 'Confirmar composição' })
    expect(confirmar.disabled).toBe(false)
    fireEvent.click(confirmar)
    await vi.waitFor(() => expect(onConfirmar).toHaveBeenCalled())
    const { composicao, itens } = onConfirmar.mock.calls[0][0]
    expect(itens).toHaveLength(8)
    expect(composicao).toMatchObject({ tipo: 'condominio', total: 1424.67, proprietario: 104.85, inquilino: 1319.82 })
  })

  it('soma diferente do pago: não confirma até criar o item de diferença', async () => {
    Object.assign(app, { regrasContratos: [] })
    const onConfirmar = vi.fn(async () => {})
    render(<ComposicaoBoletoModal contrato={{ id: 'c1' }} tx={{ id: 't', date: '2026-10-08', amount: 100.05 }}
      modo="pagamento" onConfirmar={onConfirmar} onPular={() => {}} onClose={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText(/Cole aqui o texto/), { target: { value: 'Taxa 100,00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ler texto' }))
    fireEvent.click(screen.getByRole('button', { name: 'Itens sem regra são do inquilino' }))
    expect(screen.getByRole('button', { name: 'Confirmar composição' }).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /Criar item "Diferença\/arredondamento"/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar composição' }))
    await vi.waitFor(() => expect(onConfirmar).toHaveBeenCalled())
    expect(onConfirmar.mock.calls[0][0].composicao.total).toBe(100.05)
  })
})
