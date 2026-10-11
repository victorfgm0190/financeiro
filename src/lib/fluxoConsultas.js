// CONSULTAS salvas da tela Fluxo de Caixa Futuro (fluxo_consultas): conjunto de contas
// (por conta / por grupo / contas principais) + opções do cálculo + horizonte padrão.
// Lógica pura — o cálculo do fluxo em si é o computeFluxoCaixa (mesmo do relatório e do Painel).

export const HORIZONTES = [15, 30, 45, 60]

export const MODOS = [
  { id: 'conta', label: 'Por Conta' },
  { id: 'grupo', label: 'Por Grupo' },
  { id: 'principais', label: 'Contas Principais' },
]
export const rotuloModo = (modo) => MODOS.find(m => m.id === modo)?.label || modo

export const ID_CONSULTA_VIRTUAL = '__fc_principal'

// Sem nenhuma consulta salva (no perfil), a tela usa esta: o comportamento de antes.
export const CONSULTA_VIRTUAL = Object.freeze({
  id: ID_CONSULTA_VIRTUAL,
  nome: 'FC Principal',
  modo: 'principais',
  account_ids: [],
  group_ids: [],
  perfil_ids: [],
  incluir_agendamentos: true,
  incluir_lancamentos_futuros: true,
  incluir_envelopes: true,
  ocultar_reserva: false,
  ocultar_patrimonio: false,
  horizonte_padrao: 30,
  padrao: false,
  virtual: true,
})

// Linha do banco → objeto da tela (snake_case, como os outros registros de endpoint direto).
// jsonb pode vir como string em drivers antigos; boolean/int com default quando nulo.
export function normalizarConsulta(r) {
  const lista = (v) => {
    if (Array.isArray(v)) return v.map(String)
    if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p.map(String) : [] } catch { return [] } }
    return []
  }
  const bool = (v, def) => (v == null ? def : !!v)
  const h = Number(r?.horizonte_padrao)
  return {
    id: r.id,
    nome: r.nome || '',
    modo: MODOS.some(m => m.id === r.modo) ? r.modo : 'principais',
    account_ids: lista(r.account_ids),
    group_ids: lista(r.group_ids),
    perfil_ids: lista(r.perfil_ids),
    incluir_agendamentos: bool(r.incluir_agendamentos, true),
    incluir_lancamentos_futuros: bool(r.incluir_lancamentos_futuros, true),
    incluir_envelopes: bool(r.incluir_envelopes, true),
    ocultar_reserva: bool(r.ocultar_reserva, false),
    ocultar_patrimonio: bool(r.ocultar_patrimonio, false),
    horizonte_padrao: HORIZONTES.includes(h) ? h : 30,
    padrao: !!r.padrao,
    ordem: r.ordem == null ? null : Number(r.ordem),
    created_at: r.created_at || null,
    updated_at: r.updated_at || null,
  }
}

// Consultas visíveis no perfil ativo: perfil_ids vazio = todos os perfis (mesmo modelo das
// categorias). Sem perfil ativo ("Tudo") aparecem todas. Ordenadas por `ordem`, depois nome.
export function consultasDoPerfil(consultas, perfilId) {
  return (consultas || [])
    .filter(c => !perfilId || c.perfil_ids.length === 0 || c.perfil_ids.includes(perfilId))
    .sort((a, b) => (a.ordem ?? 1e9) - (b.ordem ?? 1e9) || a.nome.localeCompare(b.nome, 'pt-BR'))
}

// Consulta que a tela abre: a padrão (do perfil), senão a primeira, senão a virtual.
export function consultaInicial(visiveis) {
  return visiveis.find(c => c.padrao) || visiveis[0] || CONSULTA_VIRTUAL
}

// Contas da consulta, na ordem de `accounts`. Cartão nunca entra (o saldo dele não é caixa).
export function contasDaConsulta(consulta, accounts) {
  const caixa = (accounts || []).filter(a => a.type !== 'credit')
  if (!consulta) return []
  if (consulta.modo === 'conta') {
    const ids = new Set(consulta.account_ids)
    return caixa.filter(a => ids.has(a.id))
  }
  if (consulta.modo === 'grupo') {
    const ids = new Set(consulta.group_ids)
    return caixa.filter(a => a.accountGroupId && ids.has(a.accountGroupId))
  }
  return caixa.filter(a => a.fluxoCaixaPrincipal)
}

export function validarConsulta(c) {
  if (!String(c?.nome || '').trim()) return 'Informe o nome da consulta.'
  if (!MODOS.some(m => m.id === c.modo)) return 'Modo inválido.'
  if (c.modo === 'conta' && !(c.account_ids || []).length) return 'Selecione ao menos uma conta.'
  if (c.modo === 'grupo' && !(c.group_ids || []).length) return 'Selecione ao menos um grupo.'
  if (!HORIZONTES.includes(Number(c.horizonte_padrao))) return 'Horizonte inválido.'
  return null
}

