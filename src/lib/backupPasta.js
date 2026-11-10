// BACKUP AO SAIR (só no computador) — pasta escolhida pelo usuário (File System Access API), as
// preferências e a data do último backup. Tudo NESTE aparelho, por usuário e ambiente, num IndexedDB
// próprio (finup_backup_<ambiente>_<usuário>) — fica de pé mesmo quando "Sair e apagar dados deste
// aparelho" limpa o cache do app. Navegador sem a API (Safari, Firefox): o backup ao sair vai para
// Downloads.
import { arquivosParaApagar } from './backupFormato.js'

export const MANTER_PADRAO = 10
const STORE = 'cfg'
const CHAVE = 'config'

export const suportaPasta = (w = globalThis.window) => !!w && typeof w.showDirectoryPicker === 'function'

export function nomeDoBancoBackup(sessao) {
  if (!sessao?.id) return null
  return `finup_backup_${String(sessao.ambSigla || 'vm').toLowerCase()}_${String(sessao.id)}`
}

const req = (r) => new Promise((ok, erro) => { r.onsuccess = () => ok(r.result); r.onerror = () => erro(r.error) })
// Backend IndexedDB (navegador); testes passam um backend em memória { get, set }.
export function backendBackup(nome, idb = globalThis.indexedDB) {
  let conexao = null
  const abrir = () => {
    if (!idb || !nome) return Promise.reject(new Error('IndexedDB indisponível'))
    conexao ??= new Promise((ok, erro) => {
      const r = idb.open(nome, 1)
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE) }
      r.onsuccess = () => ok(r.result)
      r.onerror = () => erro(r.error)
    })
    return conexao
  }
  return {
    async get() { const db = await abrir(); return req(db.transaction(STORE).objectStore(STORE).get(CHAVE)) },
    async set(v) { const db = await abrir(); return req(db.transaction(STORE, 'readwrite').objectStore(STORE).put(v, CHAVE)) },
  }
}

const VAZIO = { pasta: null, nomePasta: '', perguntar: null, manter: MANTER_PADRAO, ultimo: null }
export async function lerConfig(backend) {
  try { return { ...VAZIO, ...((await backend?.get()) || {}) } } catch { return { ...VAZIO } }
}
export async function salvarConfig(backend, parcial) {
  const atual = await lerConfig(backend)
  const novo = { ...atual, ...parcial }
  try { await backend?.set(novo) } catch { /* sem IndexedDB: vale só até recarregar */ }
  return novo
}

// "Perguntar ao sair" valendo: escolha explícita; sem escolha, sempre — depois que a pasta foi escolhida.
export const perguntarAoSair = (cfg) => (cfg?.perguntar === 'sempre' || cfg?.perguntar === 'nunca'
  ? cfg.perguntar === 'sempre'
  : !!cfg?.pasta)

export async function escolherPasta(w = globalThis.window) {
  return w.showDirectoryPicker({ id: 'finup-backup', mode: 'readwrite' })
}

// 'granted' | 'denied' | 'prompt'. Pede (requestPermission) só quando `pedir` — precisa vir de um clique.
export async function permissaoDaPasta(pasta, { pedir = false } = {}) {
  if (!pasta?.queryPermission) return 'granted'
  const atual = await pasta.queryPermission({ mode: 'readwrite' })
  if (atual === 'granted' || !pedir) return atual
  return pasta.requestPermission({ mode: 'readwrite' })
}

// Grava o arquivo na pasta e apaga os backups mais antigos DESTE ambiente além de `manter` (só nomes
// no padrão do Finup — nunca outros arquivos). → { nome, apagados }
export async function gravarNaPasta(pasta, nome, texto, { ambiente, manter = MANTER_PADRAO }) {
  const fh = await pasta.getFileHandle(nome, { create: true })
  const w = await fh.createWritable()
  await w.write(texto)
  await w.close()
  const nomes = []
  for await (const [n, h] of pasta.entries()) if (h.kind === 'file') nomes.push(n)
  const apagar = arquivosParaApagar(nomes, ambiente, manter)
  for (const n of apagar) await pasta.removeEntry(n)
  return { nome, apagados: apagar }
}

// Erro da pasta → o que dizer e oferecer.
export function tipoDeErroDaPasta(err) {
  if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') return 'permissao'
  if (err?.name === 'NotFoundError' || err?.name === 'InvalidStateError') return 'pasta'
  return 'backup'
}
