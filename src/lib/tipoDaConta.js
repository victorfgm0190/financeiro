// Tipo da conta gravado no lançamento (lancamentos.account_type). O motor gerencial e a fatura do
// cartão só reconhecem gasto de cartão com accountType === 'credit' — lançamento gravado sem o tipo
// (caso real: registro de agendamento de cartão, 30/10/2026) fica fora da etapa A, da devolução e
// do resgate. A verdade é o tipo da CONTA: todo caminho que cria ou move lançamento passa por aqui.

// O lançamento com o accountType da conta dele (inalterado se a conta não existe ou já bate).
export function comTipoDaConta(tx, accounts = []) {
  if (!tx?.accountId) return tx
  const tipo = (accounts || []).find(a => a.id === tx.accountId)?.type
  return tipo && tx.accountType !== tipo ? { ...tx, accountType: tipo } : tx
}

// Lançamentos de CARTÃO gravados sem o tipo da conta (ou com outro): o que a seção "sem tipo de
// conta" do Verificar e corrigir mostra. `cardId` opcional restringe a um cartão.
export function lancamentosSemTipoDeConta(transactions = [], accounts = [], cardId = null) {
  const cartoes = new Set((accounts || []).filter(a => a.type === 'credit' && (!cardId || a.id === cardId)).map(a => a.id))
  return (transactions || []).filter(t => cartoes.has(t.accountId) && (t.type === 'expense' || t.type === 'income') && t.accountType !== 'credit')
}
