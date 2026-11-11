// BACKUP AO SAIR (só no computador) — pasta escolhida pelo usuário (File System Access API), as
// preferências e a data do último backup. Tudo NESTE aparelho, por usuário e ambiente, num IndexedDB
// próprio (finup_backup_<ambiente>_<usuário>) — fica de pé mesmo quando "Sair e apagar dados deste
// aparelho" limpa o cache do app. Navegador sem a API (Safari, Firefox): o backup ao sair vai para
// Downloads.
import { arquivosParaApagar } from './backupFormato.js'

export const MANTER_PADRAO = 10
const STORE = 'cfg'
const CHAVE = 'config'
// Nada do IndexedDB pode prender a tela: cada operação tem prazo. Passou do prazo → segue sem a
// preferência guardada (a tela mostra "Nenhum backup feito neste computador").
export const PRAZO_IDB_MS = 3000

// Promessa com prazo: rejeita com Error('prazo') se não terminar em `ms`.
export function comPrazo(promessa, ms, mensagem = 'Tempo esgotado') {
  let t
  return Promise.race([
    promessa,
    new Promise((_, erro) => { t = setTimeout(() => erro(Object.assign(new Error(mensagem), { prazo: true })), ms) }),
  ]).finally(() => clearTimeout(t))
}

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
    conexao ??= comPrazo(new Promise((ok, erro) => {
      const r = idb.open(nome, 1)
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE) }
      r.onsuccess = () => {
        // Outra aba (ou outra versão) pedindo o banco: solta a conexão em vez de travar as duas. O
        // navegador fechou a conexão (dados do site apagados): a próxima operação abre de novo.
        r.result.onversionchange = () => { try { r.result.close() } catch { /* já fechada */ } conexao = null }
        r.result.onclose = () => { conexao = null }
        ok(r.result)
      }
      r.onerror = () => erro(r.error)
      r.onblocked = () => erro(new Error('IndexedDB bloqueado por outra aba'))
    }), PRAZO_IDB_MS, 'IndexedDB não respondeu').catch((err) => { conexao = null; throw err })
    return conexao
  }
  // Conexão que deu erro (fechada por fora, InvalidStateError) não fica em cache: a próxima tenta de novo.
  const usar = async (fn) => {
    const db = await abrir()
    try { return await comPrazo(req(fn(db)), PRAZO_IDB_MS, 'IndexedDB não respondeu') } catch (err) { if (!err?.prazo) conexao = null; throw err }
  }
  return {
    get: () => usar(db => db.transaction(STORE).objectStore(STORE).get(CHAVE)),
    set: (v) => usar(db => db.transaction(STORE, 'readwrite').objectStore(STORE).put(v, CHAVE)),
  }
}

// ESPELHO no localStorage das preferências que não são a pasta (nome dela, perguntar, manter, último
// backup): o IndexedDB pode não responder (Chrome de 10/11) e a pasta em si — um
// FileSystemDirectoryHandle — só cabe no IndexedDB. Sem ele, a tela ainda sabe o nome da pasta e avisa
// que o acesso precisa ser escolhido de novo.
export const chaveEspelho = (nomeBanco) => (nomeBanco ? `${nomeBanco}_espelho` : null)
const CAMPOS_ESPELHO = ['nomePasta', 'perguntar', 'manter', 'ultimo']
function lerEspelho({ ls = globalThis.localStorage, chave } = {}) {
  if (!chave) return {}
  try {
    const v = JSON.parse(ls?.getItem(chave) || 'null')
    return v && typeof v === 'object' ? Object.fromEntries(CAMPOS_ESPELHO.filter(c => c in v).map(c => [c, v[c]])) : {}
  } catch { return {} }
}
function gravarEspelho(cfg, { ls = globalThis.localStorage, chave } = {}) {
  if (!chave) return
  try { ls?.setItem(chave, JSON.stringify(Object.fromEntries(CAMPOS_ESPELHO.map(c => [c, cfg?.[c] ?? null])))) } catch { /* cheio/indisponível */ }
}

// Por que o IndexedDB não guardou/leu: 'prazo' (não respondeu) | 'indisponivel' | 'cota' | 'pasta'
// (o navegador não deixou guardar a pasta) | 'erro'.
export function motivoDoIdb(err) {
  if (err?.prazo) return 'prazo'
  if (/indispon/i.test(err?.message || '')) return 'indisponivel'
  if (err?.name === 'QuotaExceededError') return 'cota'
  if (err?.name === 'DataCloneError') return 'pasta'
  return 'erro'
}
const TEXTO_MOTIVO = {
  prazo: 'o armazenamento do navegador não respondeu',
  indisponivel: 'o navegador não oferece armazenamento para o site (janela anônima ou dados do site bloqueados)',
  cota: 'o armazenamento do navegador está cheio',
  pasta: 'o navegador não deixou guardar o acesso à pasta',
  erro: 'o armazenamento do navegador deu erro',
}
export const textoDoMotivo = (motivo) => TEXTO_MOTIVO[motivo] || TEXTO_MOTIVO.erro

