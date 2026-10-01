// Planejamento da varredura: compara as divergências de agora com as pendências já gravadas e
// decide o que inserir, manter, reabrir e resolver. Puro — a API só executa o plano.
//
//   divergência nova              → INSERT, status pendente
//   continua existindo (pendente) → mantém; atualiza verificada_em/encontrado/esperado
//   voltou (estava resolvida)     → reabre como pendente (conta como nova)
//   ignorada                      → continua ignorada; só atualiza verificada_em/encontrado
//   pendente que sumiu            → resolvida, resolvida_por = 'varredura'
//
// Faturas FECHADAS (opcoes.faturasFechadas, mesmo critério do botão "Fechar Fatura"):
//   pendente de fatura fechada    → ignorada, resolvida_por = 'fatura_fechada' (histórico mantido)
//   ignorada por 'fatura_fechada' cuja fatura foi reaberta → volta a ser avaliada: reabre se a
//                                   divergência existe, resolve (varredura) se não existe mais
// Regras sem janela (GER_SALDO_SUBCONTA) não pertencem a uma fatura — a fatura_ref é só onde a
// pendência aparece: nunca são arquivadas por fechamento; se a regra não as gera mais, resolvem.
//
// Só é resolvida a pendência que a varredura de fato reavaliou: regra executada E fatura dentro do
// escopo (`desde`). Uma varredura restrita não "resolve" o que nem olhou.

import { refParaYM, REGRAS_SEM_JANELA } from './regras.js'
import { faturaEstaFechada } from '../faturasFechadas.js'

export const POR_FATURA_FECHADA = 'fatura_fechada'

const chave = (p) => `${p.regra}|${p.origem_id}`
const arquivadaPorFechamento = (p) => p.status === 'ignorada' && p.resolvida_por === POR_FATURA_FECHADA

export function dentroDoEscopo(pendencia, escopo = {}) {
  if (escopo.regras && !escopo.regras.includes(pendencia.regra)) return false
  if (escopo.cartoes && pendencia.conta_id && !escopo.cartoes.includes(pendencia.conta_id)) return false
  if (REGRAS_SEM_JANELA.has(pendencia.regra)) return true
  const ym = refParaYM(pendencia.fatura_ref)
  if (!ym) return true
  if (escopo.desde && ym < escopo.desde) return false
  if (escopo.faturas && !escopo.faturas.includes(ym)) return false
  return true
}

// Pendência gravada que pertence a uma fatura fechada (cartão = conta_id, fatura = fatura_ref).
export const deFaturaFechada = (p, faturasFechadas) =>
  faturaEstaFechada(faturasFechadas, p.conta_id, refParaYM(p.fatura_ref))

export function planejarVarredura(existentes, divergencias, escopo = {}, opcoes = {}) {
  const faturasFechadas = opcoes.faturasFechadas || {}
  const porChave = new Map((existentes || []).map(p => [chave(p), p]))
  const atuais = new Set()
  const gravar = []
  const resumo = { novas: 0, mantidas: 0, reabertas: 0, ignoradas: 0, resolvidas: 0, arquivadas: 0 }
  for (const d of divergencias) {
    const k = chave(d)
    atuais.add(k)
    const ex = porChave.get(k)
    // As regras não geram divergência de fatura fechada: se ela existe, a fatura está aberta —
    // a ignorada por fechamento volta a valer.
    if (!ex) { resumo.novas++; gravar.push({ ...d, acao: 'nova' }) }
    else if (ex.status === 'resolvida' || arquivadaPorFechamento(ex)) { resumo.reabertas++; gravar.push({ ...d, acao: 'reabrir' }) }
    else if (ex.status === 'ignorada') { resumo.ignoradas++; gravar.push({ ...d, acao: 'manter' }) }
    else { resumo.mantidas++; gravar.push({ ...d, acao: 'manter' }) }
  }
  const resolver = []
  const arquivar = []
  for (const p of existentes || []) {
    if (atuais.has(chave(p))) continue
    const fechada = !REGRAS_SEM_JANELA.has(p.regra) && deFaturaFechada(p, faturasFechadas)
    if (p.status === 'pendente' && fechada) { arquivar.push(p.id); continue }
    if (p.status !== 'pendente' && !(arquivadaPorFechamento(p) && !fechada)) continue
    if (!dentroDoEscopo(p, escopo)) continue
    resolver.push(p.id)
  }
  resumo.resolvidas = resolver.length
  resumo.arquivadas = arquivar.length
  return { gravar, resolver, arquivar, resumo }
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
    } else if (ex.status === 'resolvida' || arquivadaPorFechamento(ex)) {
      porChave.set(k, { ...ex, ...campos, status: 'pendente', detectada_em: agora, resolvida_em: null, resolvida_por: null })
    } else {
      porChave.set(k, { ...ex, ...campos })
    }
  }
  const resolver = new Set(plano.resolver)
  const arquivar = new Set(plano.arquivar || [])
  for (const p of porChave.values()) {
    if (resolver.has(p.id) && (p.status === 'pendente' || arquivadaPorFechamento(p))) {
      Object.assign(p, { status: 'resolvida', resolvida_em: agora, resolvida_por: 'varredura' })
    }
    if (arquivar.has(p.id) && p.status === 'pendente') {
      Object.assign(p, { status: 'ignorada', resolvida_em: agora, resolvida_por: POR_FATURA_FECHADA })
    }
  }
  return [...porChave.values()]
}
