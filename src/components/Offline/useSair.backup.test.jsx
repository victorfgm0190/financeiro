// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

// BACKUP AO SAIR: só no computador, só administrador com todos os perfis, com "Perguntar ao sair".
// Sim → backup (pasta escolhida ou Downloads) e sai; Não → sai; erro → avisa e oferece saída. No celular,
// nada é perguntado.
const app = vi.hoisted(() => ({}))
const api = vi.hoisted(() => ({ clearTokenAndRedirect: vi.fn(), getSessao: () => ({ id: 'u1', nivel: 'admin', perfis: 'todos', ambSigla: 'teste1' }), authHeaders: () => ({}) }))
const local = vi.hoisted(() => ({ cfg: null, atualizar: vi.fn(async () => ({})) }))
const cliente = vi.hoisted(() => ({ exportarBackup: vi.fn(), baixarArquivo: vi.fn() }))
vi.mock('../../context/AppContext', () => ({ useApp: () => app }))
vi.mock('../../lib/api', () => api)
vi.mock('../../lib/backupCliente', () => cliente)
vi.mock('../../hooks/useBackupLocal', () => ({
  useBackupLocal: () => ({ cfg: local.cfg, atualizar: local.atualizar, sessao: api.getSessao() }),
  podeFazerBackup: (s) => s?.nivel === 'admin' && s?.perfis === 'todos',
}))
const { useSair } = await import('./useSair.js')
const { default: AvisoSairModal } = await import('./AvisoSairModal.jsx')

function Tela() {
  const { sair, aviso } = useSair()
  return (<><button type="button" onClick={sair}>Sair</button><AvisoSairModal {...aviso} /></>)
}

function pastaFalsa({ pedido = 'granted' } = {}) {
  const arquivos = new Map()
  return {
    kind: 'directory', name: 'Backups Finup', arquivos,
    async getFileHandle(n) { return { async createWritable() { let b = ''; return { write: async (t) => { b += t }, close: async () => { arquivos.set(n, b) } } } } },
    async *entries() { for (const n of [...arquivos.keys()]) yield [n, { kind: 'file' }] },
    async removeEntry(n) { arquivos.delete(n) },
    queryPermission: async () => 'prompt',
    requestPermission: async () => pedido,
  }
}

function preparar({ celular = false, cfg, suporte = false } = {}) {
  window.matchMedia = vi.fn(() => ({ matches: celular, addEventListener() {}, removeEventListener() {} }))
  if (suporte) window.showDirectoryPicker = vi.fn()
  else delete window.showDirectoryPicker
  local.cfg = { pasta: null, nomePasta: '', perguntar: null, manter: 10, ultimo: null, ...cfg }
  Object.assign(app, { filaPendentes: [], dbStatus: 'connected', sincronizarAntesDeSair: vi.fn(async () => 0) })
  render(<Tela />)
  fireEvent.click(screen.getByRole('button', { name: 'Sair' }))
}

beforeEach(() => {
  api.clearTokenAndRedirect.mockClear()
  cliente.exportarBackup.mockReset().mockResolvedValue({ texto: '{"ok":1}', nome: 'finup-backup-teste1-2026-11-10-1830.json' })
  cliente.baixarArquivo.mockReset()
  local.atualizar.mockClear()
})
afterEach(cleanup)

describe('backup ao sair', () => {
  it('celular: não pergunta nada e sai direto, mesmo com "perguntar" ligado', async () => {
    preparar({ celular: true, cfg: { perguntar: 'sempre' } })
    await vi.waitFor(() => expect(api.clearTokenAndRedirect).toHaveBeenCalled())
    expect(screen.queryByText(/Deseja fazer backup/)).toBeNull()
    expect(cliente.exportarBackup).not.toHaveBeenCalled()
  })

  it('computador sem pasta escolhida e sem escolha: não pergunta (padrão)', async () => {
    preparar({ cfg: {} })
    await vi.waitFor(() => expect(api.clearTokenAndRedirect).toHaveBeenCalled())
    expect(screen.queryByText(/Deseja fazer backup/)).toBeNull()
  })

  it('"Não, só sair": sai normal, sem backup', async () => {
    preparar({ cfg: { perguntar: 'sempre' } })
    fireEvent.click(screen.getByRole('button', { name: 'Não, só sair' }))
    await vi.waitFor(() => expect(api.clearTokenAndRedirect).toHaveBeenCalled())
    expect(cliente.exportarBackup).not.toHaveBeenCalled()
  })

  it('navegador sem pasta (Safari/Firefox): "Sim" baixa para Downloads e depois sai', async () => {
    preparar({ cfg: { perguntar: 'sempre' } })
    expect(screen.getByText(/baixado para a pasta Downloads/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sim, fazer backup' }))
    await vi.waitFor(() => expect(cliente.baixarArquivo).toHaveBeenCalledWith('finup-backup-teste1-2026-11-10-1830.json', '{"ok":1}'))
    expect(local.atualizar).toHaveBeenCalledWith({ ultimo: expect.any(Number) })
    await vi.waitFor(() => expect(api.clearTokenAndRedirect).toHaveBeenCalled(), { timeout: 4000 })
  })

  it('com pasta: pede a permissão no clique, grava na pasta (não baixa) e sai', async () => {
    const pasta = pastaFalsa()
    preparar({ suporte: true, cfg: { pasta, nomePasta: 'Backups Finup' } })
    expect(screen.getByText(/vai para a pasta Backups Finup/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sim, fazer backup' }))
    await vi.waitFor(() => expect(api.clearTokenAndRedirect).toHaveBeenCalled())
    expect(pasta.arquivos.get('finup-backup-teste1-2026-11-10-1830.json')).toBe('{"ok":1}')
    expect(cliente.baixarArquivo).not.toHaveBeenCalled()
  })

  it('permissão negada: avisa e oferece Downloads, outra pasta ou sair sem backup — "Baixar para Downloads" baixa e sai', async () => {
    preparar({ suporte: true, cfg: { pasta: pastaFalsa({ pedido: 'denied' }), nomePasta: 'Backups Finup' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sim, fazer backup' }))
    await vi.waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/não liberou a gravação na pasta/))
    expect(screen.getByRole('button', { name: 'Escolher outra pasta' })).toBeTruthy()
    expect(api.clearTokenAndRedirect).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Baixar para Downloads' }))
    await vi.waitFor(() => expect(cliente.baixarArquivo).toHaveBeenCalled())
    await vi.waitFor(() => expect(api.clearTokenAndRedirect).toHaveBeenCalled(), { timeout: 4000 })
  })

  it('erro no backup: avisa e pergunta — "Sair sem backup" nunca prende o Sair', async () => {
    cliente.exportarBackup.mockRejectedValue(new Error('Sem conexão com o servidor.'))
    preparar({ cfg: { perguntar: 'sempre' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sim, fazer backup' }))
    await vi.waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Não foi possível fazer o backup/))
    expect(screen.getByText('Sem conexão com o servidor.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sair sem backup' }))
    await vi.waitFor(() => expect(api.clearTokenAndRedirect).toHaveBeenCalled())
  })
})
