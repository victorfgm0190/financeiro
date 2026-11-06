// @vitest-environment jsdom
// Help de campo: ⓘ ao lado do rótulo — abre no hover (desktop) e no toque (mobile), fecha ao tocar fora
// ou em Esc, não aciona o campo do rótulo e some com a preferência desligada.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'

const boas = vi.hoisted(() => ({ estado: null, ouvintes: new Set() }))
vi.mock('../../lib/boasVindasApi', () => ({
  estadoBoasVindas: () => boas.estado,
  assinarBoasVindas: (fn) => { boas.ouvintes.add(fn); return () => boas.ouvintes.delete(fn) },
}))
const { default: HelpCampo } = await import('./HelpCampo.jsx')
const { HELP_CAMPOS, textoHelpCampo } = await import('../../lib/helpCampos.js')

afterEach(() => { cleanup(); boas.estado = null })
const balao = () => screen.queryByRole('tooltip')

describe('HelpCampo', () => {
  it('texto pela chave; abre ao passar o mouse e fecha ao sair', () => {
    render(<label>Dia de Fechamento <HelpCampo campo="cartao.fechamento" /></label>)
    const icone = screen.getByTestId('help-campo')
    expect(balao()).toBeNull()
    fireEvent.mouseEnter(icone)
    expect(balao().textContent).toBe(HELP_CAMPOS.cartao.fechamento)
    fireEvent.mouseLeave(icone)
    expect(balao()).toBeNull()
  })

  it('toque abre e fica aberto; tocar fora ou Esc fecha; o clique não aciona o campo do rótulo', () => {
    const marcar = vi.fn()
    render(<div><label><input type="checkbox" onChange={marcar} /> Registrar <HelpCampo campo="agendamento.autoRegister" /></label><p>fora</p></div>)
    const icone = screen.getByTestId('help-campo')
    fireEvent.click(icone)
    fireEvent.mouseLeave(icone)
    expect(balao()).not.toBeNull()
    expect(marcar).not.toHaveBeenCalled()
    fireEvent.touchStart(screen.getByText('fora'))
    expect(balao()).toBeNull()
    fireEvent.click(icone)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(balao()).toBeNull()
  })

  it('preferência desligada: o ícone não aparece; religada: volta', () => {
    boas.estado = { ajudaCampos: false }
    render(<HelpCampo campo="conta.tipo" />)
    expect(screen.queryByTestId('help-campo')).toBeNull()
    act(() => { for (const f of boas.ouvintes) f({ ajudaCampos: true }) })
    expect(screen.getByTestId('help-campo')).toBeTruthy()
  })

  it('chave sem texto não mostra nada', () => {
    render(<HelpCampo campo="nao.existe" />)
    expect(screen.queryByTestId('help-campo')).toBeNull()
  })
})

describe('textos centralizados', () => {
  it('curtos (até 2 frases), descrevem a função e não trazem exemplos', () => {
    for (const [tela, campos] of Object.entries(HELP_CAMPOS)) {
      for (const [campo, texto] of Object.entries(campos)) {
        const chave = `${tela}.${campo}`
        expect(textoHelpCampo(chave), chave).toBe(texto)
        expect(texto.length, chave).toBeLessThanOrEqual(160)
        expect(texto.split(/[.!?](\s|$)/).filter(t => t && t.trim()).length, chave).toBeLessThanOrEqual(2)
        expect(texto, chave).not.toMatch(/\bEx[.:]|exemplo/i)
      }
    }
  })
})

describe('acessibilidade dentro de rótulos', () => {
  it('o rótulo continua apontando só para o campo; Enter abre a ajuda', () => {
    render(<div><label htmlFor="c1">Vínculo <HelpCampo campo="conta.vinculo" /></label><select id="c1"><option>x</option></select></div>)
    expect(screen.getByLabelText(/Vínculo/).tagName).toBe('SELECT')
    fireEvent.keyDown(screen.getByTestId('help-campo'), { key: 'Enter' })
    expect(balao()).not.toBeNull()
  })
})
