import { authHeaders, clearTokenAndRedirect, exigirConexao } from './api'

// Agenda no celular (/api/agenda-feed) + links de assinatura do feed (/api/agenda, pública).
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
const BASE = '/api/agenda-feed'

export const obterAgendaFeed = () => chamar(BASE)
export const criarAgendaFeed = (opcoes) => chamar(`${BASE}?acao=criar`, { method: 'POST', body: opcoes }).then(r => r.feed)
export const alterarAgendaFeed = (opcoes) => chamar(`${BASE}?acao=opcoes`, { method: 'POST', body: opcoes }).then(r => r.feed)
export const publicarAgendaFeed = (conteudos) => chamar(`${BASE}?acao=publicar`, { method: 'POST', body: { conteudos } })

// Links de UM calendário (tipo) do feed. `origem` = endereço do ambiente (o do navegador).
export function linksDoFeed(origem, token, tipo) {
  const https = `${String(origem).replace(/\/$/, '')}/api/agenda?t=${encodeURIComponent(token)}&tipo=${tipo}`
  const webcal = https.replace(/^https?:/, 'webcal:')
  return { https, webcal, google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}` }
}

// A tela avisa o gerador (useAgendaFeed) que o feed mudou: publica já, com as opções novas.
export const EVENTO_AGENDA_FEED = 'finup:agenda-feed'
export const avisarFeedMudou = (feed) => {
  try { window.dispatchEvent(new CustomEvent(EVENTO_AGENDA_FEED, { detail: feed })) } catch { /* ignore */ }
}
