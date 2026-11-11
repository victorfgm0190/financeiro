// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'

// Defeito de 11/11 (vm, Chrome no Windows): "Escolher pasta de backup" → D:\FINUP → "Selecionar pasta" e a
// tela continuava "Nenhuma pasta escolhida", sem mensagem. Agora: o nome aparece na hora (mesmo com o
// IndexedDB lento ou mudo), toda falha diz o motivo e o que fazer, e "Perguntar ao sair" vira Sempre.
// Usa o hook de verdade (useBackupLocal) com IndexedDB falso.
vi.mock('../../lib/api', () => ({ getSessao: () => ({ id: 'u1', nivel: 'admin', perfis: 'todos', ambSigla: 'vm' }), authHeaders: () => ({}) }))
vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }))
vi.mock('../../lib/backupCliente', () => ({}))
const { default: BackupPanel } = await import('./BackupPanel.jsx')
const { useBackupLocal, _limparLojasBackup } = await import('../../hooks/useBackupLocal.js')
const { PRAZO_IDB_MS } = await import('../../lib/backupPasta.js')

function idbFalso({ atraso = 0, mudo = false, erroGravar = null, dados = new Map() } = {}) {
  const pedido = (fn) => { const r = {}; setTimeout(() => { try { r.result = fn(); r.onsuccess?.() } catch (e) { r.error = e; r.onerror?.() } }, 0); return r }
  return {
    dados,
    open() {
      const r = {}
      if (mudo) return r
      setTimeout(() => {
        r.result = {
          objectStoreNames: { contains: () => true }, close() {},
          transaction: () => ({ objectStore: () => ({
            get: (k) => pedido(() => dados.get(k)),
            put: (v, k) => pedido(() => { if (erroGravar) throw erroGravar; dados.set(k, v) }),
          }) }),
        }
        r.onsuccess?.()
      }, atraso)
      return r
    },
  }
}
const pasta = ({ permissao = 'granted', pedido = 'granted' } = {}) => ({
  kind: 'directory', name: 'FINUP', queryPermission: async () => permissao, requestPermission: async () => pedido,
})
const erro = (name) => Object.assign(new Error(name), { name })

const passar = (ms) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })
const pastaAtual = () => screen.getByTestId('backup-pasta-atual').textContent
const perguntar = () => screen.getByLabelText('Perguntar ao sair').value
const escolher = async () => { await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Escolher pasta de backup|Trocar pasta/ })) }) }

// Sonda: outro usuário do mesmo hook (como o Sair) vê a mesma pasta.
function Sonda() { const { cfg } = useBackupLocal(); return <p data-testid="sonda">{cfg?.pasta ? cfg.pasta.name : '—'}</p> }

beforeEach(() => {
  vi.useFakeTimers()
  _limparLojasBackup()
  localStorage.clear()
})
afterEach(() => { cleanup(); vi.useRealTimers(); delete globalThis.indexedDB; delete window.showDirectoryPicker })

async function abrir({ idb, picker }) {
  globalThis.indexedDB = idb
  window.showDirectoryPicker = vi.fn(picker)
  render(<><BackupPanel /><Sonda /></>)
  await passar(PRAZO_IDB_MS + 50) // leitura inicial (no prazo, mesmo muda)
}