// ── Datas (strings 'YYYY-MM-DD', sem fuso) ───────────────────────────────────
const utc = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) }
const iso = (ms) => new Date(ms).toISOString().slice(0, 10)
export const somarDias = (dataIso, n) => iso(utc(dataIso) + n * 86400000)
export const diasEntre = (de, ate) => Math.round((utc(ate) - utc(de)) / 86400000)

// Último dia com lançamento REALIZADO (data <= hoje) que mexe na conta; null se nenhum.
export function ultimoDiaDeSaldo(accountId, transactions, hoje) {
  let ultimo = null
  for (const tx of transactions || []) {
    if (!tx.date || tx.date > hoje) continue
    const toca = tx.accountId === accountId || tx.toAccountId === accountId
      || (tx.type === 'credit_payment' && tx.fromAccountId === accountId)
    if (toca && (!ultimo || tx.date > ultimo)) ultimo = tx.date
  }
  return ultimo
}

// Situação do saldo pela idade do último lançamento:
//   hoje/ontem → 'atualizada'; até 7 dias → 'recente' (verde); mais → 'parada' (âmbar).
export function situacaoSaldo(ultimo, hoje) {
  if (!ultimo) return { tipo: 'sem', dias: null, rotulo: 'sem lançamentos' }
  const dias = diasEntre(ultimo, hoje)
  if (dias <= 1) return { tipo: 'atualizada', dias, rotulo: 'atualizada' }
  if (dias <= 7) return { tipo: 'recente', dias, rotulo: `há ${dias} dias` }
  return { tipo: 'parada', dias, rotulo: `sem movimento há ${dias} dias` }
}

// ── Linhas do fluxo ──────────────────────────────────────────────────────────
// Das linhas de computeFluxoCaixa (período [hoje, fim]) fica só o FUTURO em relação ao saldo:
//  • lançamento com data <= hoje já está em account.balance (o saldo inicial) → sai;
//  • lançamento com data futura NÃO está no balance → vira evento ("lançamento"), que pode ser
//    desmarcado e ter a data simulada como qualquer projeção (real:false; _lancamento marca a
//    origem). Some de vez com incluirLancamentosFuturos = false.
export function linhasFuturas(rows, { hoje, incluirLancamentosFuturos = true }) {
  const out = []
  for (const r of rows || []) {
    if (!r.real) { out.push(r); continue }
    if (r.date <= hoje || !incluirLancamentosFuturos) continue
    out.push({ ...r, real: false, _lancamento: true })
  }
  return out
}

// Tipo do evento para o badge.
export function tipoEvento(r) {
  if (r._provisorio) return 'provisório'
  if (r._envelope) return 'envelope'
  if (r._lancamento) return 'lançamento'
  return 'agendamento'
}

// Conta DA CONSULTA envolvida na linha (a que recebe numa entrada, a que paga numa saída).
export function contaDaLinha(r, accountIds) {
  if (r.type === 'transfer' && r.entrada > 0 && accountIds.has(r.toAccountId)) return r.toAccountId
  return r.fromAccountId
}

// Menor saldo do período: parte do saldo base (hoje) e passa por cada linha ATIVA, na ordem.
// Empate fica com a primeira ocorrência. `key` null = o mínimo é o próprio saldo de hoje.
export function minimoProjetado(rowsView, base, hoje) {
  let min = { valor: base, data: hoje, key: null }
  for (const r of rowsView) {
    if (!r.ativa || r.saldo == null) continue
    if (r.saldo < min.valor) min = { valor: r.saldo, data: r.date, key: r._key }
  }
  return min
}

// Série diária para o gráfico: saldo no FIM de cada dia de [hoje, fim], a partir de `base`.
export function serieDiaria(rowsView, base, hoje, fim) {
  const porDia = new Map()
  for (const r of rowsView) {
    if (!r.ativa) continue
    porDia.set(r.date, (porDia.get(r.date) || 0) + r.entrada - r.saida)
  }
  const out = []
  let bal = base
  const n = Math.max(0, diasEntre(hoje, fim))
  for (let i = 0; i <= n; i++) {
    const d = somarDias(hoje, i)
    bal = Math.round((bal + (porDia.get(d) || 0)) * 100) / 100
    out.push({ date: d, label: `${d.slice(8, 10)}/${d.slice(5, 7)}`, balance: bal })
  }
  return out
}

// Agendamentos em atraso (data < hoje, não registrados): soma das ATIVAS (não desmarcadas).
export function totalEmAtraso(linhas, excluidas) {
  let total = 0
  let ativas = 0
  for (const r of linhas) {
    if (excluidas.has(r._key)) continue
    total += r.entrada - r.saida
    ativas++
  }
  return { total: Math.round(total * 100) / 100, ativas }
}
