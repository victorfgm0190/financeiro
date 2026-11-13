// RESGATE LIGADO a um agendamento de despesa de CONTA (não cartão) com classificação gerencial que
// gera resgate (grupo numerado ≠ 1 com conta padrão — Contas Anuais, PharmaLog, Imperium…).
//
// Modelo: o resgate é um agendamento PRÓPRIO (tipo 'resgate_reserva', transferência conta do grupo
// → conta da despesa) com `agendamentoVinculadoId` = id da despesa. Ele NUNCA é editado à mão: a
// estrutura dele (frequência, início, nº de ocorrências, exceções de data/valor, pulos, âncora) é
// sempre RECALCULADA a partir da despesa por `derivarResgate` — as chaves das ocorrências são as
// mesmas da despesa, então pular, mudar data/valor (só esta ou esta e as próximas), encurtar a série
// ou excluir a despesa valem para o resgate sem código por operação.
//
// O que já foi efetivado nunca é recalculado. A efetivação anda junto (sincronizarResgatesVinculados):
//   • ocorrência da despesa baixada → o resgate da MESMA ocorrência é efetivado (data e valor do
//     lançamento da despesa), com id determinístico `tx_resgv_<resgate>_<ocorrência>`;
//   • baixa da despesa desfeita (estorno, exclusão do lançamento, desvincular) → o lançamento do
//     resgate gerado aqui é removido e a ocorrência dele reabre.
// Ocorrências anteriores ao vínculo (`overrides._resgateDesde`: agendamento antigo que ganhou o
// resgate ao ser editado) ficam de fora — nada de resgate retroativo.
//
// Nada dobra: o motor do cartão só olha despesas EM CARTÃO (gerencialPrevistos.ehGastoPrevistoDeCartao)
// e resgates COM cardId; este não tem cartão. A despesa não movimenta a reserva (saldoReserva.reserveMovOf
// ignora despesas); só a transferência do resgate conta.

import { computeOccurrences } from './occurrences.js'
import { occEfetiva } from './fluxoCaixa.js'
import { aplicarBaixa, metaBaixaGerada, desfazerBaixa } from './scheduleBaixa.js'
import { ORIGIN } from './origins.js'

export const TIPO_RESGATE_VINCULADO = 'resgate_reserva'
export const PREFIXO_TX = 'tx_resgv_'
const ehChaveData = (k) => /^\d{4}-\d{2}-\d{2}$/.test(k)
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

export const idResgateVinculado = (despesaId) => `sch_resgv_${despesaId}`
export const idTxResgate = (resgateId, chave) => `${PREFIXO_TX}${resgateId}_${chave}`
export const ehTxDeResgateVinculado = (id) => typeof id === 'string' && id.startsWith(PREFIXO_TX)
export const ehResgateVinculado = (s) => !!s?.agendamentoVinculadoId

// Grupo gerencial que gera resgate: numerado (≠ 1) com conta padrão. → { grupo, conta } ou null.
export function grupoComResgate(grupoId, { gerencialGroups = [], accounts = [] } = {}) {
  const grupo = (gerencialGroups || []).find(g => g.id === grupoId)
  if (!grupo || typeof grupo.number !== 'number' || grupo.number === 1 || !grupo.defaultAccountId) return null
  const conta = (accounts || []).find(a => a.id === grupo.defaultAccountId) || null
  return conta ? { grupo, conta } : null
}

// Funções de reserva da conta do grupo, na ordem da tela de Reservas.
export function opcoesResgatarDe(contaId, reserveFunctions = []) {
  if (!contaId) return []
  return (reserveFunctions || [])
    .filter(f => f.accountId === contaId)
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || String(a.name || '').localeCompare(String(b.name || '')))
}

const contaEhCartao = (id, accounts) => (accounts || []).find(a => a.id === id)?.type === 'credit'

// A despesa gera resgate ligado? (despesa, em conta que não é cartão, grupo com resgate). → info|null
export function despesaGeraResgate(s, ctx) {
  if (!s || s.transactionType !== 'expense' || !s.accountId || ehResgateVinculado(s) || s.isProvisao) return null
  if (contaEhCartao(s.accountId, ctx.accounts)) return null
  return grupoComResgate(s.grupoGerencial, ctx)
}

