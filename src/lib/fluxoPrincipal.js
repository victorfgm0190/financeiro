// "Considerar no Fluxo de Caixa principal?" POR AGENDAMENTO (agendamentos.considerar_fluxo_principal).
// Regra ÚNICA usada por todas as telas que projetam o fluxo principal com agendamentos: Saldo
// Principal (Final Ciclo / Projetado / "Como chegamos aqui" / Início do celular), Projeção do Painel
// e Fluxo de Caixa (visão das contas principais).
//
//   null  → regra de hoje: entra se uma das pontas é conta FC (fluxo_caixa_principal);
//   true  → despesa/receita em conta NÃO FC entra no fluxo (ex.: diarista paga pelo NUGI);
//   false → transferência entre conta FC e conta não FC NÃO entra (ex.: Pix Itaú → NUGI que só
//           abastece a conta onde o pagamento final já está agendado).
// Provisão com função de reserva numa conta não FC marcada Sim: o RESGATE (reserva → conta da
// provisão, as duas fora do pool) leva a MESMA marca da despesa e entra (+), para o líquido no fluxo
// continuar 0 — como quando a provisão sai de uma conta FC. Essa marca em transferência não FC →
// não FC é gravada só pelo sistema (efetivação da provisão); o formulário não pergunta.
// A marca só vale onde a pergunta aparece no formulário (perguntaFluxoPrincipal); em qualquer outro
// caso (conta FC, cartão, FC → FC…) um valor gravado é ignorado e vale a regra de hoje. Só
// agendamentos: o lançamento realizado (e o saldo atual das contas) segue a regra da conta.

import { occEfetiva } from './fluxoCaixa.js'

export const ehContaFC = (a) => !!a && !!a.fluxoCaixaPrincipal && a.type !== 'credit'

// Contas que alcançam o fluxo principal de um escopo (perfil ativo, ou Tudo). poolIds = contas FC
// do escopo (o pool que cada tela já usa); escopoIds = contas não-cartão do escopo (onde uma
// despesa/receita marcada pode entrar); cartaoIds = cartões (nunca entram pela marca).
export function escopoFluxoPrincipal(accounts, poolIds, profileId = null) {
  const doEscopo = (accounts || []).filter(a => !profileId || a.profileId === profileId)
  return {
    poolIds,
    escopoIds: new Set(doEscopo.filter(a => a.type !== 'credit').map(a => a.id)),
    cartaoIds: new Set((accounts || []).filter(a => a.type === 'credit').map(a => a.id)),
  }
}

// O agendamento tem alguma chance de entrar no fluxo principal deste escopo?
export function agendamentoNoFluxoPrincipal(s, { poolIds, escopoIds }) {
  if (poolIds.has(s.accountId) || poolIds.has(s.toAccountId)) return true
  if (s.considerarFluxoPrincipal !== true) return false
  return s.transactionType === 'transfer' ? escopoIds.has(s.toAccountId) : escopoIds.has(s.accountId)
}

// Valor COM SINAL visto pelo fluxo principal (+ entra, − sai, 0 fora) de uma ocorrência de valor
// `valor`. `s.accountId` deve ser a conta EFETIVA da ocorrência (override "só esta parcela").
export function valorNoFluxoPrincipal(s, valor, { poolIds, escopoIds, cartaoIds }) {
  const de = poolIds.has(s.accountId)
  const para = poolIds.has(s.toAccountId)
  const marca = s.considerarFluxoPrincipal ?? null
  if (s.transactionType === 'transfer') {
    const outra = de ? s.toAccountId : s.accountId
    if (de !== para && marca === false && !cartaoIds.has(outra)) return 0
    // Resgate de reserva para a conta não FC de uma provisão marcada Sim (ver topo).
    if (!de && !para && marca === true && escopoIds.has(s.toAccountId)) return valor
    return (para ? valor : 0) - (de ? valor : 0)
  }
  const entra = de || (marca === true && escopoIds.has(s.accountId))
  if (!entra) return 0
  if (s.transactionType === 'income') return valor
  if (s.transactionType === 'expense') return -valor
  return 0
}

// Ocorrências PENDENTES no fluxo principal com data efetiva em (depoisDe, ate] — a Projeção do
// Painel. Devolve { entradas, saidas, n } (saidas positivo).
export function pendentesNoFluxoPrincipal(schedules, fluxo, getNextOccurrences, { depoisDe, ate }) {
  let entradas = 0, saidas = 0, n = 0
  for (const s of schedules || []) {
    if (!agendamentoNoFluxoPrincipal(s, fluxo)) continue
    for (const base of getNextOccurrences(s, 35)) {
      const ef = occEfetiva(s, base)
      if (!(ef.date > depoisDe && ef.date <= ate)) continue
      const v = valorNoFluxoPrincipal(s, Number(ef.amount) || 0, fluxo)
      if (v > 0) { entradas += v; n++ } else if (v < 0) { saidas += -v; n++ }
    }
  }
  return { entradas, saidas, n }
}

export const DICA_TRANSFERENCIA_FLUXO = 'Desmarque se o pagamento final já está agendado na conta de destino e entra no fluxo'

// A pergunta "Considerar no Fluxo de Caixa principal?" do formulário de agendamento: null = não
// aparece; senão { padrao, dica }. Padrão = o que a regra de hoje faz (despesa/receita não FC → Não;
// transferência FC ↔ não FC → Sim). Cartão de crédito nunca pergunta.
export function perguntaFluxoPrincipal({ transactionType, accountId, toAccountId }, accounts) {
  const conta = (id) => (accounts || []).find(a => a.id === id) || null
  const origem = conta(accountId)
  if (!origem || origem.type === 'credit') return null
  if (transactionType === 'transfer') {
    const destino = conta(toAccountId)
    if (!destino || destino.type === 'credit') return null
    if (ehContaFC(origem) === ehContaFC(destino)) return null
    return { padrao: true, dica: DICA_TRANSFERENCIA_FLUXO }
  }
  if (transactionType !== 'expense' && transactionType !== 'income') return null
  if (ehContaFC(origem)) return null
  return { padrao: false, dica: null }
}

// O que gravar: a escolha só vale onde a pergunta aparece (senão null = regra de hoje).
export function considerarFluxoParaGravar(form, accounts) {
  const marca = typeof form.considerarFluxoPrincipal === 'boolean' ? form.considerarFluxoPrincipal : null
  if (perguntaFluxoPrincipal(form, accounts)) return marca
  // Resgate de provisão (não FC → não FC): a marca veio da efetivação; editar não a apaga.
  if (form.transactionType === 'transfer' && marca !== null) {
    const conta = (id) => (accounts || []).find(a => a.id === id) || null
    const de = conta(form.accountId), para = conta(form.toAccountId)
    if (de && para && de.type !== 'credit' && para.type !== 'credit' && !ehContaFC(de) && !ehContaFC(para)) return marca
  }
  return null
}

// Selo da lista de agendamentos: só quando o campo está preenchido.
export function seloFluxoPrincipal(s) {
  if (s?.considerarFluxoPrincipal === true) return 'no fluxo'
  if (s?.considerarFluxoPrincipal === false) return 'fora do fluxo'
  return null
}
