import { authHeaders, clearTokenAndRedirect, exigirConexao } from './api'
import { CHAVE_MAPEAMENTOS_ANTIGOS, modeloDoMapeamentoAntigo } from './importers/index.js'

// Modelos de importação do usuário (/api/import-layouts): planilha de banco não reconhecida →
// mapeamento salvo, reconhecido de novo pela assinatura do cabeçalho.
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

export const listarModelosImportacao = async () => (await chamar('/api/import-layouts')).layouts || []
export const salvarModeloImportacao = async (modelo) => (await chamar('/api/import-layouts', { method: 'POST', body: modelo })).layout
export const apagarModeloImportacao = (id) => chamar(`/api/import-layouts?id=${encodeURIComponent(id)}`, { method: 'DELETE' })

// Mapeamentos antigos do localStorage → import_layouts. Idempotente: o upsert é por (usuário, tipo,
// assinatura); só limpa o localStorage depois de ver TODOS na tabela. Qualquer falha mantém o
// localStorage (fallback) e tenta de novo na próxima vez. Devolve a lista atualizada de modelos.
export async function migrarMapeamentosAntigos({ ls = globalThis.localStorage, api = { listar: listarModelosImportacao, salvar: salvarModeloImportacao } } = {}) {
  let antigos
  try { antigos = JSON.parse(ls?.getItem(CHAVE_MAPEAMENTOS_ANTIGOS) || 'null') } catch { antigos = null }
  if (!antigos || typeof antigos !== 'object' || !Object.keys(antigos).length) return null
  const modelos = Object.entries(antigos).map(([chave, m]) => modeloDoMapeamentoAntigo(chave, m))
    .filter(m => m.mapeamento.colData != null && m.mapeamento.colDescricao != null && m.mapeamento.colValor != null)
  try {
    for (const m of modelos) await api.salvar(m)
    const naTabela = await api.listar()
    const todos = modelos.every(m => naTabela.some(t => t.tipo === m.tipo && t.assinatura === m.assinatura))
    if (todos) { try { ls.removeItem(CHAVE_MAPEAMENTOS_ANTIGOS) } catch { /* indisponível */ } }
    return naTabela
  } catch (err) {
    console.warn('[importação] mapeamentos antigos ficam no navegador por enquanto:', err.message)
    return null
  }
}
