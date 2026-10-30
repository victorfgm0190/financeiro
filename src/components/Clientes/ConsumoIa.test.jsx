// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

// Consumo de IA: sem preço mostra só tokens + "cadastre o preço"; com preço, US$ e R$ pela PTAX.
const api = vi.hoisted(() => ({ consumoIa: vi.fn(), salvarPrecoIa: vi.fn(async () => ({ ok: true })), excluirPrecoIa: vi.fn() }))
vi.mock('../../lib/clientesApi', () => api)
const { default: ConsumoIa } = await import('./ConsumoIa.jsx')

const grupo = { ambiente: 'vm', dia: '2026-10-30', ferramenta: 'lote', modelo: 'm1', chamadas: 2, entrada: 2_000_000, leitura: 0, criacao: 0, saida: 0, imagens: 1, duracaoSoma: 40000, duracaoN: 2, cortadas: 1 }
const resposta = (precos) => ({
  ambientes: [{ sigla: 'vm', nome: 'Principal' }, { sigla: 'cv', nome: 'Cliente CV' }],
  grupos: [grupo], falhas: [], precos, semTabelaPrecos: false, ptax: { data: '2026-10-30', venda: 5 },
})

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('ConsumoIa', () => {
  it('sem preço: tokens, aviso "cadastre o preço" e custo vazio', async () => {
    api.consumoIa.mockResolvedValue(resposta([]))
    render(<ConsumoIa />)
    expect(await screen.findByText(/Cadastre o preço do modelo/)).toBeTruthy()
    expect(api.consumoIa).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-01$/), expect.any(String), '')
    expect(screen.getAllByText('2.000.000').length).toBeGreaterThan(0)
    expect(screen.getByText('Custo estimado (US$)').nextElementSibling.textContent).toBe('—')
    expect(screen.getByText('Cortadas (max_tokens)').nextElementSibling.textContent).toBe('1')
    expect(screen.getByText(/O valor cobrado está no Console da Anthropic/)).toBeTruthy()
  })

  it('com preço: custo em US$ e R$ (PTAX e data mostradas), tempo médio', async () => {
    api.consumoIa.mockResolvedValue(resposta([{ id: 'p1', modelo: 'm1', vigencia: '2026-10-01', entrada: 1, saida: 5, cache_leitura: null, cache_criacao: null }]))
    render(<ConsumoIa />)
    await screen.findByText('Custo estimado (US$)')
    expect(screen.getByText('Custo estimado (US$)').nextElementSibling.textContent).toBe('US$ 2,00')
    expect(screen.getByText('Custo estimado (R$)').nextElementSibling.textContent).toMatch(/10,00/)
    expect(screen.getByText(/PTAX 5,0000 de 30\/10\/2026/)).toBeTruthy()
    expect(screen.getByText('Tempo médio de resposta').nextElementSibling.textContent).toBe('20 s')
    expect(screen.queryByText(/Cadastre o preço/)).toBeNull()
  })

  it('filtro por cliente e cadastro de preço', async () => {
    api.consumoIa.mockResolvedValue(resposta([]))
    render(<ConsumoIa />)
    await screen.findByText(/Cadastre o preço/)
    fireEvent.change(screen.getByLabelText('Cliente'), { target: { value: 'cv' } })
    await vi.waitFor(() => expect(api.consumoIa).toHaveBeenLastCalledWith(expect.any(String), expect.any(String), 'cv'))
    fireEvent.change(screen.getByLabelText('Modelo'), { target: { value: 'm1' } })
    fireEvent.change(screen.getByLabelText('Vigência'), { target: { value: '2026-10-01' } })
    fireEvent.change(screen.getByLabelText('Saída'), { target: { value: '5,5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar preço' }))
    await vi.waitFor(() => expect(api.salvarPrecoIa).toHaveBeenCalledWith({ modelo: 'm1', vigencia: '2026-10-01', entrada: null, saida: 5.5, cache_leitura: null, cache_criacao: null }))
  })
})
