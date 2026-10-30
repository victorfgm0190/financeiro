// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

// Lote que não leu tudo: aviso "Li X de N", o trecho que faltou e "Enviar o restante", que manda só
// o trecho e junta os itens novos na mesma lista.
const app = vi.hoisted(() => ({}))
const api = vi.hoisted(() => ({ interpretar: vi.fn() }))
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))
vi.mock('../../lib/assistenteApi', () => ({
  interpretar: (...a) => api.interpretar(...a), listarPreLancamentos: async () => [], guardarPreLancamento: async () => ({}),
}))
const { default: LoteAssistente } = await import('./LoteAssistente.jsx')

Object.assign(app, {
  accounts: [{ id: 'nubank', name: 'Nubank', type: 'credit', closingDay: 1 }], activeProfileId: 'PV', transactions: [], schedules: [],
  getNextOccurrences: () => [], categories: [{ id: 'comb', name: 'Combustível' }], gerencialGroups: [], settings: {},
  addTransaction: vi.fn(), payees: [], addPayee: vi.fn(),
})
const item = (valor, descricao, extra = {}) => ({
  ferramenta: 'registrar_lancamento',
  parametros: { tipo: 'despesa', valor, data: '2026-10-29', conta_id: 'nubank', categoria_id: 'comb', descricao, confianca: { valor: 1, data: 1, conta: 1, categoria: 1, descricao: 1 }, ...extra },
})

afterEach(cleanup)

describe('LoteAssistente: movimentos que faltaram', () => {
  it('mostra "Li 2 de 4", o trecho e junta o restante na lista', async () => {
    api.interpretar.mockResolvedValueOnce({ ferramenta: 'lote', itens: [item(12.9, 'Delivery D'), item(153.4, 'Mercado E')], faltantes: null })
    render(<LoteAssistente itens={[item(298.16, 'Posto A'), item(70, 'Barbearia B')]} faltantes={{ lidos: 2, total: 4, trecho: 'R$ 12,90 Delivery D\nR$ 153,40 Mercado E' }}
      textoOriginal="..." onClose={() => {}} onToast={() => {}} onNovo={() => {}} />)
    expect(screen.getByText('Li 2 de 4 movimentos.')).toBeTruthy()
    expect(screen.getByText(/R\$ 12,90 Delivery D/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Enviar o restante/ }))
    expect(screen.getByText('Lendo 2 movimentos…')).toBeTruthy()
    expect(api.interpretar).toHaveBeenCalledWith({ texto: 'R$ 12,90 Delivery D\nR$ 153,40 Mercado E', perfilAtivo: 'PV' })
    await screen.findByText('Mercado E')
    expect(screen.getByText('4 lançamentos encontrados. Nada foi salvo ainda.')).toBeTruthy()
    expect(screen.queryByText(/Li 2 de 4/)).toBeNull()
  })

  it('sem trecho certo: só o aviso, sem botão', () => {
    render(<LoteAssistente itens={[item(298.16, 'Posto A'), item(70, 'Barbearia B')]} faltantes={{ lidos: 2, total: 5, trecho: null }}
      textoOriginal="..." onClose={() => {}} onToast={() => {}} onNovo={() => {}} />)
    expect(screen.getByText('Li 2 de 5 movimentos.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Enviar o restante/ })).toBeNull()
  })

  it('selo diz qual campo revisar', () => {
    render(<LoteAssistente itens={[item(298.16, 'Posto A', { categoria_id: null }), item(70, 'Barbearia B')]} textoOriginal="..." onClose={() => {}} onToast={() => {}} onNovo={() => {}} />)
    expect(screen.getByText('revisar: categoria')).toBeTruthy()
  })
})
