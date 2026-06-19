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

// Conta como receita nos relatórios (exclui lançamentos automáticos ocultos). Também exclui
// as sombras de reserva de funções NÃO-despesa (ex.: o "Resgate Reserva: X" income), para
// que o par receita+despesa fique neutro quando a reserva é poupança. Args opcionais →
// sem eles, comportamento anterior (só income não-oculto).
export function countsAsReportIncome(tx, reservaDespesaFuncSet, reservaSet) {
  if (tx.type !== 'income' || isReportExcluded(tx)) return false
  if (isReservaMovimentoExcluido(tx, reservaDespesaFuncSet, reservaSet)) return false
  return true
}

// Aporte = transferência para conta de aplicação financeira COM categoria preenchida.
// Estas devem aparecer nos relatórios tratadas como despesa/saída.
// Transferências para aplicação SEM categoria continuam invisíveis nos relatórios.
export function isAplicacaoAporte(tx, aplicSet) {
  return tx.type === 'transfer' && !!tx.categoryId && aplicSet.has(tx.toAccountId)
}

// Depósito numa conta de reserva (transferência cuja conta-DESTINO é de reserva) vinculado
// a uma função marcada como "exibir como despesa" (exibirComoDespesa). Estas devem contar
// como despesa nos relatórios/dashboard. O resgate (saída da reserva, destino = principal)
// NÃO casa aqui mesmo tendo reservaFuncaoId — só o depósito (entrada) conta.
//   reservaDespesaFuncSet: Set de reservaFuncaoId cujas funções têm exibirComoDespesa=true
//   reservaSet: Set de ids de contas isReserva
export function isReservaDepositoDespesa(tx, reservaDespesaFuncSet, reservaSet) {
  if (tx.type !== 'transfer' || !tx.reservaFuncaoId) return false
  // Só conta como despesa se a função estiver EXPLICITAMENTE marcada (set presente e contém a
  // função) e o destino for conta de reserva. Sets ausentes → nunca inclui (seguro).
  const ehFuncaoDespesa = reservaDespesaFuncSet instanceof Set && reservaDespesaFuncSet.has(tx.reservaFuncaoId)
  const destinoEhReserva = reservaSet instanceof Set && reservaSet.has(tx.toAccountId)
  return ehFuncaoDespesa && destinoEhReserva
}

// Conjunto de reservaFuncaoId cujas funções estão marcadas como "exibir como despesa".
export function reservaDespesaFuncIds(reserveFunctions) {
  return new Set((reserveFunctions || []).filter(f => f.exibirComoDespesa).map(f => f.id))
}

// Movimento de reserva vinculado a uma função que NÃO está marcada como "exibir como despesa"
// (false/indefinido) → NUNCA conta como despesa, mesmo tendo categoria. Cobre:
//   (a) transferências envolvendo conta de reserva (origem OU destino); e
//   (b) lançamentos-sombra automáticos de reserva (reservaAuto, ex.: "Reserva: X" /
//       "Resgate Reserva: X"), que têm accountId null mas carregam reservaFuncaoId.
// O flag exibir_como_despesa tem PRIORIDADE sobre a categoria nesses lançamentos.
// NUNCA afeta despesas reais (type='expense' && !reservaAuto), como compras de cartão que
// carreguem reservaFuncaoId — estas continuam contando normalmente.
export function isReservaMovimentoExcluido(tx, reservaDespesaFuncSet, reservaSet) {
  if (!tx.reservaFuncaoId) return false
  const ehSombraReserva = tx.reservaAuto === true
  const ehTransferReserva = tx.type === 'transfer'
    && reservaSet instanceof Set
    && (reservaSet.has(tx.accountId) || reservaSet.has(tx.toAccountId))
  if (!ehSombraReserva && !ehTransferReserva) return false
  // Exclui quando a função NÃO está marcada como "exibir como despesa". Set ausente/inválido
  // ou vazio = nenhuma função é despesa → ehFuncaoDespesa=false → exclui (não deixa passar).
  const ehFuncaoDespesa = reservaDespesaFuncSet instanceof Set && reservaDespesaFuncSet.has(tx.reservaFuncaoId)
  return !ehFuncaoDespesa
}

// Sombra de RESGATE de reserva ("Resgate Reserva: X", id tx_rsg_). O resgate gera um par
// income(_r)+expense(_d): a perna de RECEITA (_r) representa a compensação (entra como receita);
// a perna de DESPESA (_d) NÃO deve contar como despesa — senão o resgate apareceria como gasto
// além da despesa real e do depósito. Distingue do DEPÓSITO ("Reserva: X", id tx_res_), que é
// despesa de provisionamento. Usa id (imutável) e descrição como sinais.
export function isResgateReservaSombra(tx) {
  if (tx.reservaAuto !== true) return false
  return (typeof tx.id === 'string' && tx.id.startsWith('tx_rsg_'))
    || (typeof tx.description === 'string' && tx.description.startsWith('Resgate Reserva:'))
}

