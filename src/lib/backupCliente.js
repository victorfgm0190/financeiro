// BACKUP COMPLETO — lado do navegador: exportar (páginas → um arquivo), ler e conferir um arquivo,
// prévia, envio em partes + restauração tudo-ou-nada e conferência. Rota: api/backup.js.
import { authHeaders } from './api.js'
import { validarArquivo, conferirIntegridade, nomeDoArquivo, perfisDoArquivo } from './backupFormato.js'
import { montarBackup, dividirEmPartes, serializarBackup } from './backupMontagem.js'

// Prazo de cada chamada: nada pode deixar a tela "em andamento" para sempre.
export const PRAZO_CHAMADA_MS = 120_000
export const PRAZO_APLICAR_MS = 330_000 // a restauração tem até 300 s no servidor

async function chamar(path, { method = 'GET', body, prazoMs = PRAZO_CHAMADA_MS } = {}) {
  let res
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null
  const t = ctrl ? setTimeout(() => ctrl.abort(), prazoMs) : null
  try {
    res = await fetch(path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...authHeaders() },
      ...(body ? { body: JSON.stringify(body) } : {}),
      ...(ctrl ? { signal: ctrl.signal } : {}),
    })
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error(`O servidor não respondeu em ${Math.round(prazoMs / 1000)} s. Tente de novo.`, { cause: err })
    throw new Error('Sem conexão com o servidor. Confira a internet e tente de novo.', { cause: err })
  } finally {
    if (t) clearTimeout(t)
  }
  let dados = null
  try { dados = await res.json() } catch { /* corpo não-JSON */ }
  if (!res.ok) {
    const err = new Error(dados?.error || `Falha na comunicação com o servidor (${res.status}).`)
    err.status = res.status
    err.dados = dados
    throw err
  }
  return dados
}

// Exporta o banco do ambiente. → { arquivo, texto, nome }. Uma exportação por vez neste aparelho
// (o botão e o "Sim" do backup ao sair não disputam): a segunda chamada é recusada na hora.
let exportando = false
export const exportandoAgora = () => exportando
export async function exportarBackup({ onProgresso } = {}) {
  if (exportando) throw new Error('Já existe um backup sendo gerado. Aguarde ele terminar.')
  exportando = true
  try {
    const arquivo = await montarBackup({
      obterManifesto: async () => (await chamar('/api/backup?acao=manifesto')).manifesto,
      obterPagina: (t, o) => chamar(`/api/backup?acao=pagina&tabela=${encodeURIComponent(t)}&offset=${o}`),
      onProgresso,
    })
    return { arquivo, texto: serializarBackup(arquivo), nome: nomeDoArquivo(arquivo.manifesto.ambiente) }
  } finally {
    exportando = false
  }
}

export function baixarArquivo(nome, texto, doc = globalThis.document) {
  const url = URL.createObjectURL(new Blob([texto], { type: 'application/json' }))
  const a = doc.createElement('a')
  a.href = url
  a.download = nome
  doc.body.appendChild(a)
  a.click()
  doc.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

// Lê um arquivo escolhido pelo usuário. → { arquivo } | lança Error com a mensagem para a tela.
export async function lerArquivoBackup(file) {
  let arq
  try { arq = JSON.parse(await file.text()) } catch { throw new Error('Arquivo inválido: não é um JSON.') }
  const v = validarArquivo(arq)
  if (!v.ok) { const e = new Error(v.erro); e.antigo = !!v.antigo; throw e }
  const integ = await conferirIntegridade(arq)
  if (!integ.ok) throw new Error(`O arquivo foi alterado ou corrompido depois de gerado (${integ.divergentes.slice(0, 5).join(', ')}). Não dá para restaurar.`)
  return { arquivo: arq }
}

export async function previaRestauracao(arquivo) {
  return chamar('/api/backup', { method: 'POST', body: { acao: 'previa', manifesto: arquivo.manifesto, perfis: perfisDoArquivo(arquivo) } })
}

const novoLote = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, '')

// Envia em partes e aplica. onProgresso({ fase: 'enviando'|'aplicando', feitas, total }).
// → { conferencia, versao, tempoMs, perfisSomem }. Erro: nada foi alterado no banco.
export async function restaurarBackup(arquivo, { onProgresso = () => {} } = {}) {
  const loteId = novoLote()
  const partes = dividirEmPartes(arquivo)
  try {
    for (const [i, p] of partes.entries()) {
      onProgresso({ fase: 'enviando', feitas: i, total: partes.length })
      await chamar('/api/backup', { method: 'POST', body: { acao: 'parte', loteId, ...p } })
    }
    onProgresso({ fase: 'aplicando', feitas: partes.length, total: partes.length })
    return await chamar('/api/backup', { method: 'POST', prazoMs: PRAZO_APLICAR_MS, body: { acao: 'aplicar', loteId, manifesto: arquivo.manifesto, perfis: perfisDoArquivo(arquivo) } })
  } catch (err) {
    try { await chamar('/api/backup', { method: 'POST', body: { acao: 'limpar', loteId } }) } catch { /* fica para a limpeza automática */ }
    throw err
  }
}

export async function conferirComArquivo(arquivo) {
  return (await chamar('/api/backup', { method: 'POST', body: { acao: 'conferir', manifesto: arquivo.manifesto } })).conferencia
}
