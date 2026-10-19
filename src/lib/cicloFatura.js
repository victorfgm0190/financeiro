// Posição de uma fatura em relação ao ciclo financeiro ATUAL — espelha o motor
// (reconcileFaturaState): o vencimento (ano-mês da fatura + dueDay do cartão) cai antes, dentro
// ou depois da janela [cicloStart, cicloEnd] de financialMonthMode/financialMonthStartDay.
// Fatura do ciclo atual ganha a etapa A pelo motor; fatura FUTURA fica para o "Executar
// Gerenciais" (ato explícito do usuário); passada não recebe nada retroativo.

function janelaDoCiclo(financialMonthStartDay, financialMonthMode, ref = new Date()) {
  const startDay = financialMonthStartDay || 1
  if ((financialMonthMode || 'custom') === 'calendar') {
    return { cicloStart: new Date(ref.getFullYear(), ref.getMonth(), 1), cicloEnd: new Date(ref.getFullYear(), ref.getMonth() + 1, 0) }
  }
  if (ref.getDate() >= startDay) {
    return { cicloStart: new Date(ref.getFullYear(), ref.getMonth(), startDay), cicloEnd: new Date(ref.getFullYear(), ref.getMonth() + 1, startDay - 1) }
  }
  return { cicloStart: new Date(ref.getFullYear(), ref.getMonth() - 1, startDay), cicloEnd: new Date(ref.getFullYear(), ref.getMonth(), startDay - 1) }
}

// 'passada' | 'atual' | 'futura' (null sem fatura).
export function posicaoDaFatura(faturaMonthYear, dueDay, financialMonthStartDay, financialMonthMode, ref = new Date()) {
  if (!faturaMonthYear) return null
  const { cicloStart, cicloEnd } = janelaDoCiclo(financialMonthStartDay, financialMonthMode, ref)
  const [fy, fm] = faturaMonthYear.split('-')
  const venc = new Date(`${fy}-${fm}-${String(dueDay || 10).padStart(2, '0')}T00:00:00`)
  return venc < cicloStart ? 'passada' : venc > cicloEnd ? 'futura' : 'atual'
}

// Provisão `p` ({ faturaMonthYear, cardId }) na fatura do ciclo atual (pré-seleção do Executar Gerenciais).
export function faturaNoCicloAtual(p, accounts, financialMonthStartDay, financialMonthMode, ref = new Date()) {
  const card = (accounts || []).find(a => a.id === p.cardId)
  return posicaoDaFatura(p.faturaMonthYear, card?.dueDay, financialMonthStartDay, financialMonthMode, ref) === 'atual'
}