// Função escolhida em "Resgatar de" que vale para a conta do grupo (outra conta → nenhuma).
export function funcaoValida(funcaoId, contaId, reserveFunctions = []) {
  if (!funcaoId) return null
  return (reserveFunctions || []).some(f => f.id === funcaoId && f.accountId === contaId) ? funcaoId : null
}

// "Contas Anuais › IPVA" (ou só a conta, sem função).
export function rotuloOrigem(conta, funcaoId, reserveFunctions = []) {
  const nome = conta?.apelido || conta?.name || 'Reserva'
  const f = funcaoId ? (reserveFunctions || []).find(x => x.id === funcaoId) : null
  return f ? `${nome} › ${f.name}` : nome
}

// Ocorrência da despesa fora do resgate por exceção "só esta" (grupo ou conta trocados nela).
function chaveForaDoResgate(despesa, chave, ctx) {
  const ov = despesa.overrides?.[chave]
  if (!ov || typeof ov !== 'object') return false
  if ('grupoGerencial' in ov && ov.grupoGerencial !== despesa.grupoGerencial) return true
  if (ov.accountId && contaEhCartao(ov.accountId, ctx.accounts)) return true
  return false
}

// Estrutura do resgate a partir da despesa (pura). `resgate` = o atual (registered/meta/id/desde).
export function derivarResgate(despesa, resgate, ctx) {
  const info = despesaGeraResgate(despesa, ctx)
  if (!info) return null
  const desde = resgate?.overrides?._resgateDesde || null
  const regResgate = new Set(resgate?.registered || [])
  const overrides = {}
  for (const [k, v] of Object.entries(despesa.overrides || {})) {
    if (ehChaveData(k)) {
      if (!v || typeof v !== 'object') continue
      const o = {}
      if (v.date) o.date = v.date
      if (v.amount != null) o.amount = v.amount
      if (Object.keys(o).length) overrides[k] = o
    } else if (k === '_diaVencimento' || k === '_parcelamento') {
      overrides[k] = v
    }
  }
  if (desde) overrides._resgateDesde = desde
  // Pulos: os da despesa; as baixas da despesa sem resgate (anteriores ao vínculo ou fora dele) — a
  // série do resgate consome as mesmas datas e o nº de ocorrências fecha igual; ocorrências tiradas
  // do resgate por exceção "só esta".
  const skipped = new Set(despesa.skipped || [])
  for (const d of despesa.registered || []) if (!regResgate.has(d)) skipped.add(d)
  for (const k of Object.keys(despesa.overrides || {})) {
    if (ehChaveData(k) && !regResgate.has(k) && chaveForaDoResgate(despesa, k, ctx)) skipped.add(k)
  }
  for (const d of regResgate) skipped.delete(d)
  const funcaoId = funcaoValida(despesa.reservaFuncaoId, info.conta.id, ctx.reserveFunctions)
  return {
    ...(resgate || {}),
    id: resgate?.id || idResgateVinculado(despesa.id),
    tipo: TIPO_RESGATE_VINCULADO,
    agendamentoVinculadoId: despesa.id,
    description: `Resgate ${rotuloOrigem(info.conta, funcaoId, ctx.reserveFunctions)} — ${despesa.description || ''}`.trim(),
    transactionType: 'transfer',
    accountId: info.conta.id,
    accountType: info.conta.type || null,
    toAccountId: despesa.accountId,
    amount: Number(despesa.amount) || 0,
    categoryId: '',
    payee: '',
    costCenter: '',
    frequency: despesa.frequency || 'once',
    startDate: despesa.startDate,
    occurrenceType: despesa.occurrenceType || 'continuous',
    installments: despesa.installments ?? 0,
    parcelasPorOcorrencia: Number(despesa.parcelasPorOcorrencia) || 1,
    nextOccurrence: despesa.nextOccurrence || null,
    overrides,
    skipped: [...skipped].sort(),
    registered: resgate?.registered || [],
    registeredMeta: resgate?.registeredMeta || {},
    reservaFuncaoId: funcaoId,
    grupoGerencial: null,
    reservaExpenseCategoryId: null,
    isProvisao: false,
    provisaoEfetivada: false,
    autoRegister: false,
    remindDaysBefore: 0,
    sincronizarAgenda: false,
    considerarFluxoPrincipal: typeof despesa.considerarFluxoPrincipal === 'boolean' ? despesa.considerarFluxoPrincipal : null,
    cardId: null,
    faturaRef: null,
    faturaMesAno: null,
    confirmado: false,
  }
}

