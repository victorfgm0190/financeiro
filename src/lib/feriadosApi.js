import { authHeaders, clearTokenAndRedirect, exigirConexao } from './api'

// Cliente de /api/feriados (Configurações → Cadastros → Feriados). Tudo no Neon via /api.
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
  if (!res.ok) throw Object.assign(new Error(json.error || `Falha (${res.status})`), { status: res.status })
  return json
}

export const listarFeriadosApi = async () => (await chamar('/api/feriados')).feriados || []
export const alternarFeriadoAutomaticoApi = async (chave, ativo) => (await chamar('/api/feriados', { method: 'POST', body: { chave, ativo } })).feriado
export const criarFeriadoApi = async (f) => (await chamar('/api/feriados', { method: 'POST', body: f })).feriado
export const atualizarFeriadoApi = async (f) => (await chamar('/api/feriados', { method: 'PUT', body: f })).feriado
export const excluirFeriadoApi = (id) => chamar(`/api/feriados?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
