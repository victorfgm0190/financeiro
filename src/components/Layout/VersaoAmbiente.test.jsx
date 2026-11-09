// @vitest-environment jsdom
// "ambiente · commit" no rodapé do menu, em Configurações e no Mais do celular.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

const sessao = vi.hoisted(() => ({ atual: null }))
vi.mock('../../lib/api', () => ({ getSessao: () => sessao.atual }))
const { default: VersaoAmbiente, textoVersao } = await import('./VersaoAmbiente.jsx')
afterEach(() => { cleanup(); vi.unstubAllEnvs() })

describe('VersaoAmbiente', () => {
  it('formata "sigla · commit"; sem sessão = vm, sem commit = dev', () => {
    expect(textoVersao('teste1', 'a1b2c3d')).toBe('teste1 · a1b2c3d')
    expect(textoVersao(null, null)).toBe('vm · dev')
  })
  it('mostra o ambiente da sessão e o commit do build', () => {
    sessao.atual = { ambSigla: 'teste1' }
    vi.stubEnv('VITE_APP_COMMIT', 'a1b2c3d')
    render(<VersaoAmbiente />)
    expect(screen.getByTestId('versao-ambiente').textContent).toBe('teste1 · a1b2c3d')
  })
})
