import { authHeaders, clearTokenAndRedirect } from './api'

// Importação padrão de lançamentos: lotes e de-para (/api/importacoes-lancamentos). Os lançamentos
// vão pelo sync de sempre (addTransaction no app).
async function chamar(url, { method = 'GET', body } = {}) {
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
const BASE = '/api/importacoes-lancamentos'
const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v != null && v !== '')).toString()

export const listarImportacoes = () => chamar(BASE).then(r => r.lotes || [])
export const situacaoLote = (id) => chamar(`${BASE}?${qs({ acao: 'lote', id })}`)
export const contasDoOfx = (banco, conta) => chamar(`${BASE}?${qs({ acao: 'ofx-conta', banco, conta })}`).then(r => r.contas || [])
export const registrarLote = (lote) => chamar(BASE, { method: 'POST', body: lote })
export const concluirLote = (id) => chamar(`${BASE}?acao=concluir`, { method: 'POST', body: { id } })
export const marcarLoteDesfeito = (id) => chamar(`${BASE}?acao=desfazer`, { method: 'POST', body: { id } })

export const listarDepara = () => chamar(`${BASE}?acao=depara`).then(r => r.depara || [])
export const salvarDepara = (nome_origem, categoria_id) => chamar(`${BASE}?acao=depara`, { method: 'POST', body: { nome_origem, categoria_id } })
export const editarDepara = (id, categoria_id) => chamar(`${BASE}?acao=depara`, { method: 'PATCH', body: { id, categoria_id } })
export const excluirDepara = (id) => chamar(`${BASE}?acao=depara`, { method: 'DELETE', body: { id } })

// Espera o banco ter `alvo` lançamentos do lote (o sync do app é assíncrono). true = chegou.
export async function aguardarGravados(id, alvo, { limiteMs = 120_000, intervaloMs = 1500, aoVer } = {}) {
  const fim = Date.now() + limiteMs
  for (;;) {
    const { gravados } = await situacaoLote(id)
    aoVer?.(gravados)
    if (gravados === alvo) return true
    if (Date.now() > fim) return false
    await new Promise(r => setTimeout(r, intervaloMs))
  }
}
