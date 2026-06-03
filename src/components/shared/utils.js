export function fmt(value, currency = 'BRL') {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value ?? 0)
}

export function fmtDate(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

export function today() {
  return new Date().toISOString().split('T')[0]
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

// Conjunto de ids de contas marcadas como "Aplicação Financeira".
export function aplicacaoAccountIds(accounts) {
  return new Set((accounts || []).filter(a => a.contaAplicacao).map(a => a.id))
}

// Aporte = transferência para conta de aplicação financeira COM categoria preenchida.
// Estas devem aparecer nos relatórios tratadas como despesa/saída.
// Transferências para aplicação SEM categoria continuam invisíveis nos relatórios.
export function isAplicacaoAporte(tx, aplicSet) {
  return tx.type === 'transfer' && !!tx.categoryId && aplicSet.has(tx.toAccountId)
}

// Conta como despesa nos relatórios: despesas normais + aportes categorizados.
export function countsAsReportExpense(tx, aplicSet) {
  return tx.type === 'expense' || isAplicacaoAporte(tx, aplicSet)
}

// 0 = Conta Principal / Cartão, 1 = appPriority, 2 = rest
export function accountPriority(a) {
  if (a.isMain || a.type === 'credit') return 0
  if (a.appPriority) return 1
  return 2
}

// Returns accounts grouped and sorted by accountGroup.order, then account.order
// Shape: [{ group: groupObj|null, accounts: [...] }, ...]
export function groupedAccountOptions(accounts, accountGroups) {
  const sorted = [...(accountGroups || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const result = []
  for (const group of sorted) {
    const accs = accounts
      .filter(a => a.accountGroupId === group.id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    if (accs.length > 0) result.push({ group, accounts: accs })
  }
  const ungrouped = accounts
    .filter(a => !a.accountGroupId)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  if (ungrouped.length > 0) result.push({ group: null, accounts: ungrouped })
  return result
}
