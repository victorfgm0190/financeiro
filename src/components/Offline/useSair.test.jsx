// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

// "Sair" com a fila offline (item 11): sem pendências sai direto; com pendências pergunta. Sair nunca
// apaga a fila do aparelho (só o "Sair e apagar dados", que é outra tela).
const app = vi.hoisted(() => ({}))
const api = vi.hoisted(() => ({ clearTokenAndRedirect: vi.fn() }))
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))
vi.mock('../../lib/api', () => api)
const { useSair } = await import('./useSair.js')
const { default: AvisoSairModal } = await import('./AvisoSairModal.jsx')

function Tela() {
  const { sair, saindo, aviso } = useSair()
  return (
    <>
      <button type="button" onClick={sair} disabled={saindo}>Sair</button>
      <AvisoSairModal {...aviso} />
    </>
  )
}

function preparar({ pendentes = 0, dbStatus = 'connected', restam = 0 } = {}) {
  Object.assign(app, {
    filaPendentes: Array.from({ length: pendentes }, (_, i) => ({ id: `p${i}` })),
    dbStatus,
    sincronizarAntesDeSair: vi.fn(async () => restam),
    apagarDadosDoAparelho: vi.fn(),
  })
  render(<Tela />)
  fireEvent.click(screen.getByRole('button', { name: 'Sair' }))
}

beforeEach(() => { api.clearTokenAndRedirect.mockClear() })
afterEach(cleanup)

describe('Sair com alterações não enviadas', () => {
  it('sem pendências: sai direto, como antes (tenta enviar o que estiver em andamento)', async () => {
    preparar()
    await vi.waitFor(() => expect(api.clearTokenAndRedirect).toHaveBeenCalled())
    expect(app.sincronizarAntesDeSair).toHaveBeenCalled()
    expect(screen.queryByText(/ainda não enviadas/)).toBeNull()
  })

  it('com pendências: aviso com a quantidade; nada acontece até escolher', () => {
    preparar({ pendentes: 3 })
    expect(screen.getByText('Existem 3 alterações ainda não enviadas para a nuvem. Se sair agora, elas ficam guardadas neste aparelho e serão enviadas quando você entrar de novo aqui.')).toBeTruthy()
    expect(api.clearTokenAndRedirect).not.toHaveBeenCalled()
    expect(app.sincronizarAntesDeSair).not.toHaveBeenCalled()
  })

  it('"Sincronizar e sair" é o padrão (foco) e sai quando tudo foi enviado', async () => {
    preparar({ pendentes: 2 })
    const botao = screen.getByRole('button', { name: 'Sincronizar e sair' })
    expect(document.activeElement).toBe(botao)
    fireEvent.click(botao)
    await vi.waitFor(() => expect(api.clearTokenAndRedirect).toHaveBeenCalled())
    expect(app.sincronizarAntesDeSair).toHaveBeenCalled()
  })

  it('sincronizar falhou: avisa, NÃO sai e a fila fica (nada é apagado)', async () => {
    preparar({ pendentes: 2, restam: 2 })
    fireEvent.click(screen.getByRole('button', { name: 'Sincronizar e sair' }))
    await vi.waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Não foi possível enviar 2 alterações agora/))
    expect(api.clearTokenAndRedirect).not.toHaveBeenCalled()
    expect(app.apagarDadosDoAparelho).not.toHaveBeenCalled()
  })

  it('sem internet: o botão diz "Sem internet" e fica desabilitado; "Sair mesmo assim" sai sem apagar a fila', () => {
    preparar({ pendentes: 1, dbStatus: 'offline' })
    expect(screen.getByText(/Existe 1 alteração ainda não enviada/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sem internet' }).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Sair mesmo assim' }))
    expect(api.clearTokenAndRedirect).toHaveBeenCalled()
    expect(app.sincronizarAntesDeSair).not.toHaveBeenCalled()
    expect(app.apagarDadosDoAparelho).not.toHaveBeenCalled()
  })

  it('Cancelar fecha o aviso e continua logado', () => {
    preparar({ pendentes: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByText(/ainda não enviada/)).toBeNull()
    expect(api.clearTokenAndRedirect).not.toHaveBeenCalled()
  })
})
