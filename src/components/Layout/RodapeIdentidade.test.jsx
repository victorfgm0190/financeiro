// @vitest-environment jsdom
// Rodapé da barra lateral: no ambiente principal, sem nome/frase configurados, mostra sempre o texto de
// sempre (decisão do dono do sistema — sumiu em cc31eb5 e foi restaurado). Num cliente, vazio = nada.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { useApp } from '../../context/AppContext'
import { noAmbientePrincipal } from '../../lib/api'
import RodapeIdentidade from './RodapeIdentidade'

vi.mock('../../context/AppContext', () => ({ useApp: vi.fn() }))
vi.mock('../../lib/api', () => ({ noAmbientePrincipal: vi.fn() }))

const montar = (settings, principal) => {
  useApp.mockReturnValue({ settings })
  noAmbientePrincipal.mockReturnValue(principal)
  return render(<RodapeIdentidade classeTitulo="t" classeFrase="f" />)
}
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('RodapeIdentidade', () => {
  it('ambiente principal sem configuração: texto de sempre', () => {
    montar({ rodapeTitulo: null, rodapeFrase: null }, true)
    expect(screen.getByText('Gislaine & Victor Moreira')).toBeTruthy()
    expect(screen.getByText('Transformando conhecimento em resultados.')).toBeTruthy()
  })
  it('configuração do ambiente tem prioridade', () => {
    montar({ rodapeTitulo: 'Família Exemplo', rodapeFrase: '' }, true)
    expect(screen.getByText('Família Exemplo')).toBeTruthy()
    expect(screen.queryByText('Transformando conhecimento em resultados.')).toBeNull()
  })
  it('cliente sem configuração: nada', () => {
    const { container } = montar({}, false)
    expect(container.textContent).toBe('')
  })
})
