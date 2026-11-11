// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'

// "Último backup" nunca fica em "Carregando…": com o IndexedDB do aparelho sem responder (o que
// travou a tela no Chrome), passado o prazo a tela mostra "Nenhum backup feito neste computador".
vi.mock('../../lib/api', () => ({ getSessao: () => ({ id: 'u1', nivel: 'admin', perfis: 'todos', ambSigla: 'teste1' }), authHeaders: () => ({}) }))
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))
const { default: BackupPanel } = await import('./BackupPanel.jsx')
const { PRAZO_IDB_MS } = await import('../../lib/backupPasta.js')

afterEach(() => { cleanup(); vi.useRealTimers(); delete globalThis.indexedDB })

describe('último backup com o IndexedDB pendurado', () => {
  it('sai de "Carregando…" no prazo e os botões ficam ligados', async () => {
    vi.useFakeTimers()
    globalThis.indexedDB = { open: () => ({}) } // nunca chama onsuccess/onerror
    render(<BackupPanel />)
    expect(screen.getByText(/Carregando…/)).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(PRAZO_IDB_MS + 50) })
    expect(screen.queryByText(/Carregando…/)).toBeNull()
    expect(screen.getByText(/Nenhum backup feito neste computador/)).toBeTruthy()
    expect(screen.getByText('Exportar backup completo').closest('button').disabled).toBe(false)
  })
})
