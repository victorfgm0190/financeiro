// Regras do sync que impedem um navegador de sobrescrever o Neon com dados que não vieram dele.
// Funções PURAS (sem React, sem rede), testadas em syncSeguro.test.js.
//
// Origem: em 15/10/2026 um navegador sem cache teve o /api/load falhando, ficou com o defaultData
// em modo "Local" e, quando o ping voltou, o full-sync empurrou tudo: a linha `configuracoes`
// voltou aos valores padrão. E, mesmo sem reconexão, cada sync mandava a TABELA INTEIRA da seção —
// com dois aparelhos abertos, o que estava com a tela velha desfazia as edições do outro.
//
// Daqui saem as três peças:
//   1. "confirmado": a assinatura (JSON do toRow) de cada linha no último estado que o banco
//      confirmou. O sync só envia linhas novas ou diferentes disso, e só as chaves de
//      configuração que mudaram (camposAlterados).
//   2. reaplicarPendencias: na reconexão de quem nunca carregou do banco, os dados do banco passam
//      a valer e só o que mudou no modo Local é reaplicado, item por item.
//   3. acaoNaReconexao: quem nunca carregou recarrega antes de enviar qualquer coisa.

export const assinatura = (valor) => JSON.stringify(valor ?? null)

// Map id → assinatura da linha. `chave` é a coluna que identifica a linha (id na maioria).
export function assinaturasDe(linhas, chave = 'id') {
  const m = new Map()
  for (const l of linhas || []) if (l && l[chave] != null) m.set(l[chave], assinatura(l))
  return m
}

// Linhas novas ou alteradas em relação ao confirmado. Devolve também as assinaturas, que só
// entram no confirmado depois que o servidor responder OK (registrarConfirmadas).
export function linhasNovasOuAlteradas(confirmado, linhas, chave = 'id') {
  const enviar = []
  const assinaturas = []
  for (const l of linhas || []) {
    if (!l) continue
    const sig = assinatura(l)
    if (confirmado.get(l[chave]) === sig) continue
    enviar.push(l)
    assinaturas.push([l[chave], sig])
  }
  return { linhas: enviar, assinaturas }
}

export function registrarConfirmadas(confirmado, assinaturas, apagados = []) {
  for (const [id, sig] of assinaturas) confirmado.set(id, sig)
  for (const id of apagados) confirmado.delete(id)
}

// Ids que existiam no estado de referência e não existem mais (mesma regra de sempre do sync).
export function idsApagados(prevItems, currItems, chave = 'id') {
  const atuais = new Set((currItems || []).map(i => i?.[chave]))
  return (prevItems || []).map(i => i?.[chave]).filter(id => id != null && !atuais.has(id))
}

// Configurações (linha única): assinatura por chave e as chaves que mudaram.
export function assinaturasDaConfiguracao(linha) {
  const o = {}
  for (const [k, v] of Object.entries(linha || {})) o[k] = assinatura(v)
  return o
}

export function camposAlterados(confirmado, linha) {
  return Object.keys(linha || {}).filter(k => confirmado?.[k] !== assinatura(linha[k]))
}

// O que fazer quando o ping volta. Quem já carregou do banco nesta sessão envia só o que ficou
// pendente (comparado ao confirmado). Quem nunca carregou recarrega ANTES de enviar qualquer coisa.
export function acaoNaReconexao({ carregouDoBanco }) {
  return carregouDoBanco ? 'enviar-pendentes' : 'recarregar'
}

// Uma tentativa do retry (a cada 30 s no modo Local). `ping` e `carregar` são o pingDb e o
// loadFromDb (injetados para teste). Devolve:
//   { acao: 'aguardar' }                 — servidor ainda fora; continua Local
//   { acao: 'enviar-pendentes' }         — já carregou nesta sessão; volta a sincronizar o pendente
//   { acao: 'recarregado', result }      — nunca carregou; `result` do load para aplicar ANTES de
//                                          qualquer envio (status 'error' = continua Local)
export async function tentarReconectar({ carregouDoBanco, ping, carregar }) {
  if (!(await ping())) return { acao: 'aguardar' }
  if (acaoNaReconexao({ carregouDoBanco }) === 'enviar-pendentes') return { acao: 'enviar-pendentes' }
  return { acao: 'recarregado', result: await carregar() }
}

