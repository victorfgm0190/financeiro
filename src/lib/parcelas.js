// Helpers de parcelamento compartilhados entre a importação de fatura (ImportPanel)
// e o "Editar Lançamento" (TransactionForm). Fonte única — antes viviam duplicados
// dentro do ImportPanel.
import { detectInstallment, normalizeInstallmentBase } from './installments.js'

// serie_id: elo único de todas as parcelas de uma mesma compra. Gerado UMA vez na parcela
// base/origem e propagado às filhas — nunca alterado depois. À vista → null.
export function newSerieId() {
  const rand = Math.random().toString(36).slice(2, 10).padEnd(8, '0')
  return `serie_${Date.now()}_${rand}`
}

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

// Data de SISTEMA (date) de uma parcela conforme a regra do Finup:
//   parcela 1/N ou à vista (num <= 1) → mantém a data informada (fallback);
//   parcela N/Total com N > 1         → dia `financialStartDay` do mês ANTERIOR à fatura
//                                       da parcela (a provisão é feita no ciclo financeiro
//                                       anterior ao ciclo da fatura). Ex.: fatura 2026-07 +
//                                       financialStartDay 15 → 2026-06-15.
// date_cartao (a data bruta do extrato) NUNCA é alterada por esta função.
export function installmentSystemDate(faturaYYYYMM, num, fallbackDate, financialStartDay) {
  if (!num || num <= 1 || !faturaYYYYMM) return fallbackDate
  return `${addMonthToFatura(faturaYYYYMM, -1)}-${String(financialStartDay || 1).padStart(2, '0')}`
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

// Prefixo PERMISSIVO para AGRUPAR parcelas irmãs já marcadas — remove o ÚLTIMO bloco
// "<dígitos>/<dígitos>" da descrição (tudo antes dele). Diferente do detectInstallment:
// não tem lookbehind nem valida se é parcela; serve só para casar irmãs de uma série já
// reconhecida (inclui formatos que o detector ignora, ex.: "BR1*PRIVALIA 7216001/03").
export function installmentPrefix(description) {
  const s = description || ''
  const re = /\d+\/\d+/g
  let last = null, m
  while ((m = re.exec(s)) !== null) last = m
  return normalizeInstallmentBase(last ? s.slice(0, last.index) : s)
}

// Gera a descrição de uma parcela k a partir de uma irmã âncora.
//  - formato reconhecido pelo detector → substitui "N/total" preservando a largura;
//  - formato permissivo (código de loja) → incrementa o bloco numérico antes da barra
//    em (k − anchorNum), preservando a largura, e mantém o total.
export function buildSiblingDescription(anchorDesc, anchorNum, k, total) {
  const det = detectInstallment(anchorDesc || '')
  if (det) {
    const numWidth = det.matchStr.split('/')[0].length
    return anchorDesc.replace(det.matchStr, `${String(k).padStart(numWidth, '0')}/${total}`)
  }
  const m = (anchorDesc || '').match(/(\d+)\/(\d+)(\s*)$/)
  if (!m) return anchorDesc || ''
  const code = m[1]
  const newCode = String(Number(code) + (k - anchorNum)).padStart(code.length, '0')
  return anchorDesc.slice(0, m.index) + newCode + '/' + m[2] + m[3]
}

// Monta a visão de uma série a partir de um lançamento âncora (a parcela sendo editada).
// NÃO depende do detectInstallment para achar as irmãs: usa installment_num/installment_total
// JÁ gravados (detecção automática OU marcação manual) + prefixo permissivo. Assim o card
// "Parcela N de M" e o botão aparecem também para formatos que o detector ignora.
//
// Retorna null se o lançamento ainda não estiver marcado como parcela. Caso contrário:
//   { base, total, siblings, missing }
//   - siblings: parcelas existentes da série (mesma conta + total + prefixo), com _num
//   - missing : parcelas de 1..total AUSENTES, com campos herdados da irmã mais próxima
// serie_inicio (YYYY-MM) de uma parcela: fatura − (num − 1) meses (fallback: YYYY-MM da date).
// Mesma definição usada na installmentKey — distingue séries PARALELAS (mesma loja/total)
// que começam em meses diferentes, ex.: visitas distintas à mesma clínica.
function serieInicioOf(t) {
  const num = Number(t.installmentNum) || 1
  const ym = t.faturaMonthYear || (typeof t.date === 'string' && t.date.length >= 7 ? t.date.slice(0, 7) : null)
  if (!ym) return 'sem-fatura'
  return addMonthToFatura(ym, -(num - 1))
}

export function buildSeries(tx, transactions, account, financialStartDay = 1) {
  const total = Number(tx.installmentTotal) || null
  const myNum = Number(tx.installmentNum) || null
  if (!total || !myNum) return null
  const accountId = tx.accountId
  const prefix = installmentPrefix(tx.description)
  const serieInicio = serieInicioOf(tx)

  const siblings = transactions
    .filter(t =>
      t.accountId === accountId &&
      t.installmentNum != null &&
      (Number(t.installmentTotal) || null) === total &&
      installmentPrefix(t.description) === prefix &&
      serieInicioOf(t) === serieInicio)
    .map(t => ({ ...t, _num: Number(t.installmentNum) }))
  // Garante a própria parcela na lista (o array pode estar desatualizado em alguns fluxos).
  if (!siblings.some(s => s.id === tx.id)) siblings.push({ ...tx, _num: myNum })
  siblings.sort((a, b) => a._num - b._num)

  const presentNums = new Set(siblings.map(s => s._num))
  const dueDay = account?.dueDay || null
  const closingDay = account?.closingDay || 14

  const missing = []
  for (let k = 1; k <= total; k++) {
    if (presentNums.has(k)) continue
    const anchor = [...siblings].sort((a, b) => Math.abs(a._num - k) - Math.abs(b._num - k))[0]
    if (!anchor) continue
    const futFatura = addMonthToFatura(anchor.faturaMonthYear, k - anchor._num)
    // Parcela 1 (se ausente) mantém a data efetiva da fatura; parcelas 2..N vão para o dia
    // financialStartDay do mês ANTERIOR à fatura da parcela (regra do Finup).
    const fallbackDate = clampDateToFatura(faturaToDate(futFatura, dueDay) || `${futFatura}-01`, futFatura, closingDay)
    const futDate = installmentSystemDate(futFatura, k, fallbackDate, financialStartDay)
    const description = buildSiblingDescription(anchor.description, anchor._num, k, total)
    // Guarda: se a descrição gerada já existe na conta, não oferece (cobre parcela
    // existente porém não-marcada no formato permissivo).
    if (transactions.some(t => t.accountId === accountId && t.description === description)) continue
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
  return { base: prefix, total, siblings, missing }
}
