// Fonte ÚNICA do saldo de uma conta a partir dos lançamentos.
//
// Convenção (a mesma desde sempre, agora em um lugar só):
//   balance          = initialBalance + lançamentos com date <= hoje
//   projectedBalance = initialBalance + TODOS os lançamentos (inclui os de data futura)
//
// Esta fórmula estava copiada em cinco lugares (recalcularSaldo, restoreBalanceSnapshot,
// handleRecalcAll, calcAjusteGrupo e getAccountSaldos.txDeltaWhere). Cópias divergentes já
// causaram bug de saldo — ver o "saldo anterior" do Fluxo de Caixa (96938b4), que estornava
// lançamentos futuros justamente por discordar da regra `date <= hoje` daqui.

const rb = v => Math.round(v * 100) / 100

// Data local YYYY-MM-DD. NÃO use toISOString(): ela converte para UTC e, à noite no
// fuso do Brasil, devolveria o dia seguinte — jogando lançamentos de amanhã dentro do balance.
export function hojeStr(ref = new Date()) {
  return `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, '0')}-${String(ref.getDate()).padStart(2, '0')}`
}

// Tipos cujo `balance` NÃO deriva de lançamentos e por isso nunca são recalculados:
//   credit    → a dívida vive em creditDebt/creditMonthBill, não no balance.
//   asset     → bem imobilizado; o valor é gravado por /api/bem/*.
//   liability → financiamento; o saldo devedor é gravado por /api/financiamento/*.
// Recalcular qualquer um deles zeraria o valor vindo desses endpoints.
export const TIPOS_SEM_RECALCULO = ['credit', 'asset', 'liability']

export const contaRecalculavel = (a) => !!a && !TIPOS_SEM_RECALCULO.includes(a.type)

// Efeito de UM lançamento no balance de UMA conta (0 quando não a toca).
// Espelha exatamente applyBalanceEffect do AppContext, do lado do balance:
//   • despesa em cartão (accountType 'credit') não debita conta nenhuma — vai para creditDebt;
//   • credit_payment debita a conta PAGADORA (fromAccountId); a ponta do cartão abate a dívida;
//   • transferência debita a origem e credita o destino.
export function efeitoNaConta(tx, accountId) {
  const amt = Number(tx.amount) || 0
  if (tx.type === 'income') return tx.accountId === accountId ? amt : 0
  if (tx.type === 'expense') {
    return tx.accountId === accountId && tx.accountType !== 'credit' ? -amt : 0
  }
  if (tx.type === 'transfer') {
    // `else if` de propósito (e não os dois lados somados): numa transferência da conta para
    // ela mesma só o débito valia, e manter o encadeamento preserva esse comportamento.
    if (tx.accountId === accountId) return -amt
    if (tx.toAccountId === accountId) return amt
    return 0
  }
  if (tx.type === 'credit_payment') return tx.fromAccountId === accountId ? -amt : 0
  return 0
}

// Saldos de UMA conta. `transactions` é a lista completa — a função filtra sozinha.
export function saldosDaConta(accountId, initialBalance, transactions, hoje = hojeStr()) {
  const base = rb(initialBalance ?? 0)
  let balance = base
  let projected = base
  for (const tx of (transactions || [])) {
    const delta = efeitoNaConta(tx, accountId)
    if (delta === 0) continue
    projected = rb(projected + delta)
    if (tx.date <= hoje) balance = rb(balance + delta)
  }
  return { balance, projected }
}

// Recálculo em MASSA: uma única passada sobre `transactions` para todas as contas elegíveis
// (percorrer a lista inteira por conta seria O(contas × lançamentos)). Devolve a nova lista de
// contas e quantas realmente mudaram — quem chama pode não commitar nada quando `alteradas` é 0,
// evitando marcar a tabela como suja e disparar um sync inútil.
export function recalcularSaldosDeContas(accounts, transactions, hoje = hojeStr()) {
  const alvo = new Map()
  for (const a of (accounts || [])) {
    if (!contaRecalculavel(a)) continue
    const base = rb(a.initialBalance ?? 0)
    alvo.set(a.id, { balance: base, projected: base })
  }
  if (alvo.size === 0) return { accounts, alteradas: 0 }

  // Contas tocadas por um lançamento, nas duas pontas possíveis. O Set desduplica a
  // transferência de uma conta para ela mesma — aplicar efeitoNaConta duas vezes no mesmo id
  // debitaria em dobro, divergindo de saldosDaConta (que passa uma vez por conta).
  const pontas = (tx) => tx.type === 'credit_payment'
    ? [tx.fromAccountId]
    : tx.type === 'transfer' ? [...new Set([tx.accountId, tx.toAccountId])] : [tx.accountId]

  for (const tx of (transactions || [])) {
    const passado = tx.date <= hoje
    for (const id of pontas(tx)) {
      const acc = id && alvo.get(id)
      if (!acc) continue
      const delta = efeitoNaConta(tx, id)
      if (delta === 0) continue
      acc.projected = rb(acc.projected + delta)
      if (passado) acc.balance = rb(acc.balance + delta)
    }
  }

  let alteradas = 0
  const out = (accounts || []).map(a => {
    const novo = alvo.get(a.id)
    if (!novo) return a
    // projectedBalance null é "nunca calculado", não zero: mesmo que o valor novo dê 0, a conta
    // precisa ser gravada para o campo deixar de ser null.
    const inalterada = a.projectedBalance != null
      && rb(a.balance || 0) === novo.balance
      && rb(a.projectedBalance) === novo.projected
    if (inalterada) return a
    alteradas++
    return { ...a, balance: novo.balance, projectedBalance: novo.projected }
  })
  return { accounts: alteradas > 0 ? out : accounts, alteradas }
}
