import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  gravarNaPasta, permissaoDaPasta, backendBackup, comPrazo, PRAZO_IDB_MS, tipoDeErroDaPasta, perguntarAoSair, lerConfig, salvarConfig, suportaPasta, nomeDoBancoBackup, MANTER_PADRAO,
} from './backupPasta'

// Pasta falsa com a mesma forma do FileSystemDirectoryHandle.
function pastaFalsa(nomes = [], { permissao = 'prompt', pedido = 'granted' } = {}) {
  const arquivos = new Map(nomes.map(n => [n, 'antigo']))
  return {
    kind: 'directory', name: 'Backups', arquivos,
    async getFileHandle(n) {
      return { async createWritable() { let buf = ''; return { write: async (t) => { buf += t }, close: async () => { arquivos.set(n, buf) } } } }
    },
    async *entries() { for (const n of [...arquivos.keys()]) yield [n, { kind: 'file' }] },
    async removeEntry(n) { arquivos.delete(n) },
    queryPermission: async () => permissao,
    requestPermission: async () => pedido,
  }
}
const memoria = () => { let v; return { get: async () => v, set: async (x) => { v = x } } }

describe('gravar na pasta e rotação', () => {
  it('grava o arquivo e apaga só os mais antigos do Finup deste ambiente além de "manter"', async () => {
    const pasta = pastaFalsa([
      'finup-backup-vm-2026-11-01-0800.json', 'finup-backup-vm-2026-11-02-0800.json', 'finup-backup-vm-2026-11-03-0800.json',
      'finup-backup-teste1-2026-01-01-0800.json', 'minha-planilha.xlsx', 'finup-backup-vm-copia.json',
    ])
    const r = await gravarNaPasta(pasta, 'finup-backup-vm-2026-11-10-1830.json', '{"x":1}', { ambiente: 'vm', manter: 2 })
    expect(pasta.arquivos.get('finup-backup-vm-2026-11-10-1830.json')).toBe('{"x":1}')
    expect(r.apagados).toEqual(['finup-backup-vm-2026-11-01-0800.json', 'finup-backup-vm-2026-11-02-0800.json'])
    expect([...pasta.arquivos.keys()].sort()).toEqual([
      'finup-backup-teste1-2026-01-01-0800.json', 'finup-backup-vm-2026-11-03-0800.json', 'finup-backup-vm-2026-11-10-1830.json',
      'finup-backup-vm-copia.json', 'minha-planilha.xlsx',
    ])
  })
  it('permissão: só pede quando mandado (no clique) e devolve o que o navegador respondeu', async () => {
    expect(await permissaoDaPasta(pastaFalsa([], { permissao: 'prompt' }))).toBe('prompt')
    expect(await permissaoDaPasta(pastaFalsa([], { permissao: 'prompt', pedido: 'denied' }), { pedir: true })).toBe('denied')
    expect(await permissaoDaPasta(pastaFalsa([], { permissao: 'granted', pedido: 'denied' }), { pedir: true })).toBe('granted')
  })
  it('erro da pasta → permissão, pasta sumiu ou falha do backup', () => {
    expect(tipoDeErroDaPasta({ name: 'NotAllowedError' })).toBe('permissao')
    expect(tipoDeErroDaPasta({ name: 'NotFoundError' })).toBe('pasta')
    expect(tipoDeErroDaPasta(new Error('rede'))).toBe('backup')
  })
})

describe('preferências neste aparelho', () => {
  it('padrão: sem pasta, não pergunta; com pasta, pergunta; escolha explícita manda', () => {
    expect(perguntarAoSair({ pasta: null, perguntar: null })).toBe(false)
    expect(perguntarAoSair({ pasta: {}, perguntar: null })).toBe(true)
    expect(perguntarAoSair({ pasta: {}, perguntar: 'nunca' })).toBe(false)
    expect(perguntarAoSair({ pasta: null, perguntar: 'sempre' })).toBe(true)
  })
  it('guarda por usuário e ambiente; padrão de 10 backups', async () => {
    const b = memoria()
    expect(await lerConfig(b)).toMatchObject({ pasta: null, manter: MANTER_PADRAO, ultimo: null })
    await salvarConfig(b, { manter: 5 })
    expect(await salvarConfig(b, { ultimo: 123 })).toMatchObject({ manter: 5, ultimo: 123 })
    expect(nomeDoBancoBackup({ id: 'u1', ambSigla: 'TESTE1' })).toBe('finup_backup_teste1_u1')
    expect(nomeDoBancoBackup(null)).toBeNull()
  })
  it('suporte à escolha de pasta só com showDirectoryPicker (Safari/Firefox não têm)', () => {
    expect(suportaPasta({ showDirectoryPicker: () => {} })).toBe(true)
    expect(suportaPasta({})).toBe(false)
  })
})

// IndexedDB que nunca responde (o que travava a tela no teste do Chrome).
const idbMudo = () => ({ open: () => ({}) })
afterEach(() => { vi.useRealTimers() })

describe('IndexedDB pendurado nunca prende a tela', () => {
  it('lerConfig devolve as preferências vazias depois do prazo', async () => {
    vi.useFakeTimers()
    const p = lerConfig(backendBackup('finup_backup_x_u1', idbMudo()))
    await vi.advanceTimersByTimeAsync(PRAZO_IDB_MS + 10)
    await expect(p).resolves.toMatchObject({ pasta: null, ultimo: null, manter: MANTER_PADRAO })
  })
  it('salvarConfig termina (sem lançar) mesmo sem conseguir gravar', async () => {
    vi.useFakeTimers()
    const p = salvarConfig(backendBackup('finup_backup_x_u1', idbMudo()), { ultimo: 5 }, { manter: 3 })
    await vi.advanceTimersByTimeAsync(PRAZO_IDB_MS + 10)
    await expect(p).resolves.toMatchObject({ ultimo: 5, manter: 3 })
  })
  it('comPrazo: passa o resultado ou rejeita no prazo', async () => {
    await expect(comPrazo(Promise.resolve(7), 50)).resolves.toBe(7)
    await expect(comPrazo(new Promise(() => {}), 10, 'demorou')).rejects.toThrow('demorou')
  })
})