// Resgate novo para a despesa: cobre só as ocorrências PENDENTES a partir de agora.
export function novoResgateVinculado(despesa, ctx) {
  const primeira = computeOccurrences(despesa, 1)[0]
  if (!primeira) return null
  const base = { id: idResgateVinculado(despesa.id), registered: [], registeredMeta: {}, overrides: { _resgateDesde: primeira } }
  return derivarResgate(despesa, base, ctx)
}

// Campos que importam para saber se o resgate mudou (sem createdAt/updatedAt).
const CAMPOS = ['description', 'accountId', 'accountType', 'toAccountId', 'amount', 'frequency', 'startDate', 'occurrenceType',
  'installments', 'parcelasPorOcorrencia', 'nextOccurrence', 'overrides', 'skipped', 'registered', 'registeredMeta',
  'reservaFuncaoId', 'considerarFluxoPrincipal', 'tipo', 'agendamentoVinculadoId', 'autoRegister', 'sincronizarAgenda', 'transactionType', 'remindDaysBefore']
const assinatura = (s) => JSON.stringify(CAMPOS.map(c => s?.[c] ?? null))
export const mesmoResgate = (a, b) => assinatura(a) === assinatura(b)

// Lançamento da despesa que baixou a ocorrência `chave` (meta ou scheduleId + dataOcorrencia).
function lancamentoDaBaixa(despesa, chave, transactions) {
  const id = despesa.registeredMeta?.[chave]?.lancamento_id
  if (id) {
    const t = transactions.find(x => x.id === id)
    if (t) return t
  }
  return transactions.find(t => t.scheduleId === despesa.id && t.dataOcorrencia === chave) || null
}