// Conta como despesa nos relatórios: despesas normais + aportes categorizados + depósitos
// em reserva de funções marcadas como "exibir como despesa" (args opcionais; quando ausentes,
// mantém o comportamento anterior — só expense + aporte).
// PRIORIDADE: movimento de reserva de função NÃO-despesa é sempre excluído primeiro; a perna
// de despesa do RESGATE de reserva também nunca conta (o resgate é receita de compensação).
export function countsAsReportExpense(tx, aplicSet, reservaDespesaFuncSet, reservaSet) {
  if (isReportExcluded(tx)) return false
  if (isReservaMovimentoExcluido(tx, reservaDespesaFuncSet, reservaSet)) return false
  if (isResgateReservaSombra(tx)) return false
  return tx.type === 'expense'
    || isAplicacaoAporte(tx, aplicSet)
    || isReservaDepositoDespesa(tx, reservaDespesaFuncSet, reservaSet)
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

// Opções de conta para SearchableSelect, AGRUPADAS e ORDENADAS pela ordem dos Grupos de
// Contas (igual à tela de Contas). Retorna [{ id, label, group }], group = nome do grupo
// (ou null p/ sem grupo). Use com SearchableSelect preserveGroupOrder + ungroupedLast, já
// que a ordem é a configurada (não alfabética). Filtra inativas e (no mobile) ocultas.
export function buildAccountSelectOptions(accounts, accountGroups, { excludeId = null, isMobile = false, labelFn } = {}) {
  const pool = (accounts || []).filter(a =>
    a.active !== false && (!isMobile || !a.hideOnMobile) && (!excludeId || a.id !== excludeId))
  const label = labelFn || (a => a.name)
  const opts = []
  for (const { group, accounts: accs } of groupedAccountOptions(pool, accountGroups)) {
    for (const a of accs) opts.push({ id: a.id, label: label(a), group: group ? group.name : null })
  }
  return opts
}

// ── Cartão de crédito: fatura e status de pagamento ──────────────────────────
// Convenção da fatura (igual a getBillKey do CreditCard/TransactionsPanel): dia do
// lançamento <= closingDay → fatura do mês corrente; senão, fatura do mês seguinte.
export function creditBillKey(date, card) {
  if (!date || !card) return ''
  const closingDay = card.closingDay || 1
  const d = new Date(date + 'T00:00:00')
  const day = d.getDate()
  let month0, year
  if (day <= closingDay) { month0 = d.getMonth(); year = d.getFullYear() }
  else { const n = new Date(d.getFullYear(), d.getMonth() + 1, 1); month0 = n.getMonth(); year = n.getFullYear() }
  return `${year}-${String(month0 + 1).padStart(2, '0')}`
}

function billKeyOfTx(tx, card) {
  return tx.faturaMonthYear || creditBillKey(tx.date, card)
}

// Classificação de pagamento de uma fatura — fonte única da lógica usada no KPI
// "Valor Pago" do Cartão de Crédito. Paleta (azul/laranja) é resolvida na UI.
export function classifyFatura(billTotal, totalPago) {
  const isFaturaPaga = billTotal > 0 && totalPago >= billTotal - 0.005
  const isFaturaParcial = totalPago > 0 && !isFaturaPaga
  const saldoRestante = Math.max(0, Math.round((billTotal - totalPago) * 100) / 100)
  return { isFaturaPaga, isFaturaParcial, saldoRestante }
}

// Status completo da fatura `billKey` de um cartão. Reproduz o cálculo do
// CreditCardPanel: total = despesas − estornos; pago = credit_payment do cartão na
// fatura + agendamentos 'pagamento_fatura' já registrados.
export function creditBillStatus(card, transactions, schedules, billKey) {
  if (!card || !billKey) return { billKey: '', billTotal: 0, totalPago: 0, isFaturaPaga: false, isFaturaParcial: false, saldoRestante: 0 }
  let despesas = 0, estornos = 0, pago = 0
  for (const tx of (transactions || [])) {
    if (tx.accountId !== card.id) continue
    if (tx.type === 'credit_payment') {
      if ((tx.faturaMonthYear && tx.faturaMonthYear === billKey) || (tx.date || '').slice(0, 7) === billKey) {
        pago += Number(tx.amount) || 0
      }
      continue
    }
    if (billKeyOfTx(tx, card) !== billKey) continue
    if (tx.type === 'expense') despesas += tx.amount
    else if (tx.type === 'income') estornos += Number(tx.amount) || 0
  }
  for (const s of (schedules || [])) {
    if (s.tipo === 'pagamento_fatura' && s.cardId === card.id && s.faturaMesAno === billKey) {
      pago += (s.registered?.length || 0) * (Number(s.amount) || 0)
    }
  }
  const billTotal = despesas - estornos
  const totalPago = Math.round(pago * 100) / 100
  return { billKey, billTotal, totalPago, ...classifyFatura(billTotal, totalPago) }
}
