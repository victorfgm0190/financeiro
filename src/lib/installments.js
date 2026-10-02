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

// Parcela escrita por extenso na descrição: "Parc7", "Parc 07", "PARC 3/10", "Parcela 2 de 5". O
// Itaú manda alguns parcelados assim, com a coluna Parcelamento vazia — sem isto a linha entrava
// como à vista. O total é opcional ("Yelumseg Parc7" não traz): quem chama infere da série gravada.
const PARC_TOKEN_RE = /\bParc(?:ela)?\.?\s*0*(\d{1,2})(?:\s*(?:de|\/)\s*0*(\d{1,2}))?\b/i

export function detectParcelaToken(description) {
  const s = description || ''
  const m = s.match(PARC_TOKEN_RE)
  if (!m) return null
  const num = parseInt(m[1], 10)
  const total = m[2] ? parseInt(m[2], 10) : null
  if (num < 1) return null
  if (total != null && (total < 2 || num > total)) return null
  return {
    num, total,
    base: (s.slice(0, m.index) + s.slice(m.index + m[0].length)).trim().replace(/\s+/g, ' '),
    matchStr: m[0],
  }
}

// Detector completo da importação: "N/Total" primeiro (formato já gravado em todo o banco, base
// idêntica à da installment_key), depois a forma por extenso. total pode vir null.
export function detectParcela(description) {
  return detectInstallment(description) || detectParcelaToken(description)
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
//   account_id | base_normalizada | num/total | valor_em_centavos | serie_inicio[#ocorrência]
// serie_inicio = fatura_month_year − (num − 1) meses (fallback: YYYY-MM da date).
// Diferencia séries paralelas de mesmo preço/total que começam em meses distintos.
// Retorna null quando num/total não estão preenchidos (não entra no índice parcial).
//
// `installmentOccurrence` distingue GÊMEAS LEGÍTIMAS: a mesma fatura pode trazer duas cobranças
// idênticas em tudo — a de 08/2026 tem duas "Payservice 5/5" de R$ 59,60 no mesmo dia. Sem isto
// as duas produzem a MESMA chave, e o índice uq_lancamentos_installment (mais o dedup de
// reconcileInstallmentKeys) deixa só uma entrar: a segunda vira UPDATE da primeira e some.
// A 1ª ocorrência não leva sufixo — as chaves já gravadas seguem byte a byte iguais, sem
// backfill nem churn no índice único. Só a 2ª em diante ganha "#2", "#3"…
export function installmentKey({ accountId, description, installmentNum, installmentTotal, amount, faturaMonthYear, date, installmentOccurrence }) {
  if (installmentNum == null || installmentTotal == null) return null
  const det = detectInstallment(description || '')
  const base = normalizeInstallmentBase(det ? det.base : (description || ''))
  const cents = Math.round((Number(amount) || 0) * 100)
  const ym = faturaMonthYear || ymFromAny(date)
  const serieInicio = ym ? addMonthsYM(ym, -((Number(installmentNum) || 1) - 1)) : 'sem-fatura'
  const occ = Number(installmentOccurrence) || 1
  const sufixo = occ > 1 ? `#${occ}` : ''
  return `${accountId}|${base}|${installmentNum}/${installmentTotal}|${cents}|${serieInicio}${sufixo}`
}
