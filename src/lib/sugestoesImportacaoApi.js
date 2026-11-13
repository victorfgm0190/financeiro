// Sugestões do Assistente na Importar Fatura (api/ia-importacao.js). Nunca trava a tela: prazo de
// 12 s no navegador (o servidor corta a IA em 10 s); qualquer falha vira { indisponivel: true }.
import { authHeaders, estaSemConexao, getToken } from './api'

const PRAZO_NAVEGADOR_MS = 12_000

// → { liberado, ligado } ou, quando não deu para saber (sessão ainda não pronta, sem conexão, erro
// de rede ou do servidor), { liberado: false, ligado: false, falhou: true } — quem chama tenta de novo
// (hooks/useStatusSugestoesIa). "Falhou" nunca é tratado como "não liberado" definitivo.
export async function statusSugestoesImportacao() {
  const falha = { liberado: false, ligado: false, falhou: true }
  if (!getToken() || estaSemConexao()) return falha
  try {
    const res = await fetch('/api/ia-importacao', { headers: authHeaders(), cache: 'no-store' })
    if (!res.ok) return falha
    const j = await res.json()
    return { liberado: j.liberado === true, ligado: j.ligado === true }
  } catch {
    return falha
  }
}

// itens: lib/sugestaoAssistente.itensParaIa. → { sugestoes } | { indisponivel: true, motivo }
export async function pedirSugestoesImportacao({ itens, perfilId = null, fatura = null }, { prazoMs = PRAZO_NAVEGADOR_MS } = {}) {
  if (estaSemConexao()) return { indisponivel: true, motivo: 'sem_conexao' }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), prazoMs)
  try {
    const res = await fetch('/api/ia-importacao', {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ itens, perfilId, fatura }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok || j.indisponivel) return { indisponivel: true, motivo: j.motivo || `http_${res.status}` }
    return { sugestoes: Array.isArray(j.sugestoes) ? j.sugestoes : [] }
  } catch {
    return { indisponivel: true, motivo: 'prazo' }
  } finally {
    clearTimeout(timer)
  }
}
