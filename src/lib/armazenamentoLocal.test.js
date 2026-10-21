import { describe, it, expect, vi } from 'vitest'
import { criarArmazenamento, backendMemoria, migrarDoLocalStorage, nomeDoBanco, apagarCacheAntigo, garantirCacheDoUsuario } from './armazenamentoLocal.js'
import { STORAGE_KEY } from './storage.js'

const lsFalso = (inicial = {}) => {
  const m = new Map(Object.entries(inicial))
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k), m }
}

describe('armazenamento do aparelho', () => {
  it('estado e fila sobrevivem a um novo "abrir" sobre o mesmo backend', async () => {
    const aparelho = backendMemoria()
    const a = criarArmazenamento(aparelho)
    await a.gravarEstado({ transactions: [{ id: 't1' }] })
    await a.gravarEntradas([{ chave: 'lancamentos:t1', versao: '1' }])
    const b = criarArmazenamento(aparelho)
    expect(await b.lerEstado()).toEqual({ transactions: [{ id: 't1' }] })
    expect((await b.lerFila()).map(e => e.chave)).toEqual(['lancamentos:t1'])
    await b.removerEntradas(['lancamentos:t1'])
    expect(await b.lerFila()).toEqual([])
  })

  it('apagarTudo limpa estado e fila', async () => {
    const a = criarArmazenamento(backendMemoria())
    await a.gravarEstado({ x: 1 })
    await a.gravarEntradas([{ chave: 'k', versao: '1' }])
    await a.apagarTudo()
    expect(await a.lerEstado()).toBeNull()
    expect(await a.lerFila()).toEqual([])
  })

  it('depois de apagarTudo, nada mais grava (não recria o banco no aparelho)', async () => {
    const aparelho = backendMemoria()
    const a = criarArmazenamento(aparelho)
    await a.apagarTudo()
    expect(await a.gravarEstado({ x: 1 })).toBe(false)
    expect(await a.gravarEntradas([{ chave: 'k', versao: '1' }])).toBe(false)
    expect(aparelho.stores.kv.size + aparelho.stores.fila.size).toBe(0)
  })

  it('falha do navegador (quota) não lança: devolve false e registra', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const quebrado = { ...backendMemoria(), put: async () => { throw Object.assign(new Error('cheio'), { name: 'QuotaExceededError' }) } }
    const a = criarArmazenamento(quebrado)
    expect(await a.gravarEstado({ x: 1 })).toBe(false)
    expect(a.falhou).toBe(true)
    expect(a.ultimoErro).toBe('quota')
  })

  it('sem backend (sem sessão / sem IndexedDB): tudo vazio, sem erro', async () => {
    const a = criarArmazenamento(null)
    expect(await a.lerEstado()).toBeNull()
    expect(await a.lerFila()).toEqual([])
    expect(await a.gravarEntradas([{ chave: 'k' }])).toBe(false)
  })

  it('nome do banco por ambiente e usuário', () => {
    expect(nomeDoBanco({ id: 'u1', ambSigla: 'VM' })).toBe('finup_vm_u1')
    expect(nomeDoBanco({ id: 'u1', ambSigla: 'aa' })).toBe('finup_aa_u1')
    expect(nomeDoBanco(null)).toBeNull()
  })
})

describe('migração do cache antigo (localStorage → IndexedDB)', () => {
  it('move e só então limpa o localStorage', async () => {
    const ls = lsFalso({ [STORAGE_KEY]: JSON.stringify({ accounts: [{ id: 'a1' }] }) })
    const a = criarArmazenamento(backendMemoria())
    expect(await migrarDoLocalStorage(a, ls)).toEqual({ accounts: [{ id: 'a1' }] })
    expect(await a.lerEstado()).toEqual({ accounts: [{ id: 'a1' }] })
    expect(ls.m.has(STORAGE_KEY)).toBe(false)
  })

  it('se gravar falhar, o localStorage fica intacto (nada se perde) e segue só com o banco', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ls = lsFalso({ [STORAGE_KEY]: JSON.stringify({ accounts: [] }) })
    const a = criarArmazenamento({ ...backendMemoria(), put: async () => { throw new Error('falhou') } })
    expect(await migrarDoLocalStorage(a, ls)).toBeNull()
    expect(ls.m.has(STORAGE_KEY)).toBe(true)
  })

  it('sem cache antigo: nada a fazer; apagarCacheAntigo remove a chave', async () => {
    const ls = lsFalso()
    expect(await migrarDoLocalStorage(criarArmazenamento(backendMemoria()), ls)).toBeNull()
    ls.setItem(STORAGE_KEY, '{}')
    apagarCacheAntigo(ls)
    expect(ls.m.has(STORAGE_KEY)).toBe(false)
  })
})

describe('garantirCacheDoUsuario (login com outro usuário)', () => {
  const idbFalso = (nomes) => {
    const bancos = new Set(nomes)
    return {
      bancos,
      databases: async () => [...bancos].map(name => ({ name })),
      deleteDatabase: (n) => { const r = {}; setTimeout(() => { bancos.delete(n); r.onsuccess?.() }); return r },
    }
  }
  const sessao = (id, ambSigla = 'vm') => ({ id, ambSigla })

  it('apaga o cache de outro usuário e grava o novo dono', async () => {
    const idb = idbFalso(['finup_vm_1', 'finup_vm_2', 'outro_app'])
    const ls = lsFalso({ finup_cache_dono: 'finup_vm_1', [STORAGE_KEY]: '{}', finup_reserve_balances: '{}', finup_ultimo_ambiente: 'vm' })
    const apagados = await garantirCacheDoUsuario(sessao(2), { idb, ls })
    expect(apagados).toEqual(['finup_vm_1'])
    expect([...idb.bancos]).toEqual(['finup_vm_2', 'outro_app'])
    expect(ls.m.get('finup_cache_dono')).toBe('finup_vm_2')
    expect(ls.m.has(STORAGE_KEY)).toBe(false)
    expect(ls.m.has('finup_reserve_balances')).toBe(false)
    expect(ls.m.get('finup_ultimo_ambiente')).toBe('vm')
  })

  it('mesmo usuário: não apaga nada (a fila guardada segue para o envio)', async () => {
    const idb = idbFalso(['finup_vm_2'])
    const ls = lsFalso({ finup_cache_dono: 'finup_vm_2', finup_reserve_balances: '{"a":1}' })
    expect(await garantirCacheDoUsuario(sessao(2), { idb, ls })).toEqual([])
    expect([...idb.bancos]).toEqual(['finup_vm_2'])
    expect(ls.m.get('finup_reserve_balances')).toBe('{"a":1}')
  })

  it('sem dono gravado (aparelho antigo) e sem databases(): só grava o dono', async () => {
    const ls = lsFalso()
    expect(await garantirCacheDoUsuario(sessao(7, 'AB'), { idb: { deleteDatabase: vi.fn() }, ls })).toEqual([])
    expect(ls.m.get('finup_cache_dono')).toBe('finup_ab_7')
  })

  it('sem sessão: não faz nada', async () => {
    const ls = lsFalso({ finup_cache_dono: 'finup_vm_1' })
    expect(await garantirCacheDoUsuario(null, { idb: idbFalso([]), ls })).toEqual([])
    expect(ls.m.get('finup_cache_dono')).toBe('finup_vm_1')
  })
})
