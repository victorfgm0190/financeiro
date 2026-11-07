// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

// Dados fictícios. Pergunta da regra C: repasse registrado com valor diferente do calculado.
const PEND = { chave: 'repasse:t1', tipo: 'ajuste_repasse', contratoId: 'c9', parcelaId: 'p1', txId: 't1', competencia: '2026-06', calculado: 1370.65, real: 1360, diferenca: -10.65 }
const responderAjusteRepasse = vi.fn(async () => {})
const resolverPendenciaContrato = vi.fn()
const app = {
  contratosHabilitado: true, pendenciasContrato: [PEND], resolverPendenciaContrato, responderAjusteRepasse,
  contratoPorId: () => ({ id: 'c9', objeto: 'Imóvel Exemplo' }), schedules: [{ id: 'p1' }], transactions: [{ id: 't1', amount: 1360 }],
}
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))
const { default: ContratoEfetivacaoHost } = await import('./ContratoEfetivacaoHost.jsx')

afterEach(() => { cleanup(); responderAjusteRepasse.mockClear(); resolverPendenciaContrato.mockClear() })

describe('regra C — repasse com valor diferente', () => {
  it('pergunta "Criar ajuste de R$ X na competência?"; Sim cria o ajuste', async () => {
    render(<ContratoEfetivacaoHost />)
    expect(screen.getByText(/Criar ajuste de −R\$\s10,65 na competência\?/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Sim — criar o ajuste/ }))
    await vi.waitFor(() => expect(responderAjusteRepasse).toHaveBeenCalledWith(PEND, true))
    await vi.waitFor(() => expect(resolverPendenciaContrato).toHaveBeenCalledWith('repasse:t1'))
  })

  it('Não: o valor real fica e a diferença passa para a seguinte', async () => {
    render(<ContratoEfetivacaoHost />)
    fireEvent.click(screen.getByRole('button', { name: /Não — o valor recebido fica/ }))
    await vi.waitFor(() => expect(responderAjusteRepasse).toHaveBeenCalledWith(PEND, false))
  })
})