const VAZIO = { pasta: null, nomePasta: '', perguntar: null, manter: MANTER_PADRAO, ultimo: null }
// Nunca fica pendurada: sem IndexedDB, erro ou prazo esgotado → o espelho (ou as preferências vazias).
// → { cfg, guardado: true | false, motivo }
export async function lerConfigDetalhado(backend, espelho = {}) {
  const doEspelho = lerEspelho(espelho)
  try {
    const v = await comPrazo(Promise.resolve(backend?.get()), PRAZO_IDB_MS, 'IndexedDB não respondeu')
    return { cfg: { ...VAZIO, ...doEspelho, ...(v || {}) }, guardado: true, motivo: null }
  } catch (err) {
    return { cfg: { ...VAZIO, ...doEspelho }, guardado: false, motivo: motivoDoIdb(err) }
  }
}
export async function lerConfig(backend, espelho) { return (await lerConfigDetalhado(backend, espelho)).cfg }

// Grava sobre `base` (o que a tela já tem) ou sobre o que estiver guardado. Nunca lança, nunca prende
// quem chamou além do prazo. → { cfg, guardado, motivo } — guardado false: vale só até recarregar.
export async function salvarConfigDetalhado(backend, parcial, base = null, espelho = {}) {
  const atual = base || await lerConfig(backend, espelho)
  const novo = { ...atual, ...parcial }
  gravarEspelho(novo, espelho)
  try {
    await comPrazo(Promise.resolve(backend?.set(novo)), PRAZO_IDB_MS, 'IndexedDB não respondeu')
    return { cfg: novo, guardado: true, motivo: null }
  } catch (err) {
    return { cfg: novo, guardado: false, motivo: motivoDoIdb(err) }
  }
}
export async function salvarConfig(backend, parcial, base = null, espelho) {
  return (await salvarConfigDetalhado(backend, parcial, base, espelho)).cfg
}

// "Perguntar ao sair" valendo: escolha explícita; sem escolha, sempre — depois que a pasta foi escolhida.
export const perguntarAoSair = (cfg) => (cfg?.perguntar === 'sempre' || cfg?.perguntar === 'nunca'
  ? cfg.perguntar === 'sempre'
  : !!cfg?.pasta)

export async function escolherPasta(w = globalThis.window) {
  return w.showDirectoryPicker({ id: 'finup-backup', mode: 'readwrite' })
}

// Escolha da pasta, sem falhar em silêncio. → { status, pasta?, permissao?, mensagem? }
//   'ok'        pasta escolhida (permissao 'granted', ou 'prompt' = o navegador pergunta no 1º backup)
//   'cancelado' AbortError. O Chrome devolve o MESMO erro quando a pessoa fecha a janela E quando ele
//               recusa a permissão de editar arquivos depois da escolha (bloqueada nas configurações do
//               site ou bloqueada automaticamente depois de recusas seguidas — sem mostrar pedido nenhum).
//               Não dá para distinguir: a tela explica os dois casos.
//   'negada'    a permissão de gravar foi recusada (pedido respondido com "Não permitir")
//   'erro'      qualquer outro erro
export async function escolherPastaDeBackup(w = globalThis.window) {
  let pasta
  try {
    pasta = await escolherPasta(w)
  } catch (err) {
    if (err?.name === 'AbortError') return { status: 'cancelado' }
    if (tipoDeErroDaPasta(err) === 'permissao') return { status: 'negada', mensagem: err?.message || String(err) }
    return { status: 'erro', mensagem: err?.message || String(err) }
  }
  let permissao
  try { permissao = await permissaoDaPasta(pasta, { pedir: true }) } catch { permissao = 'prompt' } // sem clique ativo: pede no Sair
  if (permissao === 'denied') return { status: 'negada', pasta }
  return { status: 'ok', pasta, permissao }
}

const COMO_LIBERAR = 'No Chrome: clique no cadeado ao lado do endereço → Configurações do site → "Edição de arquivos" → Permitir, e escolha a pasta de novo.'
// O que dizer depois da escolha. tipo: 'ok' | 'aviso' | 'erro'.
//   guardado: a escolha ficou gravada neste computador (null = ainda gravando); perguntar: "Perguntar ao sair" ligado.
export function mensagemDaEscolha(r, { guardado = true, motivo = null, perguntar = true } = {}) {
  const semPasta = perguntar
    ? 'Enquanto isso, o backup ao sair vai para a pasta Downloads.'
    : 'Enquanto isso, se ligar "Perguntar ao sair", o backup ao sair vai para a pasta Downloads.'
  if (r.status === 'cancelado') {
    return { tipo: 'aviso', texto: `Nenhuma pasta foi guardada. Se você selecionou a pasta e mesmo assim viu esta mensagem, o navegador recusou ao Finup a permissão de gravar nela. ${COMO_LIBERAR} ${semPasta}` }
  }
  if (r.status === 'negada') {
    return { tipo: 'erro', texto: `O navegador não deu permissão para o Finup gravar na pasta${r.pasta?.name ? ` ${r.pasta.name}` : ''}. ${COMO_LIBERAR} ${semPasta}` }
  }
  if (r.status === 'erro') return { tipo: 'erro', texto: `Não foi possível usar a pasta: ${r.mensagem}. ${semPasta}` }
  const base = `Pasta de backup: ${r.pasta.name}.${r.permissao === 'prompt' ? ' O navegador vai pedir permissão para gravar nela no primeiro backup.' : ''}`
  if (guardado === false) {
    return { tipo: 'aviso', texto: `${base} Mas a escolha vale só até fechar ou recarregar o Finup: ${textoDoMotivo(motivo)} e ela não ficou guardada neste computador. Depois disso, escolha a pasta de novo; sem pasta, o backup ao sair vai para a pasta Downloads.` }
  }
  return { tipo: 'ok', texto: base }
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
