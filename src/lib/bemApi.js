import { authHeaders, clearTokenAndRedirect } from './api'

// Cliente dos endpoints de Bem Imobilizado / Financiamento (api/bem/*, api/financiamento/*).
// Todos exigem Bearer token — daí passar sempre por aqui em vez de fetch() solto.

// Sem isso o fetch fica pendurado indefinidamente quando a função serverless não responde:
// a promise nunca settla, o `finally` de quem chamou nunca roda e a tela trava no spinner
// sem nem exibir erro. Com o timeout vira uma falha visível, que a UI já sabe tratar.
const TIMEOUT_MS = 10000

async function request(url, options = {}) {
  let res
  try {
    res = await fetch(url, {
      ...options,
      signal: options.signal ?? AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
        ...(options.headers || {}),
      },
    })
  } catch (err) {
    // DOMException 'signal timed out' não diz nada ao usuário — a mensagem chega crua na tela.
    if (err?.name === 'TimeoutError') {
      throw new Error(`Tempo esgotado (${TIMEOUT_MS / 1000}s) ao chamar ${url}`, { cause: err })
    }
    throw err
  }

  // Token expirado/inválido: volta pro login em vez de deixar a tela num estado sem sessão.
  if (res.status === 401) {
    clearTokenAndRedirect()
    throw new Error('Sessão expirada')
  }

  let data = null
  try { data = await res.json() } catch { /* resposta sem corpo JSON */ }

  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `Erro ${res.status} ao chamar ${url}`)
  }
  return data
}

const post = (url, body) => request(url, { method: 'POST', body: JSON.stringify(body) })
const enc = encodeURIComponent

export const criarBem = (payload) => post('/api/bem/criar', payload)

export const getBem = (bemId) => request(`/api/bem/${enc(bemId)}`)

export const registrarEntrada = (bemId, payload) =>
  post(`/api/bem/${enc(bemId)}/registrar-entrada`, payload)

export const estornarEntrada = (bemId, payload = {}) =>
  post(`/api/bem/${enc(bemId)}/estornar-entrada`, payload)

export const atualizarValoresBem = (bemId, payload) =>
  post(`/api/bem/${enc(bemId)}/atualizar-valores`, payload)

export const getMovimentacoes = (bemId) => request(`/api/bem/${enc(bemId)}/movimentacoes`)

export const criarFinanciamento = (payload) => post('/api/financiamento/criar', payload)

export const getFinanciamento = (financiamentoId) =>
  request(`/api/financiamento/${enc(financiamentoId)}`)

export const getParcelas = (financiamentoId, { page = 1, limit = 20 } = {}) =>
  request(`/api/financiamento/${enc(financiamentoId)}/parcelas?page=${page}&limit=${limit}`)

export const pagarParcela = (parcelaId, payload) =>
  post(`/api/financiamento/parcela/${enc(parcelaId)}/pagar`, payload)
