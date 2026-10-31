// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const app = vi.hoisted(() => ({}))
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))
const { default: IdentidadeAmbiente } = await import('./IdentidadeAmbiente.jsx')
const { default: RodapeIdentidade } = await import('../Layout/RodapeIdentidade.jsx')

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('Identidade do ambiente', () => {
  it('grava nome e frase nas configurações do ambiente', () => {
    Object.assign(app, { settings: {}, updateSettings: vi.fn(), usuario: { nome: 'Usuária Teste' } })
    render(<IdentidadeAmbiente />)
    expect(screen.getByText(/nome do usuário logado \(Usuária Teste\)/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Nome do ambiente'), { target: { value: '  Família Exemplo ' } })
    fireEvent.change(screen.getByLabelText('Frase do ambiente (opcional)'), { target: { value: 'Uma frase.' } })
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }))
    expect(app.updateSettings).toHaveBeenCalledWith({ rodapeTitulo: 'Família Exemplo', rodapeFrase: 'Uma frase.' })
  })

  it('vazio grava null; somente leitura não grava', () => {
    Object.assign(app, { settings: { rodapeTitulo: 'X', rodapeFrase: 'Y' }, updateSettings: vi.fn(), usuario: null })
    render(<IdentidadeAmbiente />)
    fireEvent.change(screen.getByLabelText('Nome do ambiente'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Frase do ambiente (opcional)'), { target: { value: ' ' } })
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }))
    expect(app.updateSettings).toHaveBeenCalledWith({ rodapeTitulo: null, rodapeFrase: null })
    cleanup()
    render(<IdentidadeAmbiente somenteLeitura />)
    expect(screen.queryByRole('button', { name: /Salvar/ })).toBeNull()
  })

  it('rodapé: só o que está configurado, sem texto fixo', () => {
    Object.assign(app, { settings: {} })
    const { container } = render(<RodapeIdentidade classeTitulo="t" classeFrase="f" />)
    expect(container.textContent).toBe('')
    cleanup()
    Object.assign(app, { settings: { rodapeTitulo: 'Família Exemplo', rodapeFrase: '' } })
    render(<RodapeIdentidade classeTitulo="t" classeFrase="f" />)
    expect(screen.getByText('Família Exemplo')).toBeTruthy()
  })
})
