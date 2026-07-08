// ─── Parsing de exportações do Dindin (Conta Corrente e Cartão) ──────────────
// Fonte única usada tanto pela importação avulsa (ImportPanel) quanto pela
// importação histórica com staging (DindinImportPanel).

import * as XLSX from 'xlsx'

export function parseFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        resolve(XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }))
      } catch (err) { reject(err) }
    }
    reader.readAsArrayBuffer(file)
  })
}

// Serial de data do Excel (dias desde 1899-12-30) → 'YYYY-MM-DD'. O Itaú passou a exportar
// as datas da fatura como número serial (ex.: 46195 = 2026-06-15) em vez de texto. Constrói
// a data na meia-noite UTC exata, então toISOString não desloca o dia. Retorna '' fora de um
// intervalo de anos plausível (2000–2100), para não confundir números avulsos com datas.
export function excelSerialToISO(serial) {
  if (typeof serial !== 'number' || !isFinite(serial) || serial <= 0) return ''
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000))
  if (isNaN(d.getTime())) return ''
  const y = d.getUTCFullYear()
  if (y < 2000 || y > 2100) return ''
  return d.toISOString().split('T')[0]
}

export function normalizeDate(val) {
  if (!val) return ''
  if (val instanceof Date) return val.toISOString().split('T')[0]
  // Serial numérico do Excel (novo formato de exportação do Itaú).
  if (typeof val === 'number') return excelSerialToISO(val)
  const s = String(val)
  const m1 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (m1) return `${m1[3]}-${m1[2]}-${m1[1]}`
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m2) return s.slice(0, 10)
  // Fallback: serial do Excel vindo como texto ("46195").
  const t = s.trim()
  if (/^\d{4,6}$/.test(t)) return excelSerialToISO(Number(t))
  return s
}

