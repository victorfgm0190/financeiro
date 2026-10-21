// Armazenamento do aparelho para o modo sem internet: o estado do app (cache para abrir rápido e
// offline) e a FILA de alterações pendentes de envio (src/lib/filaOffline.js). Um banco IndexedDB
// por ambiente e usuário — a fila de uma pessoa nunca vai para a sessão de outra.
//
// Tudo em try/catch: navegador sem IndexedDB, modo privado ou quota estourada deixam o app
// funcionando só com o banco (o que der errado volta como null/false, e `falhou` registra).
//
// Substitui o cache do localStorage (finup_v1): o estado já passa dos ~5,2 milhões de caracteres
// que o localStorage aceita, e a gravação falhava em silêncio. migrarDoLocalStorage move o que
// existir lá na primeira abertura.

import { STORAGE_KEY } from './storage.js'

const VERSAO_DB = 1
const KV = 'kv'
const FILA = 'fila'

// `sessao` = getSessao() (src/lib/api.js): id = sub do token (o mesmo no login normal e no de
// emergência do mesmo usuário), ambSigla = ambiente.
export function nomeDoBanco(sessao) {
  if (!sessao?.id) return null
  const amb = String(sessao.ambSigla || 'vm').toLowerCase()
  return `finup_${amb}_${String(sessao.id)}`
}

const req = (r) => new Promise((ok, erro) => { r.onsuccess = () => ok(r.result); r.onerror = () => erro(r.error) })

// Backend IndexedDB (navegador). Abre sob demanda e reaproveita a conexão.
export function backendIndexedDb(nome, idb = globalThis.indexedDB) {
  let conexao = null
  const abrir = () => {
    if (!idb) return Promise.reject(new Error('IndexedDB indisponível'))
    conexao ??= new Promise((ok, erro) => {
      const r = idb.open(nome, VERSAO_DB)
      r.onupgradeneeded = () => {
        const db = r.result
        if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV)
        if (!db.objectStoreNames.contains(FILA)) db.createObjectStore(FILA, { keyPath: 'chave' })
      }
      r.onsuccess = () => ok(r.result)
      r.onerror = () => erro(r.error)
      r.onblocked = () => erro(new Error('IndexedDB bloqueado por outra aba'))
    })
    return conexao
  }
  const tx = async (store, modo, fn) => {
    const db = await abrir()
    const t = db.transaction(store, modo)
    const resultado = await fn(t.objectStore(store))
    await new Promise((ok, erro) => { t.oncomplete = ok; t.onerror = () => erro(t.error); t.onabort = () => erro(t.error) })
    return resultado
  }
  return {
    get: (store, chave) => tx(store, 'readonly', s => req(s.get(chave))),
    put: (store, valor, chave) => tx(store, 'readwrite', s => req(chave === undefined ? s.put(valor) : s.put(valor, chave))),
    putMuitos: (store, valores) => tx(store, 'readwrite', s => Promise.all(valores.map(v => req(s.put(v))))),
    getAll: (store) => tx(store, 'readonly', s => req(s.getAll())),
    apagar: (store, chaves) => tx(store, 'readwrite', s => Promise.all(chaves.map(c => req(s.delete(c))))),
    destruir: async () => {
      try { (await conexao)?.close() } catch { /* já fechada */ }
      conexao = null
      if (idb) await req(idb.deleteDatabase(nome))
    },
  }
}

// Backend em memória (testes) — mesma interface.
export function backendMemoria() {
  const stores = { [KV]: new Map(), [FILA]: new Map() }
  const copia = (v) => (v === undefined ? v : structuredClone(v))
  return {
    stores,
    get: async (store, chave) => copia(stores[store].get(chave)),
    put: async (store, valor, chave) => { stores[store].set(chave ?? valor.chave, copia(valor)) },
    putMuitos: async (store, valores) => { for (const v of valores) stores[store].set(v.chave, copia(v)) },
    getAll: async (store) => [...stores[store].values()].map(copia),
    apagar: async (store, chaves) => { for (const c of chaves) stores[store].delete(c) },
    destruir: async () => { stores[KV].clear(); stores[FILA].clear() },
  }
}

