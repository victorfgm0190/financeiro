// Sugestões do Assistente na Importar Fatura (api/ia-importacao.js). Nunca trava a tela: prazo de
// 12 s no navegador (o servidor corta a IA em 10 s); qualquer falha vira { indisponivel: true }.
import { authHeaders, estaSemConexao } from './api'

const PRAZO_NAVEGADOR_MS = 12_000

// → { liberado, ligado }. Falha = nada liberado (a opção não aparece, nada é pedido).
export async function statusSugestoesImportacao() {
  if (estaSemConexao()) return { liberado: false, ligado: false }
  try {
    const res = await fetch('/api/ia-importacao', { headers: authHeaders() })
    if (!res.ok) return { liberado: false, ligado: false }
    const j = await res.json()
    return { liberado: j.liberado === true, ligado: j.ligado === true }
  } catch {
    return { liberado: false, ligado: false }
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
