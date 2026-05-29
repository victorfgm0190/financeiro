import { createClient } from '@supabase/supabase-js'
// envelopeToRow / rowToEnvelope defined below — used by AppContext sync

const SUPABASE_URL = 'https://kwztqlxrxypnkldfxml.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3enRxbHhyeHlwbmtsZGZ4dG1sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgzNzM4MjAsImV4cCI6MjA2Mzk0OTgyMH0.NSZXiYEdVIljDAzJrz5IoAgAJ1aedcwalF4ENtywy4Q'

console.log('[Supabase] URL:', SUPABASE_URL)
console.log('[Supabase] KEY:', SUPABASE_KEY ? SUPABASE_KEY.slice(0, 20) + '...' : 'UNDEFINED')

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
console.log('Supabase URL:', import.meta.env.VITE_SUPABASE_URL)

// ─── Transformadores camelCase ↔ snake_case ───────────────────────────────────

export const accountToRow = (a) => ({
  id: a.id,
  name: a.name,
  apelido: a.apelido || null,
  type: a.type,
  bank: a.bank || null,
  balance: Number(a.balance) || 0,
  credit_limit: a.creditLimit != null ? Number(a.creditLimit) : null,
  credit_debt: Number(a.creditDebt) || 0,
  credit_month_bill: Number(a.creditMonthBill) || 0,
  closing_day: a.closingDay || null,
  due_day: a.dueDay || null,
  is_main: !!a.isMain,
  fluxo_caixa_principal: !!a.fluxoCaixaPrincipal,
  conta_corrente_principal: !!a.contaCorrentePrincipal,
  grupo_gerencial: a.grupoGerencial || null,
})

