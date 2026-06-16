// ─── Detecção/normalização de parcelas "N/Total" ────────────────────────────
// Fonte única reaproveitada pela importação de fatura (ImportPanel) e pela
// criação manual (TransactionForm). NÃO exige fronteira de palavra — funciona
// com descrições coladas como "LT01/03".

export function detectInstallment(description) {
  if (!description) return null
  const match = description.match(/(?<!\d)(\d{1,2})\/(\d{1,2})(?!\d)/)
  if (!match) return null
  const num = parseInt(match[1]), total = parseInt(match[2])
  if (num < 1 || total < 2 || num > total || total > 99) return null
  return {
    num, total,
    base: description.replace(match[0], '').trim().replace(/\s+/g, ' '),
    matchStr: match[0],
  }
}

// Base normalizada da série (para casar parcelas irmãs e compor a installment_key).
export function normalizeInstallmentBase(base) {
  return (base || '').toLowerCase().trim().replace(/\s+/g, ' ')
}
