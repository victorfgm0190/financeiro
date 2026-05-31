// ─── Helpers fetch ────────────────────────────────────────────────────────────

async function apiGet(path) {
  const res = await fetch(path)
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = new Error(`POST ${path} → ${res.status}`)
    err.status = res.status
    throw err
  }
  return res.json()
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
  projected_balance: a.projectedBalance != null ? Math.round(Number(a.projectedBalance) * 100) / 100 : null,
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
  projectedBalance: r.projected_balance != null ? Math.round(Number(r.projected_balance) * 100) / 100 : null,
})

export const txToRow = (tx) => ({
  id: tx.id,
  type: tx.type,
  account_id: tx.accountId || null,
  to_account_id: tx.toAccountId || null,
  from_account_id: tx.fromAccountId || null,
  amount: Number(tx.amount),
  date: tx.date,
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
  origin: tx.origin || 'manual',
  gerencial_schedule_id: tx.gerencialScheduleId || null,
  fatura_month_year: tx.faturaMonthYear || null,
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
  origin: r.origin || 'manual',
  gerencialScheduleId: r.gerencial_schedule_id || null,
  faturaMonthYear: r.fatura_month_year || null,
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
})

export const categoryToRow = (c) => ({
  id: c.id,
  name: c.name,
  type: c.type,
  color: c.color || null,
  icon: c.icon || null,
  category_group: c.group || null,
})

export const rowToCategory = (r) => ({
  id: r.id,
  name: r.name,
  type: r.type,
  color: r.color || '',
  icon: r.icon || '',
  group: r.category_group || null,
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
})

export const rowToRule = (r) => ({
  id: r.id,
  contains: r.contains,
  categoryId: r.category_id || '',
  payee: r.payee || '',
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
              currency: d.cfg.currency ?? 'BRL',
              recurringMatchExceptions: d.cfg.recurring_match_exceptions ?? [],
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
        payables: d.pays.map(rowToPayable),
        payees: d.faves.map((r) => r.name),
        envelopes: d.envs.map(rowToEnvelope),
        accountGroups: d.groups.length > 0 ? d.groups.map(rowToAccountGroup) : null,
        profiles: d.perfis.map(rowToPerfil),
        cardImports: d.imports?.map(rowToImport) || [],
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
  }
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
  }
}

export async function syncSettings(settings, costCenters) {
  try {
    await apiPost('/api/sync', {
      type: 'settings',
      data: {
        financial_month_start_day: settings.financialMonthStartDay ?? 1,
        currency: settings.currency ?? 'BRL',
        cost_centers: costCenters ?? [],
        recurring_match_exceptions: settings.recurringMatchExceptions ?? [],
      },
    })
  } catch (err) {
    console.error('[db] sync settings:', err.message)
  }
}