export const rowToAccount = (r) => ({
  id: r.id,
  name: r.name,
  apelido: r.apelido || '',
  type: r.type,
  bank: r.bank || '',
  balance: Number(r.balance) || 0,
  creditLimit: r.credit_limit != null ? Number(r.credit_limit) : null,
  creditDebt: Number(r.credit_debt) || 0,
  creditMonthBill: Number(r.credit_month_bill) || 0,
  closingDay: r.closing_day || null,
  dueDay: r.due_day || null,
  isMain: !!r.is_main,
  fluxoCaixaPrincipal: !!r.fluxo_caixa_principal,
  contaCorrentePrincipal: !!r.conta_corrente_principal,
  grupoGerencial: r.grupo_gerencial || null,
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
  number: g.number,
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

// ─── Status possíveis de conexão ──────────────────────────────────────────────
// 'connecting'     → verificando
// 'connected'      → conectado e com dados
// 'seeded'         → conectado, banco vazio, defaults semeados
// 'schema-missing' → tabelas não existem no Supabase
// 'error'          → falha de rede ou credencial inválida

// ─── Carga inicial do Supabase ────────────────────────────────────────────────

export async function loadFromSupabase(defaultData) {
  // Ping: testa conectividade e existência do schema
  const ping = await supabase.from('configuracoes').select('id').limit(1)

  console.log('[Supabase] ping result:', JSON.stringify({ error: ping.error, status: ping.status }))

  if (ping.error) {
    const msg = ping.error.message || ''
    const code = String(ping.error.code || '')
    const isTableMissing =
      msg.includes('does not exist') ||
      msg.includes('relation') ||
      msg.includes('Could not find') ||
      msg.includes('PGRST') ||
      code === '42P01' ||
      code === 'PGRST106' ||
      code === 'PGRST200' ||
      ping.status === 404

    if (isTableMissing) {
      return { status: 'schema-missing', data: null, error: msg }
    }
    return { status: 'error', data: null, error: msg }
  }

  // Schema existe — carrega tudo em paralelo
  try {
    const [
      { data: accs, error: e1 },
      { data: txs, error: e2 },
      { data: scheds },
      { data: cats },
      { data: buds },
      { data: rules },
      { data: gers },
      { data: pays },
      { data: faves },
      { data: cfg },
      { data: envs },
    ] = await Promise.all([
      supabase.from('contas').select('*'),
      supabase.from('lancamentos').select('*').order('created_at'),
      supabase.from('agendamentos').select('*'),
      supabase.from('categorias').select('*'),
      supabase.from('orcamento').select('*'),
      supabase.from('regras_classificacao').select('*'),
      supabase.from('reservas_funcoes').select('*'),
      supabase.from('reservas').select('*'),
      supabase.from('favorecidos').select('name'),
      supabase.from('configuracoes').select('*').eq('id', 1).maybeSingle(),
      supabase.from('envelopes').select('*'),
    ])

    // Banco vazio (primeira execução real)
    if (!cats || cats.length === 0) {
      return { status: 'empty', data: null }
    }

    return {
      status: 'connected',
      data: {
        settings: cfg ? {
          financialMonthStartDay: cfg.financial_month_start_day ?? 1,
          currency: cfg.currency ?? 'BRL',
          recurringMatchExceptions: cfg.recurring_match_exceptions ?? [],
        } : defaultData.settings,
        costCenters: cfg?.cost_centers ?? defaultData.costCenters,
        accounts: (accs || []).map(rowToAccount),
        transactions: (txs || []).map(rowToTx),
        schedules: (scheds || []).map(rowToSchedule),
        categories: cats.map(rowToCategory),
        budgets: (buds || []).map(rowToBudget),
        classificationRules: (rules || []).map(rowToRule),
        gerencialGroups: (gers || []).length > 0
          ? gers.map(rowToGerencialGroup)
          : defaultData.gerencialGroups,
        payables: (pays || []).map(rowToPayable),
        payees: (faves || []).map(r => r.name),
        envelopes: (envs || []).map(rowToEnvelope),
      },
    }
  } catch (err) {
    return { status: 'error', data: null, error: err.message }
  }
}

// ─── Seed de dados iniciais ───────────────────────────────────────────────────

export async function seedDefaults(defaultData) {
  await Promise.all([
    supabase.from('categorias').upsert(defaultData.categories.map(categoryToRow), { onConflict: 'id' }),
    supabase.from('reservas_funcoes').upsert(defaultData.gerencialGroups.map(gerencialGroupToRow), { onConflict: 'id' }),
    supabase.from('configuracoes').upsert({
      id: 1,
      financial_month_start_day: defaultData.settings.financialMonthStartDay,
      currency: defaultData.settings.currency,
      cost_centers: defaultData.costCenters,
    }, { onConflict: 'id' }),
  ])
}

// ─── Sync helpers ─────────────────────────────────────────────────────────────

export async function syncSection(table, prevItems, currItems, toRow) {
  try {
    const prevIds = new Set((prevItems || []).map(i => i.id))
    const currIds = new Set((currItems || []).map(i => i.id))
    const toDelete = [...prevIds].filter(id => !currIds.has(id))
    if (toDelete.length > 0) await supabase.from(table).delete().in('id', toDelete)
    if (currItems.length > 0) {
      await supabase.from(table).upsert(currItems.map(toRow), { onConflict: 'id' })
    }
  } catch (err) {
    console.error(`[Supabase] sync ${table}:`, err)
  }
}

export async function syncAccounts(prevAccounts, currAccounts) {
  await syncSection('contas', prevAccounts, currAccounts, accountToRow)
  try {
    const prevCards = (prevAccounts || []).filter(a => a.type === 'credit')
    const currCards = currAccounts.filter(a => a.type === 'credit')
    const toDelete = new Set(prevCards.map(c => c.id))
    currCards.forEach(c => toDelete.delete(c.id))
    if (toDelete.size > 0) await supabase.from('cartoes').delete().in('id', [...toDelete])
    if (currCards.length > 0) {
      await supabase.from('cartoes').upsert(currCards.map(c => ({
        id: c.id,
        credit_limit: c.creditLimit || 0,
        credit_debt: c.creditDebt || 0,
        closing_day: c.closingDay || null,
        due_day: c.dueDay || null,
      })), { onConflict: 'id' })
    }
  } catch (err) {
    console.error('[Supabase] sync cartoes:', err)
  }
}

export async function syncPayees(prevPayees, currPayees) {
  try {
    const prev = new Set(prevPayees || [])
    const curr = new Set(currPayees || [])
    const toDelete = [...prev].filter(p => !curr.has(p))
    const toAdd = [...curr].filter(p => !prev.has(p))
    if (toDelete.length > 0) await supabase.from('favorecidos').delete().in('name', toDelete)
    if (toAdd.length > 0) {
      await supabase.from('favorecidos').upsert(toAdd.map(name => ({ name })), { onConflict: 'name' })
    }
  } catch (err) {
    console.error('[Supabase] sync favorecidos:', err)
  }
}

export async function syncSettings(settings, costCenters) {
  try {
    await supabase.from('configuracoes').upsert({
      id: 1,
      financial_month_start_day: settings.financialMonthStartDay ?? 1,
      currency: settings.currency ?? 'BRL',
      cost_centers: costCenters ?? [],
      recurring_match_exceptions: settings.recurringMatchExceptions ?? [],
    }, { onConflict: 'id' })
  } catch (err) {
    console.error('[Supabase] sync configuracoes:', err)
  }
}
