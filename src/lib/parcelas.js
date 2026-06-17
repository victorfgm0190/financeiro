// Helpers de parcelamento compartilhados entre a importação de fatura (ImportPanel)
// e o "Editar Lançamento" (TransactionForm). Fonte única — antes viviam duplicados
// dentro do ImportPanel.
import { detectInstallment, normalizeInstallmentBase } from './installments.js'

// Avança n meses em um string YYYY-MM (aceita n negativo — ex.: mês anterior).
export function addMonthToFatura(yyyymm, n) {
  if (!yyyymm) return ''
  const [y, m] = yyyymm.split('-').map(Number)
  const idx = y * 12 + (m - 1) + n
  const ty = Math.floor(idx / 12)
  const tm = ((idx % 12) + 12) % 12
  return `${ty}-${String(tm + 1).padStart(2, '0')}`
}

// Retorna a data de vencimento (YYYY-MM-DD) do cartão no mês da fatura.
export function faturaToDate(faturaYYYYMM, dueDay) {
  if (!faturaYYYYMM || !dueDay) return null
  const [y, m] = faturaYYYYMM.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return `${faturaYYYYMM}-${String(Math.min(dueDay, lastDay)).padStart(2, '0')}`
}

// "Clampa" a data de sistema ao período válido da fatura (YYYY-MM):
//   de (closingDay+1) do mês anterior até closingDay do mês da fatura.
// Se cair fora, retorna o dia de fechamento do mês da fatura.
export function clampDateToFatura(dateStr, faturaYYYYMM, closingDay) {
  if (!dateStr || !faturaYYYYMM || !closingDay) return dateStr
  const [y, m] = faturaYYYYMM.split('-').map(Number)
  if (!y || !m) return dateStr
  const lastDayFatura = new Date(y, m, 0).getDate()
  const endDay = Math.min(closingDay, lastDayFatura)
  const end = new Date(y, m - 1, endDay)            // closingDay do mês da fatura
  const start = new Date(y, m - 2, closingDay + 1)  // (closingDay+1) do mês anterior
  const d = new Date(dateStr + 'T00:00:00')
  if (d < start || d > end) return `${faturaYYYYMM}-${String(endDay).padStart(2, '0')}`
  return dateStr
}

// Detecta duplicata de parcelado: mesma base + mesmo número de parcela + valor ±R$0,50.
// Não compara fatura — se a parcela já existe no cartão, é duplicata independente do mês.
export function isDuplicateInstallment(row, existing, accountId) {
  const rowInst = detectInstallment(row.description)
  if (!rowInst) return false
  const rowBase = rowInst.base.toLowerCase().trim()
  return existing.some(t => {
    if (t.accountId !== accountId) return false
    if (Math.abs(t.amount - row.amount) > 0.50) return false
    const tInst = detectInstallment(t.description || '')
    if (!tInst || tInst.num !== rowInst.num) return false
    return tInst.base.toLowerCase().trim() === rowBase
  })
}

// Encontra no banco a transação de uma parcela específica (mesma base + número + conta,
// valor ±R$0,50). Usado para saber se uma parcela futura já existe.
export function findExistingParcela(inst, num, amount, accountId, existing) {
  const base = inst.base.toLowerCase().trim()
  return existing.find(t => {
    if (t.accountId !== accountId) return false
    if (Math.abs(t.amount - amount) > 0.50) return false
    const tInst = detectInstallment(t.description || '')
    if (!tInst || tInst.num !== num) return false
    return tInst.base.toLowerCase().trim() === base
  }) || null
}

// Monta a visão de uma série de parcelas a partir de um lançamento âncora (a parcela
// sendo editada). Reusa a MESMA lógica de futureParcelas/findExistingParcela do
// ImportPanel, mas escopada a UMA série (mesma conta + base normalizada + total).
//
// Retorna null se o lançamento não for parcela reconhecível. Caso contrário:
//   { inst, base, total, siblings, missing }
//   - siblings: parcelas existentes da série, com _num, ordenadas por número
//   - missing : parcelas de 1..total AUSENTES, já com os campos herdados da irmã mais
//               próxima (categoria/grupo/payee/reserva) e data/fatura calculadas.
//               Não inclui parcelas que já existem no banco (findExistingParcela).
export function buildSeries(tx, transactions, account) {
  const inst = detectInstallment(tx.description || '')
  const total = Number(tx.installmentTotal) || (inst ? inst.total : null)
  if (!inst || !total) return null
  const base = normalizeInstallmentBase(inst.base)
  const accountId = tx.accountId

  const siblings = transactions
    .map(t => {
      const ti = detectInstallment(t.description || '')
      return ti ? { t, ti } : null
    })
    .filter(x => x
      && x.t.accountId === accountId
      && (Number(x.t.installmentTotal) || x.ti.total) === total
      && normalizeInstallmentBase(x.ti.base) === base)
    .map(x => ({ ...x.t, _num: x.ti.num }))
    .sort((a, b) => a._num - b._num)

  const presentNums = new Set(siblings.map(s => s._num))
  const dueDay = account?.dueDay || null
  const closingDay = account?.closingDay || 14

  const missing = []
  for (let k = 1; k <= total; k++) {
    if (presentNums.has(k)) continue
    // Âncora = irmã existente de número mais próximo de k.
    const anchor = [...siblings].sort((a, b) => Math.abs(a._num - k) - Math.abs(b._num - k))[0]
    if (!anchor) continue
    const anchorInst = detectInstallment(anchor.description)
    const numWidth = anchorInst.matchStr.split('/')[0].length
    const futFatura = addMonthToFatura(anchor.faturaMonthYear, k - anchor._num)
    const futDate = clampDateToFatura(faturaToDate(futFatura, dueDay) || `${futFatura}-01`, futFatura, closingDay)
    const numStr = String(k).padStart(numWidth, '0')
    const description = anchor.description.replace(anchorInst.matchStr, `${numStr}/${total}`)
    const existing = findExistingParcela(inst, k, anchor.amount, accountId, transactions)
    if (existing) continue
    missing.push({
      num: k,
      total,
      description,
      amount: anchor.amount,
      faturaMonthYear: futFatura,
      date: futDate,
      categoryId: anchor.categoryId || '',
      grupoGerencial: anchor.grupoGerencial || null,
      payee: anchor.payee || '',
      reservaFuncaoId: anchor.reservaFuncaoId || null,
    })
  }
  return { inst, base, total, siblings, missing }
}
