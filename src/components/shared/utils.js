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

// ─── Filtros de lançamentos (barra de filtros em tempo real) ────────────────
export const EMPTY_LANC_FILTROS = { data: '', historico: '', favorecido: '', de: '', para: '', categoria: '', valorDe: '', valorAte: '' }

export function hasLancFiltros(f) {
  return !!(f && (f.data || f.historico || f.favorecido || f.de || f.para || f.categoria || f.valorDe || f.valorAte))
}

// Nomes "Conta De" / "Conta Para" de um lançamento (absoluto, não relativo à
// conta visualizada) — mesma convenção do extrato: transferência usa origem→destino;
// receita usa favorecido→conta; despesa usa conta→favorecido.
export function txDeParaNames(tx, accounts) {
  const name = id => { const a = accounts.find(x => x.id === id); return a ? (a.apelido || a.name) : '' }
  const isTransfer = tx.type === 'transfer' || tx.type === 'credit_payment'
  if (isTransfer) return { de: name(tx.accountId), para: name(tx.toAccountId) }
  if (tx.type === 'income') return { de: tx.payee || '', para: name(tx.accountId) }
  return { de: name(tx.accountId), para: tx.payee || '' } // expense
}

// True se o lançamento satisfaz TODOS os filtros preenchidos (AND). Campo vazio
// não filtra. Data casa parcialmente contra DD/MM/AAAA; demais são substring
// case-insensitive.
export function matchLancFiltros(tx, f, accounts) {
  if (!hasLancFiltros(f)) return true
  const norm = s => (s ?? '').toString().toLowerCase()
  if (f.data && !fmtDate(tx.date).includes(f.data.trim())) return false
  if (f.historico && !norm(tx.description).includes(norm(f.historico))) return false
  if (f.favorecido && !norm(tx.payee).includes(norm(f.favorecido))) return false
  if (f.de || f.para) {
    const { de, para } = txDeParaNames(tx, accounts)
    if (f.de && !norm(de).includes(norm(f.de))) return false
    if (f.para && !norm(para).includes(norm(f.para))) return false
  }
  if (f.categoria && tx.categoryId !== f.categoria) return false
  if (f.valorDe || f.valorAte) {
    const num = s => { const n = parseFloat(String(s).replace(',', '.')); return isNaN(n) ? null : n }
    const de = num(f.valorDe), ate = num(f.valorAte)
    if (de != null && tx.amount < de) return false
    if (ate != null && tx.amount > ate) return false
  }
  return true
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

// Conjunto de ids de contas marcadas como "Aplicação Financeira".
export function aplicacaoAccountIds(accounts) {
  return new Set((accounts || []).filter(a => a.contaAplicacao).map(a => a.id))
}

// Lançamentos automáticos que nunca entram nos cálculos de relatório financeiro.
// O aporte investAuto (Receita na conta de investimento) movimenta o saldo da conta,
// mas é invisível em Demonstrativo, pizza, ranking e totais de receita/despesa.
export function isReportExcluded(tx) {
  return tx.origin === 'investAuto'
}

// Conta como receita nos relatórios (exclui lançamentos automáticos ocultos).
export function countsAsReportIncome(tx) {
  return tx.type === 'income' && !isReportExcluded(tx)
}

// Aporte = transferência para conta de aplicação financeira COM categoria preenchida.
// Estas devem aparecer nos relatórios tratadas como despesa/saída.
// Transferências para aplicação SEM categoria continuam invisíveis nos relatórios.
export function isAplicacaoAporte(tx, aplicSet) {
  return tx.type === 'transfer' && !!tx.categoryId && aplicSet.has(tx.toAccountId)
}

// Conta como despesa nos relatórios: despesas normais + aportes categorizados.
export function countsAsReportExpense(tx, aplicSet) {
  if (isReportExcluded(tx)) return false
  return tx.type === 'expense' || isAplicacaoAporte(tx, aplicSet)
}

// 0 = Conta Principal / Cartão, 1 = appPriority, 2 = rest
// Filtra contas marcadas como "Ocultar no Mobile" quando em viewport mobile.
// Use APENAS em listas/seletores/filtros de conta — nunca em cálculos de saldo,
// pois os dados/saldos da conta devem permanecer intactos.
export function accountsForView(accounts, isMobile) {
  if (!isMobile) return accounts
  return (accounts || []).filter(a => !a.hideOnMobile)
}

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
