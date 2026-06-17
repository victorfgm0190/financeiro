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

// Avança n meses num 'YYYY-MM' (aceita n negativo).
function addMonthsYM(ym, n) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, (m - 1) + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
// Extrai 'YYYY-MM' de uma data (string 'YYYY-MM-DD' ou Date).
function ymFromAny(date) {
  if (!date) return null
  if (date instanceof Date) return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
  if (typeof date === 'string' && date.length >= 7) return date.slice(0, 7)
  return null
}

// installment_key — chave única de uma parcela. FONTE ÚNICA da fórmula, reusada pelo
// backfill (scripts/backfill-installments.mjs) e por txToRow (inserções novas):
//   account_id | base_normalizada | num/total | valor_em_centavos | serie_inicio
// serie_inicio = fatura_month_year − (num − 1) meses (fallback: YYYY-MM da date).
// Diferencia séries paralelas de mesmo preço/total que começam em meses distintos.
// Retorna null quando num/total não estão preenchidos (não entra no índice parcial).
export function installmentKey({ accountId, description, installmentNum, installmentTotal, amount, faturaMonthYear, date }) {
  if (installmentNum == null || installmentTotal == null) return null
  const det = detectInstallment(description || '')
  const base = normalizeInstallmentBase(det ? det.base : (description || ''))
  const cents = Math.round((Number(amount) || 0) * 100)
  const ym = faturaMonthYear || ymFromAny(date)
  const serieInicio = ym ? addMonthsYM(ym, -((Number(installmentNum) || 1) - 1)) : 'sem-fatura'
  return `${accountId}|${base}|${installmentNum}/${installmentTotal}|${cents}|${serieInicio}`
}
