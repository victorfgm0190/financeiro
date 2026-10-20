import { authHeaders, clearTokenAndRedirect, exigirConexao } from './api'

// Cliente das rotas do módulo de Contratos (api/contrato*.js, api/indices.js). Tudo no Neon via
// /api — nada em localStorage.
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
  if (!res.ok) throw Object.assign(new Error(json.error || `Falha (${res.status})`), { status: res.status, dados: json })
  return json
}

const q = encodeURIComponent

export const listarContratosApi = async () => (await chamar('/api/contratos')).contratos || []
export const buscarContratoApi = (id) => chamar(`/api/contratos?id=${q(id)}`)
export const criarContratoApi = (contrato, itens = []) => chamar('/api/contratos', { method: 'POST', body: { contrato, itens } })
export const atualizarContratoApi = (id, contrato, evento = null) =>
  chamar('/api/contratos', { method: 'PUT', body: { id, contrato, ...(evento ? { evento } : {}) } })
export const excluirContratoApi = (id) => chamar(`/api/contratos?id=${q(id)}`, { method: 'DELETE' })

export const salvarItensContratoApi = async (contratoId, itens) =>
  (await chamar('/api/contrato-itens', { method: 'PUT', body: { contrato_id: contratoId, itens } })).itens || []

export const listarEventosContratoApi = async (contratoId) =>
  (await chamar(`/api/contrato-eventos?contrato_id=${q(contratoId)}`)).eventos || []
export const registrarEventoContratoApi = async (contratoId, evento) =>
  (await chamar('/api/contrato-eventos', { method: 'POST', body: { contrato_id: contratoId, ...evento } })).evento

export const buscarIndiceApi = (indice) => chamar(`/api/indices?indice=${q(indice)}`)
