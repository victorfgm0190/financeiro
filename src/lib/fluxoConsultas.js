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

// Cartões da tela: a virtual "FC Principal" SEMPRE primeiro, depois as salvas do perfil.
export function listaComVirtual(visiveis) {
  return [CONSULTA_VIRTUAL, ...(visiveis || [])]
}

// Padrão efetiva entre as salvas visíveis (no máximo uma); nenhuma → a virtual é a padrão.
export function idPadrao(visiveis) {
  return (visiveis || []).find(c => c.padrao)?.id || ID_CONSULTA_VIRTUAL
}

// Consulta que a tela abre: a última escolhida (se ainda existir), senão a padrão, senão a
// virtual "FC Principal".
export function resolverConsultaAtiva(visiveis, lembradaId) {
  const lista = listaComVirtual(visiveis)
  return lista.find(c => c.id === lembradaId)
    || lista.find(c => c.id === idPadrao(visiveis))
    || CONSULTA_VIRTUAL
}

export const NOME_MAX = 40
const chaveNome = (n) => String(n || '').trim().toLocaleLowerCase('pt-BR')
// Perfis se cruzam? Lista vazia = todos os perfis (cruza com qualquer um).
const perfisCruzam = (a, b) => !a?.length || !b?.length || a.some(p => b.includes(p))

// Já existe consulta com o mesmo nome (sem diferenciar maiúsculas) visível num mesmo perfil?
// A virtual "FC Principal" vale para todos os perfis e também conta.
export function nomeDuplicado(nome, consultas, perfilIds, idProprio) {
  const k = chaveNome(nome)
  if (!k) return false
  if (k === chaveNome(CONSULTA_VIRTUAL.nome)) return true
  return (consultas || []).some(c => c.id !== idProprio && chaveNome(c.nome) === k && perfisCruzam(c.perfil_ids, perfilIds))
}

// Erro do nome (inline) ou null: obrigatório, até 40 caracteres, sem repetir no perfil.
export function erroNome(nome, consultas, perfilIds, idProprio) {
  const n = String(nome || '').trim()
  if (!n) return 'Informe o nome da consulta.'
  if (n.length > NOME_MAX) return `Use no máximo ${NOME_MAX} caracteres.`
  if (nomeDuplicado(n, consultas, perfilIds, idProprio)) return 'Já existe uma consulta com este nome neste perfil.'
  return null
}

// Nome da cópia ao duplicar: "<nome> (cópia)", "(cópia 2)"... sem passar de 40 caracteres.
export function nomeDeCopia(nome, consultas, perfilIds) {
  for (let i = 1; i < 100; i++) {
    const sufixo = i === 1 ? ' (cópia)' : ` (cópia ${i})`
    const n = String(nome || '').trim().slice(0, NOME_MAX - sufixo.length) + sufixo
    if (!nomeDuplicado(n, consultas, perfilIds, null)) return n
  }
  return String(nome || '').slice(0, NOME_MAX)
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
  if (String(c.nome).trim().length > NOME_MAX) return `Use no máximo ${NOME_MAX} caracteres.`
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
//  • nada depois de `fim`. Exceção: o computeFluxoCaixa data o envelope no FIM do ciclo, que
//    pode cair além do horizonte (ciclo que fecha em 14/11 numa janela até 10/11). O restante
//    dele continua sendo saída prevista: entra no ÚLTIMO dia do horizonte
//    (min(fimCiclo, fim)), com o fim real do ciclo na descrição. Só nesta tela — a lib (e o
//    relatório/Painel que a usam) seguem datando no fim do ciclo.
const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0)
export function envelopeNoFimDoHorizonte(r, fim) {
  const nome = String(r.description || '').replace(/^Envelope:\s*/, '')
  return {
    ...r,
    date: fim,
    _cicloAte: r.date,
    description: `Envelope ${nome} (restante ${brl(r.saida)} · ciclo até ${r.date.slice(8, 10)}/${r.date.slice(5, 7)})`,
  }
}
export function linhasFuturas(rows, { hoje, fim, incluirLancamentosFuturos = true }) {
  const out = []
  for (const r of rows || []) {
    if (fim && r.date > fim) {
      if (r._envelope) out.push(envelopeNoFimDoHorizonte(r, fim))
      continue
    }
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

// MÍNIMO projetado: o menor saldo de FIM DE DIA da série (empate → o primeiro dia).
export function minimoProjetado(serie) {
  let min = null
  for (const p of serie || []) if (!min || p.balance < min.valor) min = { valor: p.balance, data: p.date }
  return min
}

// PROJETADO: o saldo no fim do ÚLTIMO dia do horizonte (último ponto da série).
export function projetadoNoFim(serie) {
  return serie?.length ? serie[serie.length - 1].balance : null
}

// Série diária para o gráfico: saldo no FIM de cada dia de [hoje, fim], a partir de `base`.
export function serieDiaria(rowsView, base, hoje, fim) {
  const porDia = new Map()
  for (const r of rowsView) {
    if (!r.ativa || r.date < hoje || r.date > fim) continue
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
