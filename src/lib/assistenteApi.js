import { authHeaders, clearTokenAndRedirect, exigirConexao } from './api'

// Assistente IA: /api/assistente (interpretar), /api/ia-pre-lancamentos e /api/ia-apelidos.
// Nada daqui grava lançamento/agendamento — isso é o formulário, pelo sync de sempre.
async function chamar(url, { method = 'GET', body } = {}) {
  exigirConexao(url, method)
  const res = await fetch(url, {
    method,
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) {
    clearTokenAndRedirect()
    throw new Error('Sessão expirada')
  }
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(json.error || `Falha (${res.status})`), { status: res.status, dados: json })
  return json
}

// Evento para o aviso do Início recarregar a contagem de pré-lançamentos.
export const EVENTO_PRE_LANCAMENTOS = 'finup:ia-pre-lancamentos'
const avisar = () => { try { window.dispatchEvent(new Event(EVENTO_PRE_LANCAMENTOS)) } catch { /* sem window */ } }

export const interpretar = (pedido) => chamar('/api/assistente', { method: 'POST', body: pedido })

export const listarPreLancamentos = () => chamar('/api/ia-pre-lancamentos').then(r => r.itens || [])
export const guardarPreLancamento = (tipo, payload, textoOriginal) =>
  chamar('/api/ia-pre-lancamentos', { method: 'POST', body: { tipo, payload, texto_original: textoOriginal || null } })
    .then(r => { avisar(); return r.item })
export const concluirPreLancamento = (id, status, lancamentoId = null) =>
  chamar('/api/ia-pre-lancamentos', { method: 'PUT', body: { id, status, lancamento_id: lancamentoId } })
    .then(r => { avisar(); return r.item })

export const listarApelidos = () => chamar('/api/ia-apelidos').then(r => r.apelidos || [])
export const aprenderApelidos = (itens) => chamar('/api/ia-apelidos', { method: 'POST', body: { itens } })
export const editarApelido = (id, mudancas) => chamar('/api/ia-apelidos', { method: 'PUT', body: { id, ...mudancas } })
export const excluirApelido = (id) => chamar(`/api/ia-apelidos?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
