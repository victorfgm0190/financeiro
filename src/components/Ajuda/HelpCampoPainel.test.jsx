// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'

// Help de campo (Etapa 2): F1 fixa e exclusiva, drawer que não bloqueia, Esc fecha só o painel,
// acompanha o campo com foco, ⓘ abre o painel (bottom sheet no celular).
const mobile = vi.hoisted(() => ({ v: false }))
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => mobile.v }))
vi.mock('../../lib/abrirTela', () => ({ navegarPara: vi.fn() }))
vi.mock('../../lib/boasVindasApi', () => ({ assinarBoasVindas: () => () => {}, estadoBoasVindas: () => null }))
const { default: HelpCampoPainel } = await import('./HelpCampoPainel.jsx')
const { default: HelpCampo } = await import('../shared/HelpCampo.jsx')
const { default: Modal } = await import('../shared/Modal.jsx')
const { fecharHelpCampo, EVENTO_AJUDA_TELA } = await import('../../help/helpCampoEstado.js')
const { CAMPOS } = await import('../../help/index.js')

beforeEach(() => { mobile.v = false })
afterEach(() => { act(() => fecharHelpCampo()); cleanup() })

const f1 = (opts = {}) => {
  const ev = new KeyboardEvent('keydown', { key: 'F1', code: 'F1', bubbles: true, cancelable: true, ...opts })
  act(() => { (document.activeElement || document.body).dispatchEvent(ev) })
  return ev
}
const painel = () => screen.queryByTestId('help-campo-painel')

function Formulario() {
  return (
    <div data-help-form="agendamento">
      <div data-help-id="agendamento.amount"><input aria-label="Campo do valor" /></div>
      <div data-help-id="agendamento.description"><input aria-label="Descrição" /></div>
      <button type="button">Sem help</button>
    </div>
  )
}

describe('F1', () => {
  it('com foco num campo abre o help do campo; nunca chega ao navegador nem a outro atalho', () => {
    const outro = vi.fn()
    window.addEventListener('keydown', outro)
    render(<><HelpCampoPainel /><Formulario /></>)
    screen.getByLabelText('Campo do valor').focus()
    const ev = f1()
    expect(ev.defaultPrevented).toBe(true)
    expect(outro).not.toHaveBeenCalled()
    expect(painel().getAttribute('data-modo')).toBe('drawer')
    expect(painel().textContent).toContain(CAMPOS['agendamento.amount'].titulo)
    expect(painel().textContent).toContain(CAMPOS['agendamento.amount'].relacaoComTela)
    expect(document.activeElement).toBe(screen.getByLabelText('Campo do valor')) // o foco fica no campo
    window.removeEventListener('keydown', outro)
  })

  it('o drawer acompanha a troca de campo', () => {
    render(<><HelpCampoPainel /><Formulario /></>)
    screen.getByLabelText('Campo do valor').focus()
    f1()
    act(() => { screen.getByLabelText('Descrição').focus() })
    expect(painel().textContent).toContain(CAMPOS['agendamento.description'].titulo)
  })

  it('F1 com modificador não faz nada (e também não vaza)', () => {
    render(<><HelpCampoPainel /><Formulario /></>)
    screen.getByLabelText('Campo do valor').focus()
    for (const m of ['ctrlKey', 'altKey', 'shiftKey', 'metaKey']) expect(f1({ [m]: true }).defaultPrevented).toBe(true)
    expect(painel()).toBeNull()
  })

  it('sem campo, dentro de um formulário: ajuda do formulário', () => {
    render(<><HelpCampoPainel /><Formulario /></>)
    screen.getByRole('button', { name: 'Sem help' }).focus()
    f1()
    expect(painel().textContent).toContain('Sobre este formulário')
  })

  it('fora de formulário: pede a ajuda da tela (o "?"); sem ele, o painel aponta para a Central', () => {
    const pedido = vi.fn((e) => { e.detail.atendido = true })
    window.addEventListener(EVENTO_AJUDA_TELA, pedido)
    render(<HelpCampoPainel />)
    f1()
    expect(pedido).toHaveBeenCalled()
    expect(painel()).toBeNull()
    window.removeEventListener(EVENTO_AJUDA_TELA, pedido)
    f1()
    expect(painel().textContent).toContain('Abrir a Central de Ajuda')
  })

  it('Esc fecha só o drawer: o modal de baixo continua aberto; digitar no campo não fecha nada', () => {
    const fecharModal = vi.fn()
    render(<><HelpCampoPainel /><Modal open onClose={fecharModal} title="Novo"><Formulario /></Modal></>)
    screen.getByLabelText('Campo do valor').focus()
    f1()
    fireEvent.change(screen.getByLabelText('Campo do valor'), { target: { value: '12' } })
    expect(painel()).not.toBeNull()
    act(() => { document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })) })
    expect(painel()).toBeNull()
    expect(fecharModal).not.toHaveBeenCalled()
  })
})

describe('ícone ⓘ', () => {
  it('computador: clique abre o drawer com o conteúdo completo', () => {
    render(<><HelpCampoPainel /><label>Valor<HelpCampo campo="agendamento.amount" /></label></>)
    fireEvent.click(screen.getByTestId('help-campo'))
    expect(painel().getAttribute('data-modo')).toBe('drawer')
    expect(painel().textContent).toContain(CAMPOS['agendamento.amount'].relacaoComTela)
  })

  it('celular: tocar no campo só foca (sem ajuda); o ⓘ abre o bottom sheet', () => {
    mobile.v = true
    render(<><HelpCampoPainel /><div data-help-id="agendamento.amount"><label>Valor<HelpCampo campo="agendamento.amount" /></label><input aria-label="Campo do valor" /></div></>)
    fireEvent.focus(screen.getByLabelText('Campo do valor'))
    fireEvent.click(screen.getByLabelText('Campo do valor'))
    expect(painel()).toBeNull()
    fireEvent.click(screen.getByTestId('help-campo'))
    expect(painel().getAttribute('data-modo')).toBe('sheet')
    expect(screen.getByRole('dialog', { name: CAMPOS['agendamento.amount'].titulo })).toBeTruthy()
  })
})