// Garante, no estado `d`, que todo resgate ligado acompanha a sua despesa (pura e idempotente:
// sem nada a fazer, devolve o MESMO `d`). deps: { sombras(tx, accounts) → lançamentos de sombra,
// efeitoTransferencia(accounts, tx, dir) → accounts, agora() → ISO }.
export function sincronizarResgatesVinculados(d, deps = {}) {
  const resgates = (d.schedules || []).filter(ehResgateVinculado)
  if (!resgates.length) return d
  const ctx = { accounts: d.accounts, gerencialGroups: d.gerencialGroups, reserveFunctions: d.reserveFunctions }
  const sombras = deps.sombras || (() => [])
  const efeito = deps.efeitoTransferencia || ((accounts) => accounts)
  const agora = deps.agora || (() => new Date().toISOString())
  let schedules = d.schedules
  let transactions = d.transactions || []
  let accounts = d.accounts
  let mudou = false
  const porId = new Map(schedules.map(s => [s.id, s]))

  for (const r0 of resgates) {
    const despesa = porId.get(r0.agendamentoVinculadoId)
    if (!despesa || !despesaGeraResgate(despesa, ctx)) {
      // Despesa excluída ou que deixou de gerar resgate: o agendamento do resgate sai (o que já foi
      // efetivado continua como lançamento, igual a excluir qualquer agendamento).
      schedules = schedules.filter(s => s.id !== r0.id)
      mudou = true
      continue
    }
    let r = r0
    const regDespesa = new Set(despesa.registered || [])
    // 1. Baixa da despesa desfeita → desfaz o resgate gerado aqui (só se o lançamento está no estado).
    for (const chave of [...(r.registered || [])]) {
      if (regDespesa.has(chave)) continue
      const txId = r.registeredMeta?.[chave]?.lancamento_id
      if (!ehTxDeResgateVinculado(txId)) continue
      const tx = transactions.find(t => t.id === txId)
      if (!tx) continue
      const filhos = transactions.filter(t => t.parentTxId === txId)
      accounts = efeito(accounts, tx, -1)
      const fora = new Set([txId, ...filhos.map(f => f.id)])
      transactions = transactions.filter(t => !fora.has(t.id))
      r = desfazerBaixa(r, chave)
      mudou = true
    }
    // 2. Despesa baixada → efetiva o resgate da mesma ocorrência (a partir do vínculo).
    const desde = r.overrides?._resgateDesde || ''
    const regResgate = new Set(r.registered || [])
    for (const chave of despesa.registered || []) {
      if (regResgate.has(chave) || chave < desde || chaveForaDoResgate(despesa, chave, ctx)) continue
      const base = lancamentoDaBaixa(despesa, chave, transactions)
      const ef = occEfetiva(despesa, chave)
      const txId = idTxResgate(r.id, chave)
      if (transactions.some(t => t.id === txId)) { r = aplicarBaixa(r, chave, metaBaixaGerada(txId)); mudou = true; continue }
      const funcaoId = funcaoValida(despesa.reservaFuncaoId, r.accountId, ctx.reserveFunctions)
      const tx = {
        id: txId, type: 'transfer',
        accountId: r.accountId, accountType: r.accountType || null,
        toAccountId: base?.accountId || despesa.accountId,
        amount: r2(base ? base.amount : ef.amount),
        categoryId: '', description: r.description, payee: '', costCenter: '',
        date: base?.date || ef.date,
        scheduleId: r.id, dataOcorrencia: chave, sourceScheduleId: r.id,
        reservaFuncaoId: funcaoId, tipoDocumentoId: null,
        origin: ORIGIN.AGENDAMENTO, createdAt: agora(),
      }
      accounts = efeito(accounts, tx, 1)
      const extras = sombras(tx, accounts).map((t, i) => ({ ...t, id: `${txId}_s${i}`, parentTxId: txId }))
      transactions = [...transactions, tx, ...extras]
      r = aplicarBaixa(r, chave, metaBaixaGerada(txId))
      mudou = true
    }
    // 3. Estrutura recalculada a partir da despesa.
    const novo = derivarResgate(despesa, r, ctx)
    if (!mesmoResgate(novo, r0)) {
      schedules = schedules.map(s => (s.id === r0.id ? novo : s))
      mudou = true
    }
  }
  return mudou ? { ...d, schedules, transactions, accounts } : d
}

// Cria o resgate da despesa se faltar (salvar o agendamento). Devolve `d` igual se não há o que criar.
export function criarResgateSeFaltar(d, despesaId) {
  const despesa = (d.schedules || []).find(s => s.id === despesaId)
  const ctx = { accounts: d.accounts, gerencialGroups: d.gerencialGroups, reserveFunctions: d.reserveFunctions }
  if (!despesa || !despesaGeraResgate(despesa, ctx)) return d
  if ((d.schedules || []).some(s => s.agendamentoVinculadoId === despesaId)) return d
  const novo = novoResgateVinculado(despesa, ctx)
  if (!novo) return d
  return { ...d, schedules: [...d.schedules, novo] }
}

// Quantas ocorrências pendentes o resgate terá (para a frase do formulário). null = sem fim.
export function resumoResgates(despesa, { limite = 400 } = {}) {
  const continua = (despesa.frequency || 'once') !== 'once' && despesa.occurrenceType !== 'installment'
  const pend = computeOccurrences(despesa, continua ? 1 : limite)
  return { continua, n: continua ? null : pend.length }
}

// Provisões ABERTAS da mesma função com ocorrência pendente num mês em que a despesa também tem.
export function provisoesNoMesmoMes(despesa, funcaoId, schedules = [], { limite = 36 } = {}) {
  if (!funcaoId) return []
  const meses = new Set(computeOccurrences(despesa, limite).map(k => String(occEfetiva(despesa, k).date).slice(0, 7)))
  if (!meses.size) return []
  const out = []
  for (const p of schedules || []) {
    if (!p.isProvisao || p.provisaoEfetivada || p.reservaFuncaoId !== funcaoId || p.id === despesa.id) continue
    const mes = computeOccurrences(p, limite).map(k => String(occEfetiva(p, k).date).slice(0, 7)).find(m => meses.has(m))
    if (mes) out.push({ provisao: p, mes })
  }
  return out
}
