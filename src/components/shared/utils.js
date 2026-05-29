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