export function normalizeAmount(val) {
  if (!val && val !== 0) return 0
  if (typeof val === 'number') return Math.abs(val)
  const s = String(val).replace(/[R$\s]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.')
  return Math.abs(parseFloat(s) || 0)
}

export function fuzzyMatchAccount(name, accounts) {
  if (!name) return null
  const lower = name.toLowerCase().trim()
  return accounts.find(a =>
    a.name.toLowerCase().includes(lower) || lower.includes(a.name.toLowerCase()) ||
    (a.apelido && (a.apelido.toLowerCase().includes(lower) || lower.includes(a.apelido.toLowerCase())))
  ) || null
}

// ─── Conta Corrente (Dindin) ───────────────────────────────────────────────────

const CC_IGNORE = ['itau per', 'itau az', 'denubak gi', 'denubak v', 'desazul itau', 'abb', 'anu gi', 'anu vi']
const CC_SKIP_EXACT = ['data', 'número', 'numero', 'movimentação e projeção', 'movimentacao e projecao']
const CC_SKIP_CONTAINS = ['dindin finanças pessoais', 'dindin financas pessoais']

function shouldIgnoreCC(mov) {
  if (!mov) return true
  const lower = mov.toLowerCase().trim()
  if (!lower) return true
  if (CC_SKIP_EXACT.some(k => lower === k)) return true
  if (CC_SKIP_CONTAINS.some(k => lower.includes(k))) return true
  if (CC_IGNORE.some(k => lower.includes(k))) return true
  return false
}

export function parseDindinCC(allRows) {
  let dateCol = 0, movCol = 2, pagCol = 3, depCol = 4

  for (let i = 0; i < Math.min(allRows.length, 8); i++) {
    const r = allRows[i].map(c => String(c || '').toLowerCase().trim())
    if (r.includes('data')) {
      dateCol = r.indexOf('data')
      const mI = r.findIndex(c => c.includes('movimenta'))
      if (mI !== -1) movCol = mI
      const pI = r.findIndex(c => c.includes('pagamento'))
      if (pI !== -1) pagCol = pI
      const dI = r.findIndex(c => c.includes('dep') && !c.includes('pagamento'))
      if (dI !== -1) depCol = dI
      break
    }
  }

  const parsed = []
  const accountNamesSet = new Set()

  allRows.forEach((row, idx) => {
    const mov = String(row[movCol] || '').trim()
    if (shouldIgnoreCC(mov)) return

    const date = normalizeDate(row[dateCol])
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return

    const pagamento = normalizeAmount(row[pagCol])
    const deposito = normalizeAmount(row[depCol])
    if (pagamento === 0 && deposito === 0) return

    const movLower = mov.toLowerCase()
    let type
    let fromAccount = '', toAccount = ''

    if (movLower.startsWith('depósito em:') || movLower.startsWith('deposito em:')) {
      type = 'income'
      toAccount = mov.replace(/^dep[oó]sito em:\s*/i, '').trim()
      accountNamesSet.add(toAccount)
    } else if (movLower.startsWith('pagamento em:')) {
      type = 'expense'
      fromAccount = mov.replace(/^pagamento em:\s*/i, '').trim()
      accountNamesSet.add(fromAccount)
    } else if (movLower.startsWith('de:') && movLower.includes('para:')) {
      type = 'transfer'
      fromAccount = mov.match(/^de:\s*(.+?)\s*para:/i)?.[1]?.trim() || ''
      toAccount = mov.match(/para:\s*(.+)$/i)?.[1]?.trim() || ''
      if (fromAccount) accountNamesSet.add(fromAccount)
      if (toAccount) accountNamesSet.add(toAccount)
    } else {
      type = pagamento > 0 ? 'expense' : 'income'
      fromAccount = ''
    }

    const amount = type === 'income' ? deposito : pagamento || deposito

    parsed.push({
      _id: idx,
      date, description: mov, amount, type,
      fromAccount, toAccount, selected: true, _isDuplicate: false,
    })
  })

  return { rows: parsed, accountNames: [...accountNamesSet] }
}

// ─── Cartão de Crédito (Dindin) ────────────────────────────────────────────────

const CART_IGNORE_DESC = ['pagamento', 'pgto fatura']

export function parseDindinCartao(allRows) {
  let cardName = '', faturaStr = ''
  let dataCol = -1, descCol = -1, movCol = -1, pagCol = -1, depCol = -1
  let inData = false
  const parsed = []

  allRows.forEach((row, rowIdx) => {
    const cells = row.map(c => String(c || '').trim())
    const lower = cells.map(c => c.toLowerCase())

    if (!inData) {
      cells.forEach(c => {
        const cl = c.toLowerCase()
        if (cl.includes('cartão de crédito:') || cl.includes('cartao de credito:')) {
          cardName = c.split(':').slice(1).join(':').trim()
        }
        if (cl.match(/^fatura:\s*/)) {
          faturaStr = c.replace(/^fatura:\s*/i, '').trim()
        }
      })
    }

    // Detect column header row
    if (lower.includes('data') && (lower.some(c => c.includes('descri')))) {
      dataCol = lower.indexOf('data')
      descCol = lower.findIndex(c => c.includes('descri'))
      movCol = lower.findIndex(c => c === 'movimentação' || c === 'movimentacao' || (c.includes('movim') && c !== lower[descCol]))
      pagCol = lower.findIndex(c => c.includes('pagamento'))
      depCol = lower.findIndex(c => (c.includes('dep') || c.includes('crédito') || c.includes('credito')) && !c.includes('pagamento') && lower.indexOf(c) !== pagCol)
      inData = true
      return
    }

    if (!inData || dataCol === -1) return

    const date = normalizeDate(row[dataCol])
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return

    const desc = cells[descCol] || ''
    const mov = movCol !== -1 ? (cells[movCol] || '') : ''
    const pagamento = normalizeAmount(row[pagCol])
    const deposito = depCol !== -1 ? normalizeAmount(row[depCol]) : 0

    // Skip payment rows
    if (CART_IGNORE_DESC.some(t => desc.toLowerCase().includes(t))) return
    // Skip Imp_ prefix (gerencial transfers already accounted)
    if (/^imp_/i.test(desc)) return

    const amount = pagamento > 0 ? pagamento : deposito
    if (!amount || amount <= 0) return

    parsed.push({
      _id: rowIdx,
      date, description: desc, movimentacao: mov, amount,
      isDeposit: deposito > 0 && pagamento === 0,
      type: 'expense', selected: true, _isDuplicate: false,
      categoryId: '', payee: '', grupoGerencial: '',
    })
  })

  return { cardName, faturaStr, rows: parsed }
}
