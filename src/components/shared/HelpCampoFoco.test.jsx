// @vitest-environment jsdom
// O balão do ⓘ só abre com hover, clique ou Tab — nunca porque o modal pôs o foco nele ao abrir.
// O foco inicial do modal vai para o primeiro campo, pulando o ⓘ do rótulo. Dados fictícios.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'

vi.mock('../../context/atalhosHooks', async (orig) => ({ ...(await orig()), useCamadaModal: () => null }))
const { default: Modal } = await import('./Modal.jsx')
const { default: HelpCampo } = await import('./HelpCampo.jsx')

afterEach(cleanup)
// jsdom não tem layout: os focáveis do modal precisam parecer visíveis.
vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(() => [{}])
const quadro = () => new Promise(r => requestAnimationFrame(() => r()))

describe('ⓘ e foco inicial do modal', () => {
  it('modal abre com o foco no primeiro campo (não no ⓘ) e sem balão aberto', async () => {
    render(
      <Modal open onClose={() => {}} title="Nova conta">
        <label className="label">Tipo<HelpCampo texto="Texto do tipo" /></label>
        <button type="button">Conta Corrente</button>
        <button type="button">Cartão de Crédito</button>
      </Modal>,
    )
    await act(quadro)
    expect(document.activeElement.textContent).toBe('Conta Corrente')
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
  it('foco programático no ⓘ não abre o balão; hover abre', async () => {
    render(<HelpCampo texto="Texto do campo" />)
    const icone = screen.getByTestId('help-campo')
    act(() => icone.focus())
    expect(screen.queryByRole('tooltip')).toBeNull()
    fireEvent.mouseEnter(icone)
    expect(screen.getByRole('tooltip').textContent).toBe('Texto do campo')
    fireEvent.mouseLeave(icone)
    act(() => icone.blur())
    // Chegou pelo Tab: abre (acessibilidade do teclado continua).
    fireEvent.keyDown(window, { key: 'Tab' })
    act(() => icone.focus())
    expect(screen.getByRole('tooltip')).toBeTruthy()
  })
})
