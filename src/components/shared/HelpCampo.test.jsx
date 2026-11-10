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
const { CAMPOS, textoCurtoDoCampo } = await import('../../help/index.js')
const { lerHelpCampo, fecharHelpCampo } = await import('../../help/helpCampoEstado.js')

afterEach(() => { cleanup(); boas.estado = null; fecharHelpCampo() })
const balao = () => screen.queryByRole('tooltip')

describe('HelpCampo', () => {
  it('texto pela chave; abre ao passar o mouse e fecha ao sair', () => {
    render(<label>Dia de Fechamento <HelpCampo campo="cartao.fechamento" /></label>)
    const icone = screen.getByTestId('help-campo')
    expect(balao()).toBeNull()
    fireEvent.mouseEnter(icone)
    fireEvent.mouseMove(icone, { clientX: 10, clientY: 10 })
    expect(balao().textContent).toBe(CAMPOS['cartao.fechamento'].paraQueServe)
    fireEvent.mouseLeave(icone)
    expect(balao()).toBeNull()
  })

  it('a tela mudou debaixo do ponteiro parado (guia trocou de passo): o balão NÃO abre sozinho', () => {
    render(<div><p>outro lugar</p><label>Dia de Fechamento <HelpCampo campo="cartao.fechamento" /></label></div>)
    const icone = screen.getByTestId('help-campo')
    // Último ponto do mouse/toque: (50, 60), em outro elemento.
    fireEvent.mouseMove(screen.getByText('outro lugar'), { clientX: 50, clientY: 60 })
    // O layout mudou e o navegador repete o mesmo ponto sobre o ⓘ: não abre.
    fireEvent.mouseEnter(icone)
    fireEvent.mouseMove(icone, { clientX: 50, clientY: 60 })
    expect(balao()).toBeNull()
    // O mouse se mexeu de verdade sobre o ⓘ: abre.
    fireEvent.mouseMove(icone, { clientX: 52, clientY: 61 })
    expect(balao()).toBeTruthy()
  })

  it('clique/toque abre o painel do help de campo (não o balão); o clique não aciona o campo do rótulo', () => {
    const marcar = vi.fn()
    render(<div><label><input type="checkbox" onChange={marcar} /> Registrar <HelpCampo campo="agendamento.autoRegister" /></label><p>fora</p></div>)
    fireEvent.click(screen.getByTestId('help-campo'))
    expect(lerHelpCampo()).toMatchObject({ aberto: true, id: 'agendamento.autoRegister', origem: 'icone' })
    expect(balao()).toBeNull()
    expect(marcar).not.toHaveBeenCalled()
  })

  it('texto direto (sem chave da base): toque abre o balão e fica; tocar fora ou Esc fecha', () => {
    render(<div><label>Algo <HelpCampo texto="Explicação curta do campo." /></label><p>fora</p></div>)
    const icone = screen.getByTestId('help-campo')
    fireEvent.click(icone)
    fireEvent.mouseLeave(icone)
    expect(balao().textContent).toBe('Explicação curta do campo.')
    fireEvent.touchStart(screen.getByText('fora'))
    expect(balao()).toBeNull()
    fireEvent.click(icone)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(balao()).toBeNull()
    expect(lerHelpCampo().aberto).toBe(false)
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
    for (const [chave, { paraQueServe: texto }] of Object.entries(CAMPOS)) {
      expect(textoCurtoDoCampo(chave), chave).toBe(texto)
      expect(texto.length, chave).toBeLessThanOrEqual(160)
      expect(texto.split(/[.!?](\s|$)/).filter(t => t && t.trim()).length, chave).toBeLessThanOrEqual(2)
      expect(texto, chave).not.toMatch(/\bEx[.:]|exemplo/i)
    }
  })
})

describe('acessibilidade dentro de rótulos', () => {
  it('o rótulo continua apontando só para o campo; Enter abre a ajuda', () => {
    render(<div><label htmlFor="c1">Vínculo <HelpCampo campo="conta.vinculo" /></label><select id="c1"><option>x</option></select></div>)
    expect(screen.getByLabelText(/Vínculo/).tagName).toBe('SELECT')
    fireEvent.keyDown(screen.getByTestId('help-campo'), { key: 'Enter' })
    expect(lerHelpCampo()).toMatchObject({ aberto: true, id: 'conta.vinculo' })
  })
})

describe('celular: o ⓘ não quebra sozinho para a linha de baixo (Etapa 4)', () => {
  it('ícone inline e "colado" à última palavra (word joiner gerado por CSS, fora do texto do rótulo)', async () => {
    render(<label>Dia de vencimento <HelpCampo campo="cartao.fechamento" /></label>)
    const icone = screen.getByTestId('help-campo')
    expect(icone.classList.contains('help-campo-cola')).toBe(true)
    expect([...icone.classList].some(c => c === 'inline-flex' || c === 'inline-block')).toBe(false)
    expect(icone.closest('label').textContent).toBe('Dia de vencimento ')
    const fs = await import('node:fs')
    const { cwd } = await import('node:process')
    const css = fs.readFileSync(cwd() + '/src/index.css', 'utf8')
    expect(css).toContain(".help-campo-cola::before { content: '\\2060'; }")
  })
})
