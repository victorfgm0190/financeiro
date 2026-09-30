// Planejamento da varredura: compara as divergências de agora com as pendências já gravadas e
// decide o que inserir, manter, reabrir e resolver. Puro — a API só executa o plano.
//
//   divergência nova              → INSERT, status pendente
//   continua existindo (pendente) → mantém; atualiza verificada_em/encontrado/esperado
//   voltou (estava resolvida)     → reabre como pendente (conta como nova)
//   ignorada                      → continua ignorada; só atualiza verificada_em/encontrado
//   pendente que sumiu            → resolvida, resolvida_por = 'varredura'
//
// Só é resolvida a pendência que a varredura de fato reavaliou: regra executada E fatura dentro do
// escopo (`desde`). Uma varredura restrita não "resolve" o que nem olhou.

import { refParaYM } from './regras.js'

const chave = (p) => `${p.regra}|${p.origem_id}`

export function dentroDoEscopo(pendencia, escopo = {}) {
  if (escopo.regras && !escopo.regras.includes(pendencia.regra)) return false
  if (escopo.cartoes && pendencia.conta_id && !escopo.cartoes.includes(pendencia.conta_id)) return false
  const ym = refParaYM(pendencia.fatura_ref)
  if (!ym) return true
  if (escopo.desde && ym < escopo.desde) return false
  if (escopo.faturas && !escopo.faturas.includes(ym)) return false
  return true
}

export function planejarVarredura(existentes, divergencias, escopo = {}) {
  const porChave = new Map((existentes || []).map(p => [chave(p), p]))
  const atuais = new Set()
  const gravar = []
  const resumo = { novas: 0, mantidas: 0, reabertas: 0, ignoradas: 0, resolvidas: 0 }
  for (const d of divergencias) {
    const k = chave(d)
    atuais.add(k)
    const ex = porChave.get(k)
    if (!ex) { resumo.novas++; gravar.push({ ...d, acao: 'nova' }) }
    else if (ex.status === 'resolvida') { resumo.reabertas++; gravar.push({ ...d, acao: 'reabrir' }) }
    else if (ex.status === 'ignorada') { resumo.ignoradas++; gravar.push({ ...d, acao: 'manter' }) }
    else { resumo.mantidas++; gravar.push({ ...d, acao: 'manter' }) }
  }
  const resolver = []
  for (const p of existentes || []) {
    if (p.status !== 'pendente' || atuais.has(chave(p)) || !dentroDoEscopo(p, escopo)) continue
    resolver.push(p.id)
  }
  resumo.resolvidas = resolver.length
  return { gravar, resolver, resumo }
}

// Aplica o plano sobre uma lista em memória — mesma semântica do SQL de api/integridade.js.
// Usado nos testes de idempotência (e serve de especificação executável do upsert).
export function aplicarPlano(existentes, plano, agora) {
  const porChave = new Map((existentes || []).map(p => [chave(p), { ...p }]))
  for (const d of plano.gravar) {
    const k = chave(d)
    const ex = porChave.get(k)
    const campos = {
      regra: d.regra, severidade: d.severidade, origem_id: d.origem_id, conta_id: d.conta_id,
      fatura_ref: d.fatura_ref, descricao: d.descricao, esperado: d.esperado, encontrado: d.encontrado,
      verificada_em: agora,
    }
    if (!ex) {
      porChave.set(k, { id: k, ...campos, status: 'pendente', detectada_em: agora, resolvida_em: null, resolvida_por: null })
    } else if (ex.status === 'resolvida') {
      porChave.set(k, { ...ex, ...campos, status: 'pendente', detectada_em: agora, resolvida_em: null, resolvida_por: null })
    } else {
      porChave.set(k, { ...ex, ...campos })
    }
  }
  const resolver = new Set(plano.resolver)
  for (const p of porChave.values()) {
    if (resolver.has(p.id)) Object.assign(p, { status: 'resolvida', resolvida_em: agora, resolvida_por: 'varredura' })
  }
  return [...porChave.values()]
}
