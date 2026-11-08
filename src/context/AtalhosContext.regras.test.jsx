// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, act, waitFor } from '@testing-library/react'

// Motor de atalhos (Etapa 3): F2 sozinha só fora de campo de digitação; IME não dispara; digitar com a
// gaveta do help aberta não dispara atalho; F1 nunca chega ao motor; atalho gravado fora das regras é
// migrado (padrão ou desativado) com aviso único. Dados fictícios.
const api = vi.hoisted(() => ({ gravados: [], restaurados: [], gravacoes: [] }))
vi.mock('../lib/atalhos/api', () => ({
  listarAtalhos: async () => api.gravados,
  gravarAtalhos: async (itens) => { api.gravacoes.push(itens) },
  restaurarAtalho: async (id) => { api.restaurados.push(id) },
  restaurarTodosAtalhos: async () => {},
}))
vi.mock('../hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('../lib/abrirTela', () => ({ navegarPara: vi.fn() }))
const { AtalhosProvider } = await import('./AtalhosContext.jsx')
const { useAtalho } = await import('./atalhosHooks.js')
const { default: AvisoAtalhosMigrados } = await import('../components/shared/AvisoAtalhosMigrados.jsx')
const { default: HelpCampoPainel } = await import('../components/Ajuda/HelpCampoPainel.jsx')
const { fecharHelpCampo } = await import('../help/helpCampoEstado.js')

beforeEach(() => { api.gravados = []; api.restaurados = []; api.gravacoes = [] })
afterEach(() => { act(() => fecharHelpCampo()); cleanup() })

function Tela({ onNovo }) {
  useAtalho('agend.novoAgendamento', onNovo)
  return <div data-help-form="agendamento"><div data-help-id="agendamento.description"><input aria-label="Descrição" /></div><button type="button">fora</button></div>
}
const tecla = (el, init) => act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })) })
const montar = async (onNovo) => {
  render(<AtalhosProvider><HelpCampoPainel /><AvisoAtalhosMigrados /><Tela onNovo={onNovo} /></AtalhosProvider>)
  await act(async () => {})
}

describe('motor de atalhos', () => {
  it('F2 sozinha (gravada pelo usuário) dispara fora de campo; dentro de campo de digitação, não', async () => {
    api.gravados = [{ acaoId: 'agend.novoAgendamento', combinacao: 'F2' }]
    const onNovo = vi.fn()
    await montar(onNovo)
    tecla(screen.getByRole('button', { name: 'fora' }), { key: 'F2', code: 'F2' })
    expect(onNovo).toHaveBeenCalledTimes(1)
    tecla(screen.getByLabelText('Descrição'), { key: 'F2', code: 'F2' })
    expect(onNovo).toHaveBeenCalledTimes(1)
  })

  it('IME (composição de texto) não dispara', async () => {
    const onNovo = vi.fn()
    await montar(onNovo)
    tecla(screen.getByRole('button', { name: 'fora' }), { key: 'n', code: 'KeyN', altKey: true, isComposing: true })
    tecla(screen.getByRole('button', { name: 'fora' }), { key: 'Process', code: 'KeyN', altKey: true, keyCode: 229 })
    expect(onNovo).not.toHaveBeenCalled()
    tecla(screen.getByRole('button', { name: 'fora' }), { key: 'n', code: 'KeyN', altKey: true })
    expect(onNovo).toHaveBeenCalledTimes(1)
  })

  it('digitar com a gaveta do help aberta não dispara atalho; F1 não chega ao motor', async () => {
    api.gravados = [{ acaoId: 'agend.novoAgendamento', combinacao: 'F2' }]
    const onNovo = vi.fn()
    await montar(onNovo)
    const campo = screen.getByLabelText('Descrição')
    act(() => campo.focus())
    tecla(campo, { key: 'F1', code: 'F1' })
    expect(screen.getByTestId('help-campo-painel')).toBeTruthy()
    for (const k of ['a', 'n', 'v', 'x']) tecla(campo, { key: k, code: `Key${k.toUpperCase()}` })
    tecla(campo, { key: 'F2', code: 'F2' })
    expect(onNovo).not.toHaveBeenCalled()
  })
})

describe('migração dos atalhos gravados', () => {
  it('F5 volta ao padrão, F6 com padrão ocupado é desativado — no banco e com aviso único', async () => {
    api.gravados = [
      { acaoId: 'nav.envelopes', combinacao: 'F5' },
      { acaoId: 'agend.novoAgendamento', combinacao: 'Alt+V' },
      { acaoId: 'agend.lancarProvisao', combinacao: 'F6' },
    ]
    await montar(vi.fn())
    await waitFor(() => expect(screen.getByTestId('aviso-atalhos-migrados')).toBeTruthy())
    expect(api.restaurados).toEqual(['nav.envelopes'])
    expect(api.gravacoes).toEqual([[{ acaoId: 'agend.lancarProvisao', combinacao: null }]])
    const texto = screen.getByTestId('aviso-atalhos-migrados').textContent
    expect(texto).toContain('Ir para Envelopes: F5 voltou ao padrão')
    expect(texto).toContain('Lançar Provisão: F6 foi desativado')
    // Depois de corrigido no banco, não há o que avisar de novo.
    cleanup()
    api.gravados = [{ acaoId: 'agend.novoAgendamento', combinacao: 'Alt+V' }, { acaoId: 'agend.lancarProvisao', combinacao: null }]
    await montar(vi.fn())
    expect(screen.queryByTestId('aviso-atalhos-migrados')).toBeNull()
  })
})
