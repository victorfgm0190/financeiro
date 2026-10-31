// Etapa A do Grupo G (Conta Principal → Ger.<apelido>) acompanha a conciliação do gasto de origem:
// a subconta gerencial é interna, não tem extrato — sem isto a etapa A ficaria pendente para sempre.
// Vale para a etapa A do motor (tx_gerA_<gasto>) e para a provisão do "Executar Gerenciais"
// (tx_ger_*, parentTxId = gasto). Grupos numerados e Grupo D não têm etapa A, então não mudam.

export const ETAPA_A_PREFIXO = 'tx_gerA_'

export const gastoDaEtapaA = (t) => {
  if (!t || t.type !== 'transfer') return null
  if (typeof t.id === 'string' && t.id.startsWith(ETAPA_A_PREFIXO)) return t.id.slice(ETAPA_A_PREFIXO.length)
  if (typeof t.id === 'string' && t.id.startsWith('tx_ger_') && t.parentTxId) return t.parentTxId
  return null
}

// Status com que a etapa A nasce: o do gasto de origem.
export const conciliacaoHerdada = (gasto) => !!gasto?.reconciled

// Ids a marcar quando o usuário (ou a importação) concilia/desconcilia `ids`: os próprios + as etapas A
// dos gastos de cartão entre eles. Só desce do gasto para a etapa A — mexer na etapa A não toca o gasto.
export function idsComEtapaA(transactions, ids) {
  const set = new Set((Array.isArray(ids) ? ids : [ids]).filter(Boolean))
  const gastos = new Set()
  for (const t of transactions || []) {
    if (set.has(t.id) && t.type === 'expense' && t.accountType === 'credit') gastos.add(t.id)
  }
  if (gastos.size === 0) return set
  for (const t of transactions) {
    const g = gastoDaEtapaA(t)
    if (g && gastos.has(g)) set.add(t.id)
  }
  return set
}