// Pergunta da exclusão em massa (409 de api/_syncTrava.js) com o nome que aparece na tela, nunca o
// nome técnico da tabela: "Isso vai apagar 120 de 400 lançamentos. Confirma?"
export const NOMES_NA_TELA = {
  lancamentos: 'lançamentos', agendamentos: 'agendamentos', categorias: 'categorias', orcamento: 'itens do orçamento',
  regras_classificacao: 'regras de classificação', gerencial_rules: 'regras gerenciais', reservas_funcoes: 'grupos gerenciais',
  reservas: 'contas a pagar', envelopes: 'envelopes', grupos_conta: 'grupos de contas', perfis: 'perfis',
  card_imports: 'importações de fatura', reserve_functions: 'funções de reserva', favorecido_alias: 'apelidos de favorecido',
  contas: 'contas', cartoes: 'cartões', favorecidos: 'favorecidos',
}

export function textoConfirmacaoExclusao({ tabela, apagar, total }) {
  return `Isso vai apagar ${apagar} de ${total} ${NOMES_NA_TELA[tabela] || 'registros'}. Confirma?`
}

// Listas com `id` que o sync grava. `payees` (strings) e `settings` (objeto) têm regra própria.
export const LISTAS_SINCRONIZADAS = [
  'accounts', 'transactions', 'schedules', 'categories', 'budgets', 'classificationRules',
  'gerencialGroups', 'gerencialRules', 'payables', 'envelopes', 'accountGroups', 'profiles',
  'cardImports', 'reserveFunctions', 'scheduleReservaFuncoes', 'favorecidoAliases',
]

const igual = (a, b) => a === b || assinatura(a) === assinatura(b)

// Reaplica item a item, sobre os dados do banco, só o que mudou entre `base` (o que o app tinha ao
// entrar no modo Local: o cache) e `local` (o estado atual). O que não foi mexido fica como está no
// banco. Item apagado no Local sai; criado entra; alterado substitui o do banco.
export function reaplicarPendencias(base, local, banco) {
  const out = { ...banco }
  let houve = false

  for (const chave of LISTAS_SINCRONIZADAS) {
    const b = base?.[chave] || []
    const l = local?.[chave] || []
    if (b === l) continue
    const porIdBase = new Map(b.filter(Boolean).map(i => [i.id, i]))
    const porIdLocal = new Map(l.filter(Boolean).map(i => [i.id, i]))
    const apagados = new Set([...porIdBase.keys()].filter(id => !porIdLocal.has(id)))
    const mudados = new Map()
    for (const [id, item] of porIdLocal) {
      if (!porIdBase.has(id) || !igual(porIdBase.get(id), item)) mudados.set(id, item)
    }
    if (apagados.size === 0 && mudados.size === 0) continue
    houve = true
    const lista = (banco?.[chave] || []).filter(i => !apagados.has(i?.id)).map(i => (mudados.has(i?.id) ? mudados.get(i.id) : i))
    const noBanco = new Set(lista.map(i => i?.id))
    for (const [id, item] of mudados) if (!noBanco.has(id)) lista.push(item)
    out[chave] = lista
  }

  // Favorecidos (strings): adicionados e removidos no Local.
  const pb = new Set(base?.payees || [])
  const pl = new Set(local?.payees || [])
  const add = [...pl].filter(p => !pb.has(p))
  const rem = new Set([...pb].filter(p => !pl.has(p)))
  if (add.length || rem.size) {
    houve = true
    const lista = (banco?.payees || []).filter(p => !rem.has(p))
    for (const p of add) if (!lista.includes(p)) lista.push(p)
    out.payees = lista
  }

  // Configurações: só as chaves que mudaram no Local.
  const sb = base?.settings || {}
  const sl = local?.settings || {}
  const chavesMudadas = Object.keys(sl).filter(k => !igual(sb[k], sl[k]))
  if (chavesMudadas.length) {
    houve = true
    out.settings = { ...(banco?.settings || {}) }
    for (const k of chavesMudadas) out.settings[k] = sl[k]
  }
  if (!igual(base?.costCenters, local?.costCenters)) {
    houve = true
    out.costCenters = local?.costCenters
  }

  return { dados: out, houvePendencias: houve }
}