// API do app sobre um backend. Nunca lança: falha vira null/false e liga `falhou`.
export function criarArmazenamento(backend) {
  const a = { falhou: false, ultimoErro: null }
  const seguro = async (fn, padrao) => {
    // Depois de apagarTudo (Sair → "apagar os dados"), nada mais grava: um efeito atrasado
    // recriaria o banco no aparelho que a pessoa acabou de limpar.
    if (!backend || a.desligado) return padrao
    try { return await fn() } catch (err) {
      a.falhou = true
      a.ultimoErro = err?.name === 'QuotaExceededError' ? 'quota' : (err?.message || String(err))
      console.warn('[armazenamento] falhou:', a.ultimoErro)
      return padrao
    }
  }
  Object.assign(a, {
    lerEstado: () => seguro(() => backend.get(KV, 'estado'), null),
    gravarEstado: (estado) => seguro(async () => { await backend.put(KV, estado, 'estado'); return true }, false),
    lerFila: () => seguro(() => backend.getAll(FILA), []),
    gravarEntradas: (entradas) => seguro(async () => { if (entradas.length) await backend.putMuitos(FILA, entradas); return true }, false),
    removerEntradas: (chaves) => seguro(async () => { if (chaves.length) await backend.apagar(FILA, chaves); return true }, false),
    apagarTudo: async () => {
      const ok = await seguro(async () => { await backend.destruir(); return true }, false)
      a.desligado = true
      return ok
    },
  })
  return a
}

// Primeira abertura com a versão nova: o cache do localStorage vai para o IndexedDB e só então sai
// do localStorage. Se a gravação falhar, o localStorage fica como está (nada se perde) e o app
// segue só com o banco. Devolve o estado migrado (ou null).
export async function migrarDoLocalStorage(armazenamento, ls = globalThis.localStorage) {
  let bruto
  try { bruto = ls?.getItem(STORAGE_KEY) ?? null } catch { return null }
  if (!bruto) return null
  let estado
  try { estado = JSON.parse(bruto) } catch {
    try { ls.removeItem(STORAGE_KEY) } catch { /* indisponível */ }
    return null
  }
  if (!(await armazenamento.gravarEstado(estado))) return null
  try { ls.removeItem(STORAGE_KEY) } catch { /* indisponível */ }
  return estado
}

export function apagarCacheAntigo(ls = globalThis.localStorage) {
  try { ls?.removeItem(STORAGE_KEY) } catch { /* indisponível */ }
}

// Dados do aparelho guardados fora do IndexedDB que também são de UM usuário (o cache antigo e o
// override de saldo das reservas). Saem junto quando o aparelho é limpo ou troca de dono.
const CHAVES_DE_DADOS_LS = [STORAGE_KEY, 'finup_reserve_balances']
export function apagarDadosLocalStorage(ls = globalThis.localStorage) {
  for (const k of CHAVES_DE_DADOS_LS) {
    try { ls?.removeItem(k) } catch { /* indisponível */ }
  }
}

// Dono do cache deste aparelho: o nomeDoBanco da última sessão que entrou.
export const DONO_DO_CACHE_KEY = 'finup_cache_dono'

const apagarBanco = (idb, nome) => new Promise((ok) => {
  try {
    const r = idb.deleteDatabase(nome)
    // Bloqueado (outra aba aberta): o navegador apaga quando ela fechar — não segura o login.
    r.onsuccess = r.onerror = r.onblocked = () => ok()
  } catch { ok() }
})

// Login: o cache local de OUTRO usuário (ou de outro ambiente) é apagado antes de o app carregar —
// em computador compartilhado, quem entra nunca abre com os dados (nem com a fila) de quem saiu.
// Outro dono = o gravado em DONO_DO_CACHE_KEY ou qualquer banco finup_* que não seja o desta sessão
// (indexedDB.databases(), onde houver). Grava o dono novo no fim. Nunca lança; no máximo `limite` ms.
export async function garantirCacheDoUsuario(sessao, { idb = globalThis.indexedDB, ls = globalThis.localStorage, limite = 3000 } = {}) {
  const atual = nomeDoBanco(sessao)
  if (!atual) return []
  const trabalho = (async () => {
    const outros = new Set()
    let dono = null
    try { dono = ls?.getItem(DONO_DO_CACHE_KEY) ?? null } catch { /* indisponível */ }
    if (dono && dono !== atual) outros.add(dono)
    try {
      for (const { name } of (await idb?.databases?.()) || []) {
        if (name && name.startsWith('finup_') && name !== atual) outros.add(name)
      }
    } catch { /* databases() indisponível (Firefox antigo) — fica só o dono gravado */ }
    if (idb) await Promise.all([...outros].map(n => apagarBanco(idb, n)))
    if (outros.size) apagarDadosLocalStorage(ls)
    try { ls?.setItem(DONO_DO_CACHE_KEY, atual) } catch { /* indisponível */ }
    return [...outros]
  })()
  const tempo = new Promise(ok => setTimeout(() => ok([]), limite))
  try { return await Promise.race([trabalho, tempo]) } catch { return [] }
}
