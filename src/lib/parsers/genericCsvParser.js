// ITEM 8 — Importador genérico de CSV (Nubank, Bradesco, C6, qualquer banco).
// Lê o CSV sem opinião sobre colunas; o usuário mapeia data/valor/descrição no
// CsvColumnMapperModal. `mapGenericRows` converte para o MESMO formato de linha que os
// parsers Itaú/Dindin produzem, então o resto do fluxo de importação segue inalterado.
import { normalizeDate, normalizeAmount } from '../dindinParse'

// Remove um BOM inicial (sem literal na regex — evita o aviso de whitespace irregular).
function stripBom(text) {
  let s = text || ''
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1)
  return s
}

// Lê qualquer CSV. Detecta o separador (';' ou ',') pela 1ª linha e devolve
// { separator, headers, rows } — rows = array de objetos chaveados pelo header.
export function parseGenericCsv(text) {
  const clean = stripBom(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = clean.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) return { separator: ',', headers: [], rows: [] }
  const first = lines[0]
  const separator = (first.split(';').length > first.split(',').length) ? ';' : ','
  const splitLine = (l) => l.split(separator).map(c => c.trim().replace(/^"|"$/g, ''))
  const headers = splitLine(lines[0]).map((h, i) => h || `Coluna ${i + 1}`)
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i])
    if (cols.every(c => !c)) continue
    const obj = {}
    headers.forEach((h, idx) => { obj[h] = cols[idx] ?? '' })
    rows.push(obj)
  }
  return { separator, headers, rows }
}

// Palpite inicial do mapeamento pelo nome das colunas (ajuda o usuário).
export function guessMapping(headers) {
  const find = (needles) => headers.find(h => needles.some(n => h.toLowerCase().includes(n))) || ''
  return {
    dateCol: find(['data', 'date']),
    amountCol: find(['valor', 'value', 'amount', 'montante', 'quantia']),
    descCol: find(['descri', 'lanç', 'lanc', 'histor', 'estabelec', 'title', 'memo', 'favorec']),
    negativeIsExpense: true,
  }
}

// Converte as linhas genéricas (objetos por header) para o formato de linha da importação,
// usando { dateCol, amountCol, descCol, negativeIsExpense }. Mesmo shape do parseItauCSV.
export function mapGenericRows(rawRows, mapping, categories = []) {
  const { dateCol, amountCol, descCol, negativeIsExpense = true } = mapping || {}
  const estornoCategoryId = categories.find(c => (c.name || '').toLowerCase().includes('estorno'))?.id || ''
  const out = []
  let idCtr = 0
  for (const r of (rawRows || [])) {
    const date = normalizeDate(r[dateCol])
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const description = String(r[descCol] || '').trim()
    if (!description) continue
    const rawVal = String(r[amountCol] ?? '')
    const amount = normalizeAmount(rawVal) // valor absoluto
    if (!amount || amount <= 0) continue
    const negative = /^\s*[-(]/.test(rawVal) || /-\s*$/.test(rawVal)
    const isExpense = negativeIsExpense ? negative : !negative
    out.push({
      _id: idCtr++,
      date, description, movimentacao: '', amount,
      isDeposit: !isExpense, type: isExpense ? 'expense' : 'income',
      selected: true, _isDuplicate: false,
      categoryId: isExpense ? '' : estornoCategoryId, payee: '', grupoGerencial: '',
    })
  }
  return out
}

// ── Persistência do mapeamento por assinatura de headers (localStorage) ──────────
const MAP_STORE = 'finup_csv_mappings'
const sigOf = (headers) => (headers || []).map(h => (h || '').toLowerCase()).join('|')

export function loadCsvMapping(headers) {
  try {
    const all = JSON.parse(localStorage.getItem(MAP_STORE) || '{}')
    return all[sigOf(headers)] || null
  } catch { return null }
}

export function saveCsvMapping(headers, mapping) {
  try {
    const all = JSON.parse(localStorage.getItem(MAP_STORE) || '{}')
    all[sigOf(headers)] = mapping
    localStorage.setItem(MAP_STORE, JSON.stringify(all))
  } catch { /* ignore */ }
}