describe('Backup ao sair — escolher a pasta', () => {
  it('IndexedDB normal: mostra a pasta, "Perguntar ao sair" vira Sempre, o Sair vê a mesma pasta, e fica guardada', async () => {
    const idb = idbFalso()
    await abrir({ idb, picker: async () => pasta() })
    expect(pastaAtual()).toBe('Nenhuma pasta escolhida.')
    expect(perguntar()).toBe('nunca')
    await escolher()
    expect(pastaAtual()).toMatch(/Pasta: FINUP/)
    expect(perguntar()).toBe('sempre')
    expect(screen.getByTestId('sonda').textContent).toBe('FINUP')
    expect(window.showDirectoryPicker).toHaveBeenCalledWith({ id: 'finup-backup', mode: 'readwrite' })
    await passar(50)
    expect(screen.getByTestId('backup-pasta-msg').textContent).toBe('Pasta de backup: FINUP.')
    // Recarregar (loja nova) lê do aparelho.
    cleanup(); _limparLojasBackup()
    render(<BackupPanel />)
    await passar(50)
    expect(pastaAtual()).toMatch(/Pasta: FINUP/)
    expect(perguntar()).toBe('sempre')
  })

  it('IndexedDB lento: o nome aparece na hora, antes de a gravação terminar', async () => {
    await abrir({ idb: idbFalso({ atraso: 2000 }), picker: async () => pasta() })
    await escolher()
    expect(pastaAtual()).toMatch(/Pasta: FINUP/)
    await passar(2500)
    expect(screen.getByTestId('backup-pasta-msg').textContent).toBe('Pasta de backup: FINUP.')
  })

  it('IndexedDB sem resposta: o nome aparece na hora e, no prazo, avisa que a escolha não ficou guardada', async () => {
    await abrir({ idb: idbFalso({ mudo: true }), picker: async () => pasta() })
    await escolher()
    expect(pastaAtual()).toMatch(/Pasta: FINUP/)
    expect(perguntar()).toBe('sempre')
    await passar(PRAZO_IDB_MS + 50)
    const msg = screen.getByTestId('backup-pasta-msg')
    expect(msg.getAttribute('role')).toBe('alert')
    expect(msg.textContent).toMatch(/vale só até fechar ou recarregar.*não respondeu.*Downloads/)
    expect(pastaAtual()).toMatch(/Pasta: FINUP/) // a tela não perde a pasta
    expect(screen.getByText(/preferências do backup ao sair não ficam guardadas neste computador/)).toBeTruthy()
  })

  it('IndexedDB com erro ao guardar a pasta: avisa o motivo', async () => {
    await abrir({ idb: idbFalso({ erroGravar: erro('DataCloneError') }), picker: async () => pasta() })
    await escolher()
    await passar(50)
    expect(screen.getByTestId('backup-pasta-msg').textContent).toMatch(/não deixou guardar o acesso à pasta/)
    expect(pastaAtual()).toMatch(/Pasta: FINUP/)
  })

  it('permissão de gravar negada: mensagem de erro com o que fazer; nenhuma pasta; perguntar vira Sempre (Downloads)', async () => {
    await abrir({ idb: idbFalso(), picker: async () => pasta({ permissao: 'prompt', pedido: 'denied' }) })
    await escolher()
    await passar(50)
    const msg = screen.getByTestId('backup-pasta-msg')
    expect(msg.textContent).toMatch(/não deu permissão para o Finup gravar na pasta FINUP.*Edição de arquivos.*Downloads/)
    expect(pastaAtual()).toBe('Nenhuma pasta escolhida.')
    expect(perguntar()).toBe('sempre')
  })

  it('AbortError (o que o Chrome devolve quando recusa a edição de arquivos sem perguntar): não fica em silêncio', async () => {
    await abrir({ idb: idbFalso(), picker: async () => { throw erro('AbortError') } })
    await escolher()
    const msg = screen.getByTestId('backup-pasta-msg')
    expect(msg.textContent).toMatch(/Nenhuma pasta foi guardada.*Edição de arquivos/)
    expect(pastaAtual()).toBe('Nenhuma pasta escolhida.')
    expect(perguntar()).toBe('nunca') // pode ter sido só "Cancelar": não liga nada sozinho
  })

  it('"Perguntar ao sair" já escolhido como Nunca: escolher a pasta não muda', async () => {
    await abrir({ idb: idbFalso(), picker: async () => pasta() })
    fireEvent.change(screen.getByLabelText('Perguntar ao sair'), { target: { value: 'nunca' } })
    await passar(50)
    await escolher()
    expect(pastaAtual()).toMatch(/Pasta: FINUP/)
    expect(perguntar()).toBe('nunca')
  })

  it('aparelho sem a pasta guardada (só o nome no espelho): diz que é preciso escolher de novo', async () => {
    localStorage.setItem('finup_backup_vm_u1_espelho', JSON.stringify({ nomePasta: 'FINUP', perguntar: 'sempre', manter: 10, ultimo: null }))
    await abrir({ idb: idbFalso({ mudo: true }), picker: async () => pasta() })
    expect(pastaAtual()).toMatch(/Pasta FINUP: este navegador não guardou o acesso a ela\. Escolha a pasta de novo/)
  })
})
