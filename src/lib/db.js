import { installmentKey } from './installments.js'
import { authHeaders, clearTokenAndRedirect } from './api.js'

// ─── Helpers fetch ────────────────────────────────────────────────────────────

// 401 → sessão inválida/expirada: limpa o token e volta ao login (uma vez).
function onUnauthorized() {
  clearTokenAndRedirect()
}

async function apiGet(path) {
  const res = await fetch(path, { headers: { ...authHeaders() } })
  if (res.status === 401) { onUnauthorized() }
  if (!res.ok) {
    const err = new Error(`GET ${path} → ${res.status}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

async function apiPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
  if (res.status === 401) { onUnauthorized() }
  if (!res.ok) {
    const err = new Error(`POST ${path} → ${res.status}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

// Busca Global: consulta combinada de lançamentos + agendamentos via /api/search.
// Retorna { transactions: [rows], schedules: [rows] } (rows em snake_case do banco).
export async function searchEntries(filters) {
  return apiPost('/api/search', filters || {})
}

// Histórico do fornecedor: últimas `limit` ocorrências cuja descrição corresponde a
// `description` (busca por similaridade). Retorna { transactions: [...] } já com os nomes
// de categoria/grupo/função de reserva resolvidos por JOIN no backend.
export async function fetchTransactionHistory(description, limit = 5) {
  return apiPost('/api/transaction-history', { description, limit })
}

// Lançamentos vinculados a uma função de reserva no período (origem do valor AUTO de
// Entradas/Saídas no Resumo). Retorna { transactions: [...] } com nomes das contas.
export async function fetchReserveFunctionTransactions(functionId, startDate, endDate) {
  return apiPost('/api/reserve-function-transactions', { functionId, startDate, endDate })
}

// Edição em lote de lançamentos (date e/ou categoryId) numa única operação no banco.
export async function bulkUpdateTransactionsApi(ids, { date = null, categoryId } = {}) {
  return apiPost('/api/transactions-bulk-update', { ids, date, categoryId })
}

// ─── Reservas: histórico de períodos e ajustes (escrita direta, sem diff-sync) ──
// Diferente das demais seções (sincronizadas por diff debounced), estes registros são
// gravados diretamente no banco por operação e o state local é atualizado após sucesso.

async function apiPut(path, body) {
  const res = await fetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
  if (res.status === 401) { onUnauthorized() }
  if (!res.ok) {
    const err = new Error(`PUT ${path} → ${res.status}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

async function apiDelete(path) {
  const res = await fetch(path, { method: 'DELETE', headers: { ...authHeaders() } })
  if (res.status === 401) { onUnauthorized() }
  if (!res.ok) {
    const err = new Error(`DELETE ${path} → ${res.status}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

// Períodos de saldo inicial. Objetos em snake_case (mesma forma do banco/endpoint):
// { id, function_id, data_inicio, saldo_inicial }.
export async function fetchReservePeriods() {
  return apiGet('/api/reserve-periods')
}
export async function createReservePeriod(period) {
  return apiPost('/api/reserve-periods', period)
}
export async function deleteReservePeriodApi(id) {
  return apiDelete(`/api/reserve-periods?id=${encodeURIComponent(id)}`)
}

// Snapshots das viradas (histórico de períodos). Leitura de todos; escrita em lote.
export async function fetchReserveSnapshots() {
  return apiGet('/api/reserve-snapshots')
}
export async function createReserveSnapshots(snapshots) {
  return apiPost('/api/reserve-snapshots', { snapshots })
}

// Ajustes por função: { id, function_id, data, valor, observacao }.
export async function fetchReserveAdjustments() {
  return apiGet('/api/reserve-adjustments')
}
export async function createReserveAdjustment(adj) {
  return apiPost('/api/reserve-adjustments', adj)
}
export async function updateReserveAdjustmentApi(adj) {
  return apiPut('/api/reserve-adjustments', adj)
}
export async function deleteReserveAdjustmentApi(id) {
  return apiDelete(`/api/reserve-adjustments?id=${encodeURIComponent(id)}`)
}

// Normaliza um valor de coluna DATE (date_cartao) para string 'YYYY-MM-DD'. O driver
// pg pode devolver tanto a string quanto um objeto Date — o resto do app trabalha com
// strings (date é TEXT), então convertemos aqui para manter a consistência.
function toDateStr(v) {
  if (!v) return null
  if (typeof v === 'string') return v.slice(0, 10)
  if (v instanceof Date) {
    const y = v.getFullYear()
    const m = String(v.getMonth() + 1).padStart(2, '0')
    const d = String(v.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return String(v).slice(0, 10)
}

// ─── Transformadores camelCase ↔ snake_case ───────────────────────────────────

export const perfilToRow = (p) => ({
  id: p.id,
  name: p.name,
  type: p.type || 'pf',
  document: p.document || null,
  color: p.color || '#6366f1',
  is_default: !!p.isDefault,
})

export const rowToPerfil = (r) => ({
  id: r.id,
  name: r.name,
  type: r.type || 'pf',
  document: r.document || '',
  color: r.color || '#6366f1',
  isDefault: !!r.is_default,
})

export const accountGroupToRow = (g) => ({
  id: g.id,
  name: g.name,
  type: g.type || 'financeiro',
  order: g.order ?? 0,
  behavior: g.behavior || null,
  inibido: !!g.inibido,
  anchor_account_id: g.anchorAccountId || null,
})

export const rowToAccountGroup = (r) => ({
  id: r.id,
  name: r.name,
  type: r.type || 'financeiro',
  order: r.order ?? 0,
  behavior: r.behavior || null,
  inibido: !!r.inibido,
  anchorAccountId: r.anchor_account_id || null,
})

export const accountToRow = (a) => ({
  id: a.id,
  name: a.name,
  apelido: a.apelido || null,
  type: a.type,
  bank: a.bank || null,
  balance: Math.round((Number(a.balance) || 0) * 100) / 100,
  initial_balance: a.initialBalance != null ? Math.round(Number(a.initialBalance) * 100) / 100 : null,
  credit_limit: a.creditLimit != null ? Number(a.creditLimit) : null,
  credit_debt: Number(a.creditDebt) || 0,
  credit_month_bill: Number(a.creditMonthBill) || 0,
  closing_day: a.closingDay || null,
  due_day: a.dueDay || null,
  is_main: !!a.isMain,
  fluxo_caixa_principal: !!a.fluxoCaixaPrincipal,
  conta_corrente_principal: !!a.contaCorrentePrincipal,
  app_priority: !!a.appPriority,
  is_gerencial: !!a.isGerencial || a.type === 'gerencial',
  grupo_gerencial: a.grupoGerencial || null,
  account_group_id: a.accountGroupId || null,
  order: a.order ?? 0,
  debt_plan: a.debtPlan || null,
  profile_id: a.profileId || null,
  acquisition_value: a.acquisitionValue != null ? Number(a.acquisitionValue) : null,
  acquisition_date: a.acquisitionDate || null,
  value_history: a.valueHistory || [],
  is_reserva: !!a.isReserva,
  reserva_type: a.reservaType || null,
  reserva_category_id: a.reservaCategoryId || null,
  // Vínculo da conta: 'none' | 'reserva' | 'patrimonio' (fonte de verdade).
  // is_reserva é mantido sincronizado (= vinculo_tipo === 'reserva') por compatibilidade.
  vinculo_tipo: a.vinculoTipo || (a.isReserva ? 'reserva' : 'none'),
  patrimonio_category_id: a.patrimonioCategoryId || null,
  is_investimento: !!a.isInvestimento,
  investment_category_id: a.investmentCategoryId || null,
  conta_aplicacao: !!a.contaAplicacao,
  hide_on_mobile: !!a.hideOnMobile,
  projected_balance: a.projectedBalance != null ? Math.round(Number(a.projectedBalance) * 100) / 100 : null,
  active: a.active !== false,
})

export const rowToAccount = (r) => ({
  id: r.id,
  name: r.name,
  apelido: r.apelido || '',
  type: r.type,
  bank: r.bank || '',
  balance: Math.round((Number(r.balance) || 0) * 100) / 100,
  initialBalance: r.initial_balance != null ? Math.round(Number(r.initial_balance) * 100) / 100 : null,
  creditLimit: r.credit_limit != null ? Number(r.credit_limit) : null,
  creditDebt: Number(r.credit_debt) || 0,
  creditMonthBill: Number(r.credit_month_bill) || 0,
  closingDay: r.closing_day || null,
  dueDay: r.due_day || null,
  isMain: !!r.is_main,
  fluxoCaixaPrincipal: !!r.fluxo_caixa_principal,
  contaCorrentePrincipal: !!r.conta_corrente_principal,
  appPriority: !!r.app_priority,
  isGerencial: !!r.is_gerencial || r.type === 'gerencial',
  grupoGerencial: r.grupo_gerencial || null,
  accountGroupId: r.account_group_id || null,
  order: r.order ?? 0,
  debtPlan: r.debt_plan || null,
  profileId: r.profile_id || null,
  acquisitionValue: r.acquisition_value != null ? Number(r.acquisition_value) : null,
  acquisitionDate: r.acquisition_date || null,
  valueHistory: r.value_history || [],
  isReserva: !!r.is_reserva,
  reservaType: r.reserva_type || null,
  reservaCategoryId: r.reserva_category_id || null,
  vinculoTipo: r.vinculo_tipo || (r.is_reserva ? 'reserva' : 'none'),
  patrimonioCategoryId: r.patrimonio_category_id || null,
  isInvestimento: !!r.is_investimento,
  investmentCategoryId: r.investment_category_id || null,
  contaAplicacao: !!r.conta_aplicacao,
  hideOnMobile: !!r.hide_on_mobile,
  projectedBalance: r.projected_balance != null ? Math.round(Number(r.projected_balance) * 100) / 100 : null,
  active: r.active !== false,
})

export const txToRow = (tx) => ({
  id: tx.id,
  type: tx.type,
  account_id: tx.accountId || null,
  to_account_id: tx.toAccountId || null,
  from_account_id: tx.fromAccountId || null,
  amount: Number(tx.amount),
  date: tx.date,
  date_cartao: tx.dateCartao || null,
  description: tx.description || null,
  category_id: tx.categoryId || null,
  payee: tx.payee || null,
  cost_center: tx.costCenter || null,
  notes: tx.notes || null,
  grupo_gerencial: tx.grupoGerencial || null,
  account_type: tx.accountType || null,
  schedule_id: tx.scheduleId || null,
  reconciled: !!tx.reconciled,
  reserva_auto: !!tx.reservaAuto,
  is_espelho: !!tx.isEspelho,
  espelho_origem_id: tx.espelhoOrigemId || null,
  // Procedência (ver src/lib/origins.js). `|| 'manual'` só preenche ausência/vazio — um origin
  // já setado (ex.: 'importacao_fatura', 'reserva_auto') é truthy e passa intacto. A coluna é
  // gravada na criação e NUNCA reescrita: updateTransaction/bulk-update não tocam em origin.
  origin: tx.origin || 'manual',
  gerencial_schedule_id: tx.gerencialScheduleId || null,
  fatura_month_year: tx.faturaMonthYear || null,
  card_id: tx.cardId || null,
  fatura_ref: tx.faturaRef || null,
  source_expense_id: tx.sourceExpenseId || null,
  source_schedule_id: tx.sourceScheduleId || null,
  parent_tx_id: tx.parentTxId || null,
  reserva_funcao_id: tx.reservaFuncaoId || null,
  reserva_conta_id: tx.reservaContaId || null,
  installment_num: tx.installmentNum ?? null,
  installment_total: tx.installmentTotal ?? null,
  serie_id: tx.serieId || null,
  // Chave única da parcela (mesma fórmula do backfill) — protege contra importação
  // duplicada via uq_lancamentos_installment. null quando não é parcela.
  installment_key: installmentKey({
    accountId: tx.accountId,
    description: tx.description,
    installmentNum: tx.installmentNum,
    installmentTotal: tx.installmentTotal,
    amount: tx.amount,
    faturaMonthYear: tx.faturaMonthYear,
    date: tx.date,
  }),
  categoria_cnpj_id: tx.categoriaCnpjId || null,
  categoria_cpf_id: tx.categoriaCpfId || null,
  created_at: tx.createdAt || new Date().toISOString(),
})

export const rowToTx = (r) => ({
  id: r.id,
  type: r.type,
  accountId: r.account_id,
  toAccountId: r.to_account_id,
  fromAccountId: r.from_account_id,
  amount: Number(r.amount),
  date: r.date,
  dateCartao: toDateStr(r.date_cartao),
  description: r.description || '',
  categoryId: r.category_id || '',
  payee: r.payee || '',
  costCenter: r.cost_center || '',
  notes: r.notes || '',
  grupoGerencial: r.grupo_gerencial || null,
  accountType: r.account_type || '',
  scheduleId: r.schedule_id || null,
  reconciled: !!r.reconciled,
  reservaAuto: !!r.reserva_auto,
  isEspelho: !!r.is_espelho,
  espelhoOrigemId: r.espelho_origem_id || null,
  origin: r.origin || 'manual',
  gerencialScheduleId: r.gerencial_schedule_id || null,
  faturaMonthYear: r.fatura_month_year || null,
  cardId: r.card_id || null,
  faturaRef: r.fatura_ref || null,
  sourceExpenseId: r.source_expense_id || null,
  sourceScheduleId: r.source_schedule_id || null,
  parentTxId: r.parent_tx_id || null,
  reservaFuncaoId: r.reserva_funcao_id || null,
  reservaContaId: r.reserva_conta_id || null,
  installmentNum: r.installment_num ?? null,
  installmentTotal: r.installment_total ?? null,
  serieId: r.serie_id || null,
  categoriaCnpjId: r.categoria_cnpj_id || null,
  categoriaCpfId: r.categoria_cpf_id || null,
  createdAt: r.created_at,
})

export const scheduleToRow = (s) => ({
  id: s.id,
  description: s.description,
  transaction_type: s.transactionType,
  account_id: s.accountId || null,
  to_account_id: s.toAccountId || null,
  amount: Number(s.amount),
  category_id: s.categoryId || null,
  payee: s.payee || null,
  cost_center: s.costCenter || null,
  account_type: s.accountType || null,
  frequency: s.frequency,
  start_date: s.startDate,
  occurrence_type: s.occurrenceType || 'continuous',
  installments: s.installments || null,
  registered: s.registered || [],
  skipped: s.skipped || [],
  remind_days_before: s.remindDaysBefore ?? 3,
  auto_register: s.autoRegister ?? true,
  overrides: s.overrides || {},
  grupo_gerencial: s.grupoGerencial || null,
  reserva_expense_category_id: s.reservaExpenseCategoryId || null,
  reserva_funcao_id: s.reservaFuncaoId || null,
  fatura_ref: s.faturaRef || null,
  card_id: s.cardId || null,
  fatura_mes_ano: s.faturaMesAno || null,
  tipo: s.tipo || null,
  source_tx_id: s.sourceTxId || null,
  confirmado: !!s.confirmado,
  is_provisao: !!s.isProvisao,
  provisao_efetivada: !!s.provisaoEfetivada,
  provisao_efetivada_until: s.provisaoEfetivadaUntil || null,
  next_occurrence: s.nextOccurrence || null,
})

export const rowToSchedule = (r) => ({
  id: r.id,
  description: r.description,
  transactionType: r.transaction_type,
  accountId: r.account_id,
  toAccountId: r.to_account_id,
  amount: Number(r.amount),
  categoryId: r.category_id || '',
  payee: r.payee || '',
  costCenter: r.cost_center || '',
  accountType: r.account_type || '',
  frequency: r.frequency,
  startDate: r.start_date,
  occurrenceType: r.occurrence_type || 'continuous',
  installments: r.installments,
  registered: r.registered || [],
  skipped: r.skipped || [],
  remindDaysBefore: r.remind_days_before ?? 3,
  autoRegister: r.auto_register ?? true,
  overrides: r.overrides || {},
  grupoGerencial: r.grupo_gerencial || null,
  reservaExpenseCategoryId: r.reserva_expense_category_id || null,
  reservaFuncaoId: r.reserva_funcao_id || null,
  faturaRef: r.fatura_ref || null,
  cardId: r.card_id || null,
  faturaMesAno: r.fatura_mes_ano || null,
  tipo: r.tipo || null,
  sourceTxId: r.source_tx_id || null,
  confirmado: r.confirmado ?? false,
  isProvisao: !!r.is_provisao,
  provisaoEfetivada: !!r.provisao_efetivada,
  provisaoEfetivadaUntil: toDateStr(r.provisao_efetivada_until),
  nextOccurrence: toDateStr(r.next_occurrence),
})

// ─── Funções de reserva ───────────────────────────────────────────────────────

export const reserveFunctionToRow = (f) => ({
  id: f.id,
  name: f.name,
  account_id: f.accountId || null,
  saldo_inicial: Number(f.saldoInicial) || 0,
  entradas: Number(f.entradas) || 0,
  saidas: Number(f.saidas) || 0,
  despesa_anual: Number(f.despesaAnual) || 0,
  deposito_mensal: Number(f.depositoMensal) || 0,
  mes_vencimento: f.mesVencimento != null && f.mesVencimento !== '' ? String(f.mesVencimento) : null,
  ordem: Number.isFinite(f.ordem) ? f.ordem : 0,
  entradas_override: f.entradasOverride != null ? Number(f.entradasOverride) : null,
  saidas_override: f.saidasOverride != null ? Number(f.saidasOverride) : null,
  // Ajuste manual por mês { "YYYY-MM": valor }; null quando vazio.
  ajuste_override: f.ajusteOverride && typeof f.ajusteOverride === 'object' && Object.keys(f.ajusteOverride).length > 0
    ? f.ajusteOverride : null,
  // Flag: movimentações desta função contam como despesa nos relatórios/dashboard.
  exibir_como_despesa: !!f.exibirComoDespesa,
  // Categoria da despesa vinculada à função; sombras de reserva herdam dela.
  category_id: f.categoryId || null,
})

// Normaliza ajuste_override para o formato { "YYYY-MM": { valor, observacao } }.
// Migração on-the-fly: valores legados (número puro) viram { valor, observacao: '' }.
// Não roda UPDATE em massa — a conversão é persistida na próxima gravação da função.
const normalizeAjusteOverride = (raw) => {
  if (!raw || typeof raw !== 'object') return {}
  const out = {}
  for (const [mk, v] of Object.entries(raw)) {
    if (v && typeof v === 'object') {
      out[mk] = { valor: Number(v.valor) || 0, observacao: typeof v.observacao === 'string' ? v.observacao : '' }
    } else {
      out[mk] = { valor: Number(v) || 0, observacao: '' }
    }
  }
  return out
}

export const rowToReserveFunction = (r) => ({
  id: r.id,
  name: r.name,
  accountId: r.account_id || null,
  saldoInicial: Number(r.saldo_inicial) || 0,
  entradas: Number(r.entradas) || 0,
  saidas: Number(r.saidas) || 0,
  despesaAnual: Number(r.despesa_anual) || 0,
  depositoMensal: Number(r.deposito_mensal) || 0,
  mesVencimento: r.mes_vencimento != null && r.mes_vencimento !== '' ? Number(r.mes_vencimento) : null,
  ordem: r.ordem ?? 0,
  // Override manual; se ausente, herda valores manuais legados (entradas/saidas) para
  // não perder o que o usuário já preencheu antes da Etapa 2 (cálculo automático).
  entradasOverride: r.entradas_override != null ? Number(r.entradas_override)
    : (Number(r.entradas) ? Number(r.entradas) : null),
  saidasOverride: r.saidas_override != null ? Number(r.saidas_override)
    : (Number(r.saidas) ? Number(r.saidas) : null),
  ajusteOverride: normalizeAjusteOverride(r.ajuste_override),
  exibirComoDespesa: !!r.exibir_como_despesa,
  categoryId: r.category_id || null,
})

export const categoryToRow = (c) => ({
  id: c.id,
  name: c.name,
  type: c.type,
  color: c.color || null,
  icon: c.icon || null,
  category_group: c.group || null,
  investment_account_id: c.investmentAccountId || null,
  gera_espelho: !!c.geraEspelho,
  conta_espelho_id: c.contaEspelhoId || null,
  // Grupo gerencial padrão da categoria (id do grupo, mesmo formato de lancamentos.grupo_gerencial).
  default_gerencial_group: c.defaultGerencialGroup || null,
})

export const rowToCategory = (r) => ({
  id: r.id,
  name: r.name,
  type: r.type,
  color: r.color || '',
  icon: r.icon || '',
  group: r.category_group || null,
  investmentAccountId: r.investment_account_id || null,
  geraEspelho: !!r.gera_espelho,
  contaEspelhoId: r.conta_espelho_id || null,
  defaultGerencialGroup: r.default_gerencial_group || null,
})

export const budgetToRow = (b) => ({
  id: b.id,
  category_id: b.categoryId || null,
  amount: Number(b.amount),
  period: b.period || null,
})

export const rowToBudget = (r) => ({
  id: r.id,
  categoryId: r.category_id || '',
  amount: Number(r.amount),
  period: r.period || '',
})

export const ruleToRow = (r) => ({
  id: r.id,
  contains: r.contains,
  category_id: r.categoryId || null,
  payee: r.payee || null,
  day_of_month: r.dayOfMonth ?? null,
  amount_approx: r.amountApprox ?? null,
  grupo_gerencial: r.grupoGerencial || null,
  reserva_funcao_id: r.reservaFuncaoId || null,
})

export const rowToRule = (r) => ({
  id: r.id,
  contains: r.contains,
  categoryId: r.category_id || '',
  payee: r.payee || '',
  dayOfMonth: r.day_of_month ?? null,
  amountApprox: r.amount_approx != null ? Number(r.amount_approx) : null,
  grupoGerencial: r.grupo_gerencial || null,
  reservaFuncaoId: r.reserva_funcao_id || null,
})

export const gerencialGroupToRow = (g) => ({
  id: g.id,
  number: JSON.stringify(g.number), // JSONB exige JSON válido: 'D' → '"D"', 1 → '1'
  name: g.name,
  alias: g.alias || null,
  fixed: !!g.fixed,
  default_account_id: g.defaultAccountId || null,
})

export const rowToGerencialGroup = (r) => ({
  id: r.id,
  number: r.number,
  name: r.name,
  alias: r.alias || '',
  fixed: !!r.fixed,
  defaultAccountId: r.default_account_id || null,
})

export const gerencialRuleToRow = (r) => ({
  id: r.id,
  contains: r.contains,
  is_parcelado: r.isParcelado || 'any',
  min_amount: r.minAmount ?? null,
  max_amount: r.maxAmount ?? null,
  grupo_gerencial_id: r.grupoGerencialId,
  order: r.order ?? 0,
})

export const rowToGerencialRule = (r) => ({
  id: r.id,
  contains: r.contains,
  isParcelado: r.is_parcelado || 'any',
  minAmount: r.min_amount != null ? Number(r.min_amount) : null,
  maxAmount: r.max_amount != null ? Number(r.max_amount) : null,
  grupoGerencialId: r.grupo_gerencial_id,
  order: r.order ?? 0,
})

export const payableToRow = (p) => ({
  id: p.id,
  cartao_id: p.cartaoId || null,
  mes_ano: p.mesAno || null,
  grupo_gerencial_id: p.grupoGerencialId || null,
  origin: p.origin || null,
  description: p.description || null,
  amount: Number(p.amount),
  due_date: p.dueDate || null,
  status: p.status || 'pending',
  paid_at: p.paidAt || null,
  bill_start: p.billStart || null,
  bill_end: p.billEnd || null,
  installment_number: p.installmentNumber || null,
  total_installments: p.totalInstallments || null,
  import_id: p.importId || null,
})

export const rowToPayable = (r) => ({
  id: r.id,
  cartaoId: r.cartao_id,
  mesAno: r.mes_ano,
  grupoGerencialId: r.grupo_gerencial_id,
  origin: r.origin,
  description: r.description,
  amount: Number(r.amount),
  dueDate: r.due_date,
  status: r.status || 'pending',
  paidAt: r.paid_at,
  billStart: r.bill_start,
  billEnd: r.bill_end,
  installmentNumber: r.installment_number || null,
  totalInstallments: r.total_installments || null,
  importId: r.import_id || null,
})

export const envelopeToRow = (e) => ({
  id: e.id,
  name: e.name,
  limit_amount: Number(e.limitAmount) || 0,
  due_day: Number(e.dueDay) || 1,
  category_ids: e.categoryIds || [],
  account_id: e.accountId || null,
  history: e.history || [],
})

export const rowToEnvelope = (r) => ({
  id: r.id,
  name: r.name,
  limitAmount: Number(r.limit_amount) || 0,
  dueDay: Number(r.due_day) || 1,
  categoryIds: r.category_ids || [],
  accountId: r.account_id || null,
  history: r.history || [],
})

// ─── Carga inicial via API /api/load ─────────────────────────────────────────

export async function loadFromDb(defaultData) {
  try {
    const d = await apiGet('/api/load')

    // Sem dados de usuário (schema novo ou banco vazio) → migra local → Neon
    if (!d.cats || d.cats.length === 0 || !d.accs || d.accs.length === 0) {
      return { status: 'empty', data: null }
    }

    return {
      status: 'connected',
      data: {
        settings: d.cfg
          ? {
              financialMonthStartDay: d.cfg.financial_month_start_day ?? 1,
              financialMonthMode: d.cfg.financial_month_mode || 'custom',
              currency: d.cfg.currency ?? 'BRL',
              recurringMatchExceptions: d.cfg.recurring_match_exceptions ?? [],
              categoryGroups: d.cfg.category_groups ?? [],
              lastBalanceSnapshot: d.cfg.balance_snapshot || null,
              estornoCartaoEnabled: d.cfg.estorno_cartao_enabled ?? null,
              estornoCartaoCategoryId: d.cfg.estorno_cartao_category_id ?? null,
              faturasFechadas: d.cfg.faturas_fechadas ?? {},
            }
          : defaultData.settings,
        costCenters: d.cfg?.cost_centers ?? defaultData.costCenters,
        accounts: d.accs.map(rowToAccount),
        transactions: d.txs.map(rowToTx),
        schedules: d.scheds.map(rowToSchedule),
        categories: d.cats.map(rowToCategory),
        budgets: d.buds.map(rowToBudget),
        classificationRules: d.rules.map(rowToRule),
        gerencialGroups:
          d.gers.length > 0 ? d.gers.map(rowToGerencialGroup) : defaultData.gerencialGroups,
        gerencialRules: d.grules?.map(rowToGerencialRule) || [],
        payables: d.pays.map(rowToPayable),
        payees: d.faves.map((r) => r.name),
        envelopes: d.envs.map(rowToEnvelope),
        accountGroups: d.groups.length > 0 ? d.groups.map(rowToAccountGroup) : null,
        profiles: d.perfis.map(rowToPerfil),
        cardImports: d.imports?.map(rowToImport) || [],
        reserveFunctions: d.rfns?.map(rowToReserveFunction) || [],
        rateios: d.rateios?.map(rowToRateio) || [],
        scheduleReservaFuncoes: d.srfs?.map(rowToScheduleReservaFuncao) || [],
      },
    }
  } catch (err) {
    if (err.status === 404) return { status: 'schema-missing', data: null, error: err.message }
    return { status: 'error', data: null, error: err.message }
  }
}

// ─── Seed de dados iniciais ───────────────────────────────────────────────────

export async function seedDefaults(defaultData) {
  await Promise.all([
    syncSection('categorias', [], defaultData.categories, categoryToRow),
    syncSection('reservas_funcoes', [], defaultData.gerencialGroups, gerencialGroupToRow),
    syncSettings(defaultData.settings, defaultData.costCenters),
  ])
}

// ─── Card Imports (histórico de importações) ─────────────────────────────────

export const importToRow = (i) => ({
  id: i.id,
  imported_at: i.importedAt,
  count: i.count,
  mes_ano: i.mesAno || '',
  filename: i.filename || '',
  account_id: i.accountId || '',
  tx_ids: i.txIds || [],
})

export const rowToImport = (r) => ({
  id: r.id,
  importedAt: r.imported_at,
  count: r.count,
  mesAno: r.mes_ano || '',
  filename: r.filename || '',
  accountId: r.account_id || '',
  txIds: r.tx_ids || [],
})

// ─── Account Mapping (De-Para Dindin → Finup) ────────────────────────────────

export async function loadAccountMappings() {
  try {
    const data = await apiGet('/api/account-mapping')
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

// ─── Importação histórica (staging importacoes_pendentes) ────────────────────

// ─── Rateio de lançamento ────────────────────────────────────────────────────

export const rowToRateio = (r) => ({
  id: r.id,
  lancamentoId: r.lancamento_id,
  categoriaId: r.categoria_id || '',
  valor: Number(r.valor) || 0,
  descricao: r.descricao || '',
})

// ─── Detalhamento por função do agendamento de resgate ───────────────────────

export const scheduleReservaFuncaoToRow = (s) => ({
  id: s.id,
  schedule_id: s.scheduleId,
  reserva_funcao_id: s.reservaFuncaoId,
  valor: Number(s.valor) || 0,
  source_ids: Array.isArray(s.sourceIds) ? s.sourceIds : [],
  // ID do lançamento do cartão que originou esta linha (modelo 1 linha por lançamento). Derivado
  // de forma determinística do id da linha; o motor reconstrói o detalhamento a cada recálculo, então
  // o valor é sempre o mesmo para um dado id — nunca é sobrescrito com valor diferente num update.
  source_lancamento_id: s.sourceLancamentoId || null,
  fatura_ref: s.faturaRef || null,
})

export const rowToScheduleReservaFuncao = (r) => ({
  id: r.id,
  scheduleId: r.schedule_id,
  reservaFuncaoId: r.reserva_funcao_id,
  valor: Number(r.valor) || 0,
  sourceIds: Array.isArray(r.source_ids) ? r.source_ids : [],
  sourceLancamentoId: r.source_lancamento_id || null,
  faturaRef: r.fatura_ref || null,
})

export async function loadRateios(lancamentoId) {
  try {
    const data = await apiGet(`/api/lancamento-rateios?lancamento_id=${encodeURIComponent(lancamentoId)}`)
    return Array.isArray(data) ? data.map(rowToRateio) : []
  } catch {
    return []
  }
}

// rateios: [{ id, categoriaId, valor, descricao }] — substitui todos do lançamento.
export async function saveRateios(lancamentoId, rateios) {
  return apiPost('/api/lancamento-rateios', { action: 'save', lancamentoId, rateios: rateios || [] })
}

export async function deleteRateios(lancamentoId) {
  return apiPost('/api/lancamento-rateios', { action: 'delete', lancamentoId })
}

export async function loadImportPendentes({ origem, status } = {}) {
  const qs = new URLSearchParams()
  if (origem) qs.set('origem', origem)
  if (status) qs.set('status', status)
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  try {
    const data = await apiGet(`/api/importacoes-pendentes${suffix}`)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

// rows já em snake_case (colunas de importacoes_pendentes), com id.
export async function insertImportPendentes(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return { ok: true, count: 0 }
  return apiPost('/api/importacoes-pendentes', { action: 'insert', rows })
}

export async function updateImportPendentesStatus(ids, status) {
  if (!Array.isArray(ids) || ids.length === 0) return { ok: true }
  return apiPost('/api/importacoes-pendentes', { action: 'updateStatus', ids, status })
}

export async function clearImportPendentes(origem, status) {
  return apiPost('/api/importacoes-pendentes', { action: 'clear', origem, status })
}

// Grava as linhas (ids) em lancamentos com origin='DINDIN' e marca como confirmado.
export async function confirmImportPendentes(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return { ok: true, inserted: 0 }
  return apiPost('/api/importacoes-pendentes', { action: 'confirm', ids })
}

// ─── Ping ─────────────────────────────────────────────────────────────────────

export async function pingDb() {
  try {
    const result = await apiGet('/api/ping')
    return result.ok === true
  } catch {
    return false
  }
}

// ─── Sync helpers ─────────────────────────────────────────────────────────────

export async function syncSection(table, prevItems, currItems, toRow) {
  try {
    const prevIds = new Set((prevItems || []).map((i) => i.id))
    const currIds = new Set((currItems || []).map((i) => i.id))
    const toDelete = [...prevIds].filter((id) => !currIds.has(id))
    await apiPost('/api/sync', {
      type: 'section',
      table,
      upsert: (currItems || []).map(toRow),
      delete: toDelete,
    })
  } catch (err) {
    console.error(`[db] sync ${table}:`, err.message)
    throw err // propaga p/ o chamador não marcar como sincronizado o que falhou
  }
}

// Detalhamento (schedule_reserva_funcoes) sincronizado por AGENDAMENTO num endpoint dedicado
// (/api/sync-srf), FORA do payload do /api/sync genérico: faturas grandes chegam a 188+ linhas
// de detalhamento e inflavam/estouravam a section. Cada chamada substitui TODO o detalhamento de
// um schedule_id (DELETE + INSERT). As rows são mapeadas p/ snake_case (mesmo mapper do sync).
export async function syncSrf(scheduleId, rows) {
  try {
    return await apiPost('/api/sync-srf', {
      scheduleId,
      rows: (rows || []).map(scheduleReservaFuncaoToRow),
    })
  } catch (err) {
    console.error(`[syncSrf] falha ao sincronizar detalhamento de ${scheduleId}:`, err?.message || err)
    throw err
  }
}

// Assinatura estável de um conjunto de linhas de um schedule (ordem-independente) — usada para
// pular agendamentos cujo detalhamento não mudou entre prev e curr (o motor regenera de forma
// determinística: mesmo id ⇒ mesmos valores).
function srfSignature(rows) {
  return (rows || [])
    .map(r => `${r.id}:${r.valor}:${r.reservaFuncaoId ?? ''}:${r.sourceLancamentoId ?? ''}:${r.faturaRef ?? ''}`)
    .sort()
    .join('|')
}

// Diffa o detalhamento por schedule_id entre prev e curr e reenvia (via /api/sync-srf) SOMENTE os
// agendamentos cujo conjunto de linhas mudou — inclusive os que perderam todas as linhas (rows []
// ⇒ o endpoint só apaga). Substitui a antiga syncSection('schedule_reserva_funcoes', ...).
export async function syncScheduleReservaFuncoes(prevItems, currItems) {
  const groupBy = (items) => {
    const m = new Map()
    for (const it of (items || [])) {
      if (!it?.scheduleId) continue
      if (!m.has(it.scheduleId)) m.set(it.scheduleId, [])
      m.get(it.scheduleId).push(it)
    }
    return m
  }
  const prevBy = groupBy(prevItems)
  const currBy = groupBy(currItems)
  const scheduleIds = new Set([...prevBy.keys(), ...currBy.keys()])
  const tasks = []
  for (const scheduleId of scheduleIds) {
    const prevRows = prevBy.get(scheduleId) || []
    const currRows = currBy.get(scheduleId) || []
    if (srfSignature(prevRows) === srfSignature(currRows)) continue // sem mudança → não reenvia
    tasks.push(syncSrf(scheduleId, currRows))
  }
  if (tasks.length > 0) await Promise.all(tasks)
}

export async function syncAccounts(prevAccounts, currAccounts) {
  try {
    const prevIds = new Set((prevAccounts || []).map((a) => a.id))
    const currIds = new Set(currAccounts.map((a) => a.id))
    const toDelete = [...prevIds].filter((id) => !currIds.has(id))

    const prevCards = (prevAccounts || []).filter((a) => a.type === 'credit')
    const currCards = currAccounts.filter((a) => a.type === 'credit')
    const prevCardIds = new Set(prevCards.map((c) => c.id))
    const currCardIds = new Set(currCards.map((c) => c.id))
    const deleteCards = [...prevCardIds].filter((id) => !currCardIds.has(id))

    await apiPost('/api/sync', {
      type: 'accounts',
      upsert: currAccounts.map(accountToRow),
      delete: toDelete,
      cards: currCards.map((c) => ({
        id: c.id,
        credit_limit: c.creditLimit || 0,
        credit_debt: c.creditDebt || 0,
        closing_day: c.closingDay || null,
        due_day: c.dueDay || null,
      })),
      deleteCards,
    })
  } catch (err) {
    console.error('[db] sync accounts:', err.message)
    throw err
  }
}

export async function syncPayees(prevPayees, currPayees) {
  try {
    const prev = new Set(prevPayees || [])
    const curr = new Set(currPayees || [])
    const remove = [...prev].filter((p) => !curr.has(p))
    const add = [...curr].filter((p) => !prev.has(p))
    if (add.length > 0 || remove.length > 0) {
      await apiPost('/api/sync', { type: 'payees', add, remove })
    }
  } catch (err) {
    console.error('[db] sync payees:', err.message)
    throw err
  }
}

export async function syncSettings(settings, costCenters) {
  try {
    await apiPost('/api/sync', {
      type: 'settings',
      data: {
        financial_month_start_day: settings.financialMonthStartDay ?? 1,
        financial_month_mode: settings.financialMonthMode || 'custom',
        currency: settings.currency ?? 'BRL',
        cost_centers: costCenters ?? [],
        recurring_match_exceptions: settings.recurringMatchExceptions ?? [],
        category_groups: settings.categoryGroups ?? [],
        balance_snapshot: settings.lastBalanceSnapshot || null,
        estorno_cartao_enabled: settings.estornoCartaoEnabled ?? null,
        estorno_cartao_category_id: settings.estornoCartaoCategoryId ?? null,
        faturas_fechadas: settings.faturasFechadas ?? {},
      },
    })
  } catch (err) {
    console.error('[db] sync settings:', err.message)
    throw err
  }
}

// ─── Restauração de backup (importação manual) ───────────────────────────────

// Restaura a tabela account_mapping (upsert por id — não remove linhas extras,
// pois é dado de referência). Os rows já vêm em snake_case (formato exportado).
export async function restoreAccountMappings(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return
  try {
    await apiPost('/api/sync', { type: 'section', table: 'account_mapping', upsert: rows, delete: [] })
  } catch (err) {
    console.error('[db] restore account_mapping:', err.message)
  }
}

// Restaura um backup completo no Neon: faz upsert de tudo que está no backup e
// remove do banco o que não existir mais nele (substituição total). Usa o estado
// atual do Neon como "prev" para calcular as exclusões por id.
export async function restoreFullBackup(backup, accountMapping) {
  const empty = {
    accounts: [], transactions: [], schedules: [], categories: [], budgets: [],
    classificationRules: [], gerencialRules: [], gerencialGroups: [], payables: [],
    payees: [], envelopes: [], accountGroups: [], profiles: [], cardImports: [],
    reserveFunctions: [],
  }
  let prev = empty
  try {
    const current = await loadFromDb({ settings: {}, costCenters: [] })
    if (current.status === 'connected') prev = { ...empty, ...current.data }
  } catch (err) {
    console.error('[db] restore: falha ao ler estado atual do Neon:', err.message)
  }

  const d = backup
  // Mesma estratégia (e ordem) do full-sync de AppContext — FK contas→cartões é
  // tratada internamente por syncAccounts; demais tabelas não têm FK restritiva.
  await Promise.all([
    syncAccounts(prev.accounts, d.accounts || []),
    syncSection('lancamentos', prev.transactions, d.transactions || [], txToRow),
    syncSection('agendamentos', prev.schedules, d.schedules || [], scheduleToRow),
    syncSection('categorias', prev.categories, d.categories || [], categoryToRow),
    syncSection('orcamento', prev.budgets, d.budgets || [], budgetToRow),
    syncSection('regras_classificacao', prev.classificationRules, d.classificationRules || [], ruleToRow),
    syncSection('gerencial_rules', prev.gerencialRules, d.gerencialRules || [], gerencialRuleToRow),
    syncSection('reservas_funcoes', prev.gerencialGroups, d.gerencialGroups || [], gerencialGroupToRow),
    syncSection('reservas', prev.payables, d.payables || [], payableToRow),
    syncPayees(prev.payees, d.payees || []),
    syncSection('envelopes', prev.envelopes, d.envelopes || [], envelopeToRow),
    syncSection('grupos_conta', prev.accountGroups, d.accountGroups || [], accountGroupToRow),
    syncSection('perfis', prev.profiles, d.profiles || [], perfilToRow),
    syncSection('card_imports', prev.cardImports, d.cardImports || [], importToRow),
    syncSection('reserve_functions', prev.reserveFunctions, d.reserveFunctions || [], reserveFunctionToRow),
    syncSettings(d.settings || {}, d.costCenters || []),
  ])

  await restoreAccountMappings(accountMapping)
}
