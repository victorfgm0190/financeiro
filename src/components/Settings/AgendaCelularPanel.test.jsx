// @vitest-environment jsdom
// Agenda no celular: feed criado com outra chave (token não decifra → token null). A tela avisa,
// mostra "Gerar novo link" e, confirmado, troca pelos cartões normais. Dados fictícios.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react'

const api = vi.hoisted(() => ({ obter: vi.fn(), criar: vi.fn(), alterar: vi.fn(), avisar: vi.fn() }))
vi.mock('../../lib/agendaFeedApi', async (orig) => ({
  ...(await orig()),
  obterAgendaFeed: api.obter, criarAgendaFeed: api.criar, alterarAgendaFeed: api.alterar, avisarFeedMudou: api.avisar,
}))
vi.mock('../../context/AppContext', () => ({
  useApp: () => ({ usuario: { id: 'u1', origem: 'db' }, pode: () => true, schedules: [] }),
}))
vi.mock('../../context/atalhosHooks', async (orig) => ({ ...(await orig()), useAtalho: () => {}, useTituloAtalho: (t) => t, useCamadaModal: () => {} }))

const { default: AgendaCelularPanel } = await import('./AgendaCelularPanel.jsx')

const feedSemToken = { id: 'f1', tipos: ['despesa', 'receita'], mostrarValores: true, token: null, cache: {} }
const feedNovo = { ...feedSemToken, id: 'f2', token: 'tokenFicticio123' }

beforeEach(() => {
  api.obter.mockResolvedValue({ configurado: true, feed: feedSemToken })
  api.criar.mockResolvedValue(feedNovo)
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('AgendaCelularPanel — link atual irrecuperável (chave mudou)', () => {
  it('mostra o aviso e o botão "Gerar novo link"; sem confirmar, nada é criado', async () => {
    render(<AgendaCelularPanel />)
    const bloco = await screen.findByTestId('agenda-link-irrecuperavel')
    expect(bloco.textContent).toMatch(/a chave do servidor mudou/)
    const botao = within(bloco).getByRole('button', { name: /Gerar novo link/ })
    fireEvent.click(botao)
    expect(screen.getByText(/adicionar a agenda de novo em cada aparelho/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(api.criar).not.toHaveBeenCalled()
  })

  it('confirmado: cria o feed com as opções atuais e mostra os cartões com os links', async () => {
    render(<AgendaCelularPanel />)
    const bloco = await screen.findByTestId('agenda-link-irrecuperavel')
    fireEvent.click(within(bloco).getByRole('button', { name: /Gerar novo link/ }))
    const dialogo = screen.getByText(/adicionar a agenda de novo em cada aparelho/).closest('[role="dialog"]') || document.body
    const confirmar = within(dialogo).getAllByRole('button', { name: 'Gerar novo link' }).at(-1)
    fireEvent.click(confirmar)
    await waitFor(() => expect(screen.queryByTestId('agenda-link-irrecuperavel')).toBeNull())
    expect(api.criar).toHaveBeenCalledWith({ tipos: ['despesa', 'receita'], mostrarValores: true })
    expect(screen.getAllByText('Adicionar ao iPhone')).toHaveLength(2)
    expect(screen.getAllByText('Adicionar ao Google Agenda')).toHaveLength(2)
    expect(screen.getByLabelText('Link Despesas').textContent).toContain('/api/agenda?t=tokenFicticio123&tipo=despesa')
  })
})
