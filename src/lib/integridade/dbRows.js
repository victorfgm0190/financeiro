// Linhas do Neon (snake_case) → formato do app (camelCase), só com os campos que as regras leem.
// Espelha rowToTx/rowToAccount/rowToSchedule/rowToGerencialGroup de src/lib/db.js, que não pode ser
// importado pela API: ele puxa o cliente HTTP do browser (api.js → hooks → React).

const dataStr = (v) => {
  if (!v) return null
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
  }
  return String(v).slice(0, 10)
}

export const txDeLinha = (r) => ({
  id: r.id,
  type: r.type,
  accountId: r.account_id || null,
  toAccountId: r.to_account_id || null,
  fromAccountId: r.from_account_id || null,
  amount: Number(r.amount),
  date: r.date,
  dateCartao: dataStr(r.date_cartao),
  description: r.description || '',
  notes: r.notes || '',
  payee: r.payee || '',
  grupoGerencial: r.grupo_gerencial || null,
  accountType: r.account_type || '',
  scheduleId: r.schedule_id || null,
  reservaAuto: !!r.reserva_auto,
  isEspelho: !!r.is_espelho,
  origin: r.origin || 'manual',
  faturaMonthYear: r.fatura_month_year || null,
  cardId: r.card_id || null,
  faturaRef: r.fatura_ref || null,
  sourceExpenseId: r.source_expense_id || null,
  sourceScheduleId: r.source_schedule_id || null,
  parentTxId: r.parent_tx_id || null,
  reservaFuncaoId: r.reserva_funcao_id || null,
  installmentNum: r.installment_num ?? null,
  installmentTotal: r.installment_total ?? null,
  installmentOccurrence: r.installment_occurrence ?? null,
  installmentKey: r.installment_key || null,
  serieId: r.serie_id || null,
  createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : (r.created_at || null),
})

export const contaDeLinha = (r) => ({
  id: r.id,
  name: r.name,
  apelido: r.apelido || '',
  type: r.type,
  balance: Number(r.balance) || 0,
  closingDay: r.closing_day || null,
  dueDay: r.due_day || null,
  isMain: !!r.is_main,
  contaCorrentePrincipal: !!r.conta_corrente_principal,
  isGerencial: !!r.is_gerencial || r.type === 'gerencial',
  grupoGerencial: r.grupo_gerencial || null,
})

export const agendamentoDeLinha = (r) => ({
  id: r.id,
  description: r.description,
  transactionType: r.transaction_type,
  accountId: r.account_id,
  toAccountId: r.to_account_id,
  amount: Number(r.amount),
  frequency: r.frequency,
  startDate: dataStr(r.start_date),
  occurrenceType: r.occurrence_type || 'continuous',
  installments: r.installments,
  registered: r.registered || [],
  skipped: r.skipped || [],
  overrides: r.overrides || {},
  grupoGerencial: r.grupo_gerencial || null,
  reservaFuncaoId: r.reserva_funcao_id || null,
  faturaRef: r.fatura_ref || null,
  cardId: r.card_id || null,
  faturaMesAno: r.fatura_mes_ano || null,
  tipo: r.tipo || null,
  confirmado: r.confirmado ?? false,
  nextOccurrence: dataStr(r.next_occurrence),
  sourceExpenseIds: Array.isArray(r.source_expense_ids) ? r.source_expense_ids : [],
})

export const grupoDeLinha = (r) => ({
  id: r.id,
  number: r.number,
  name: r.name,
  alias: r.alias || '',
  defaultAccountId: r.default_account_id || null,
})

export function dadosDeLinhas({ lancamentos = [], contas = [], agendamentos = [], grupos = [] }) {
  return {
    transactions: lancamentos.map(txDeLinha),
    accounts: contas.map(contaDeLinha),
    schedules: agendamentos.map(agendamentoDeLinha),
    gerencialGroups: grupos.map(grupoDeLinha),
  }
}
