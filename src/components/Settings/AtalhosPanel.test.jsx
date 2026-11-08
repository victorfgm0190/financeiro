// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'

// Configurações › Atalhos (Etapa 3): F1 fixa com cadeado; gravar atalho com F1, F5 ou F6 é recusado com
// a mensagem — e a F1 apertada na captura não abre a ajuda.
vi.mock('../../lib/atalhos/api', () => ({
  listarAtalhos: async () => [], gravarAtalhos: vi.fn(async () => {}), restaurarAtalho: async () => {}, restaurarTodosAtalhos: async () => {},
}))
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('../../lib/abrirTela', () => ({ navegarPara: vi.fn() }))
const { AtalhosProvider } = await import('../../context/AtalhosContext.jsx')
const { default: AtalhosPanel } = await import('./AtalhosPanel.jsx')
const { default: HelpCampoPainel } = await import('../Ajuda/HelpCampoPainel.jsx')
const { gravarAtalhos } = await import('../../lib/atalhos/api')

afterEach(cleanup)
const tecla = (init) => act(() => { document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })) })

describe('tela de Atalhos', () => {
  it('F1 aparece fixa com cadeado; F1, F5 e F6 são recusadas na gravação (F1 não abre a ajuda ali)', async () => {
    render(<AtalhosProvider><HelpCampoPainel /><AtalhosPanel /></AtalhosProvider>)
    await act(async () => {})
    const fixa = screen.getByTestId('atalho-fixo-travado-F1')
    expect(fixa.textContent).toContain('Ajuda do campo')
    expect(fixa.querySelector('[aria-label="Fixo: não pode ser usado em outro atalho"]')).toBeTruthy()

    fireEvent.click(screen.getAllByRole('button', { name: /Gravar atalho/ })[0])
    tecla({ key: 'F1', code: 'F1' })
    expect(screen.getByText('F1 é fixa: abre a ajuda do campo ou da tela.')).toBeTruthy()
    expect(screen.queryByTestId('help-campo-painel')).toBeNull()
    tecla({ key: 'F5', code: 'F5' })
    expect(screen.getByText('F5 é reservada pelo navegador/sistema.')).toBeTruthy()
    tecla({ key: 'F6', code: 'F6' })
    expect(screen.getByText('F6 é reservada pelo navegador/sistema.')).toBeTruthy()
    expect(gravarAtalhos).not.toHaveBeenCalled()
    // F9 sozinha é aceita.
    tecla({ key: 'F9', code: 'F9' })
    await act(async () => {})
    expect(gravarAtalhos).toHaveBeenCalledWith([expect.objectContaining({ combinacao: 'F9' })])
  })
})
