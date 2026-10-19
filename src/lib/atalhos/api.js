import { authHeaders, clearTokenAndRedirect, exigirConexao } from '../api'

// Atalhos do usuário logado — sempre via /api/atalhos (o Neon não é acessado do browser).
async function chamar(url, { method = 'GET', body } = {}) {
  exigirConexao(url, method)
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) {
    clearTokenAndRedirect()
    throw new Error('Sessão expirada')
  }
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `Falha (${res.status})`)
  return json
}

export const listarAtalhos = () => chamar('/api/atalhos').then(r => r.atalhos || [])
export const gravarAtalhos = (itens) => chamar('/api/atalhos', { method: 'PUT', body: { itens } })
export const restaurarAtalho = (acaoId) => chamar(`/api/atalhos?acao_id=${encodeURIComponent(acaoId)}`, { method: 'DELETE' })
export const restaurarTodosAtalhos = () => chamar('/api/atalhos', { method: 'DELETE' })
