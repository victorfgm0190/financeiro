import { useState, useRef, useMemo, useEffect } from 'react'
import {
  Upload, FileText, Check, AlertCircle, Wand2, Save,
  Link, X, Layers, ArrowRight, ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, RotateCcw,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'
import { loadAccountMappings } from '../../lib/db'
import ScheduleMatchModal from '../shared/ScheduleMatchModal'
import CategorySelect from '../shared/CategorySelect'
import AccountOptions from '../shared/AccountOptions'
import ConfirmDialog from '../shared/ConfirmDialog'

// ─── Shared helpers ────────────────────────────────────────────────────────────

function parseFile(file) {
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

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsText(file, 'UTF-8')
  })
}

// Detecta se o texto é CSV do Itaú (linha de cabeçalho "data,lançamento,valor")
function isItauCSV(text) {
  const clean = text.replace(/^﻿/, '')
  return /^data[,;]lan[çc]amento[,;]valor/im.test(clean)
}

function parseItauCSV(text) {
  const clean = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = clean.split('\n').map(l => l.trim()).filter(Boolean)

  // Localizar linha de cabeçalho
  const headerIdx = lines.findIndex(l => /^data[,;]lan[çc]amento[,;]valor/i.test(l))
  if (headerIdx === -1) return { rows: [], cardName: '', faturaStr: '' }

  const sep = lines[headerIdx].includes(';') ? ';' : ','
  const parsed = []
  let idCtr = 0

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = lines[i].split(sep).map(c => c.trim().replace(/^"|"$/g, ''))
    if (cols.length < 3) continue

    const date = normalizeDate(cols[0])
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue

    const desc = cols[1] || ''
    if (!desc) continue

    const rawVal = parseFloat(cols[2].replace(',', '.'))
    if (isNaN(rawVal)) continue

    // Valor negativo = pagamento/estorno → ignorar
    if (rawVal <= 0) continue

    parsed.push({
      _id: idCtr++,
      date, description: desc, movimentacao: '', amount: rawVal,
      isDeposit: false, type: 'expense', selected: true, _isDuplicate: false,
      categoryId: '', payee: '', grupoGerencial: '',
    })
  }

  return { rows: parsed, cardName: '', faturaStr: '' }
}

function normalizeDate(val) {
  if (!val) return ''
  if (val instanceof Date) return val.toISOString().split('T')[0]
  const s = String(val)
  const m1 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (m1) return `${m1[3]}-${m1[2]}-${m1[1]}`
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m2) return s.slice(0, 10)
  return s
}

function normalizeAmount(val) {
  if (!val && val !== 0) return 0
  if (typeof val === 'number') return Math.abs(val)
  const s = String(val).replace(/[R$\s]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.')
  return Math.abs(parseFloat(s) || 0)
}

function isDuplicate(row, existing) {
  return existing.some(t =>
    t.date === row.date &&
    Math.abs(t.amount - row.amount) < 0.01 &&
    (t.description || '').trim().toLowerCase() === (row.description || '').trim().toLowerCase() &&
    (t.accountId === row.accountId || t.toAccountId === row.accountId ||
     (row.toAccountId && (t.accountId === row.toAccountId || t.toAccountId === row.toAccountId)))
  )
}

function fuzzyMatchAccount(name, accounts) {
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

function parseDindinCC(allRows) {
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
    let type = 'expense'
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

function DropZone({ onFile, label, subtitle, accept = '.xlsx,.xls', disabled = false }) {
  const ref = useRef()
  return (
    <div
      className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
        disabled
          ? 'border-gray-800 opacity-40 cursor-not-allowed select-none'
          : 'border-gray-700 cursor-pointer hover:border-[#0F6E56]'
      }`}
      onClick={() => !disabled && ref.current?.click()}
    >
      <Upload size={28} className="text-gray-600 mx-auto mb-2" />
      <p className="text-sm text-gray-400">{label || 'Clique para selecionar arquivo XLS/XLSX'}</p>
      <p className="text-xs text-gray-600 mt-1">{subtitle || 'Formato Dindin exportação'}</p>
      <input ref={ref} type="file" accept={accept} disabled={disabled} className="hidden"
        onChange={e => { if (e.target.files[0]) onFile(e.target.files[0]) }} />
    </div>
  )
}

function generateMonthOptions() {
  const opts = []
  const now = new Date()
  for (let i = 24; i >= -3; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    opts.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) })
  }
  return opts
}

const MONTH_OPTIONS = generateMonthOptions()

function SummaryBar({ found, toImport, duplicates, ignored = 0 }) {
  return (
    <div className="flex items-center gap-4 flex-wrap text-xs">
      <span className="text-gray-400">{found} encontrado{found !== 1 ? 's' : ''}</span>
      <span className="text-gray-600">·</span>
      <span className="text-blue-600 font-medium">{toImport} serão importados</span>
      <span className="text-gray-600">·</span>
      <span className="text-orange-600">{duplicates} já existem</span>
      {ignored > 0 && <><span className="text-gray-600">·</span><span className="text-gray-500">{ignored} ignorados</span></>}
    </div>
  )
}

const TYPE_ICON = {
  income: { icon: ArrowDownCircle, color: 'text-blue-600', label: 'Receita' },
  expense: { icon: ArrowUpCircle, color: 'text-orange-600', label: 'Despesa' },
  transfer: { icon: ArrowLeftRight, color: 'text-blue-400', label: 'Transferência' },
}

// ─── ABA 1: CONTA CORRENTE ────────────────────────────────────────────────────

function ContaCorrenteTab({ accounts, accountGroups, transactions }) {
  const [parsedRows, setParsedRows] = useState([])
  const [accountNames, setAccountNames] = useState([])
  const [accountMapping, setAccountMapping] = useState({})
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [dbMappings, setDbMappings] = useState([])
  const { addTransaction, gerencialGroups } = useApp()

  const defaultGrupoD = gerencialGroups.find(g => g.number === 'D')?.id || 'grp_D'

  useEffect(() => {
    loadAccountMappings().then(maps => setDbMappings(maps))
  }, [])

  // Índice nome_dindin (lower) → mapping para lookup O(1)
  const dbMapIndex = useMemo(() => {
    const idx = {}
    for (const m of dbMappings) {
      if (m.nome_dindin) idx[m.nome_dindin.toLowerCase().trim()] = m
    }
    return idx
  }, [dbMappings])

  const resolvedRows = useMemo(() => {
    return parsedRows.map(row => {
      const fromMap = row.fromAccount ? dbMapIndex[row.fromAccount.toLowerCase().trim()] : null
      const toMap   = row.toAccount   ? dbMapIndex[row.toAccount.toLowerCase().trim()]   : null

      // nao_criar: conta principal marcada para ignorar
      const primaryMap = row.type === 'income' ? toMap : fromMap
      if (primaryMap?.nao_criar) {
        return { ...row, accountId: null, toAccountId: null, _isIgnored: true, _ignoreReason: 'mapeamento', selected: false }
      }

      // ignorar_transferencias: pular transferências envolvendo esta conta
      if (row.type === 'transfer' && (fromMap?.ignorar_transferencias || toMap?.ignorar_transferencias)) {
        return { ...row, accountId: null, toAccountId: null, _isIgnored: true, _ignoreReason: 'transferencia', selected: false }
      }

      const toAccountId = row.type === 'transfer' ? (accountMapping[row.toAccount] || null) : null
      const fromAccountId = row.type === 'transfer' ? (accountMapping[row.fromAccount] || null) : null
      const resolvedAccountId = row.type === 'income' ? (accountMapping[row.toAccount] || null)
        : row.type === 'transfer' ? fromAccountId
        : (accountMapping[row.fromAccount] || null)

      const rowWithAccount = { ...row, accountId: resolvedAccountId, toAccountId }
      const dup = resolvedAccountId ? isDuplicate(rowWithAccount, transactions) : false
      return { ...rowWithAccount, _isDuplicate: dup, _isIgnored: false, selected: row.selected && !dup }
    })
  }, [parsedRows, accountMapping, transactions, dbMapIndex])

  const handleFile = async (file) => {
    setError('')
    setResult(null)
    try {
      const rows = await parseFile(file)
      const { rows: parsed, accountNames: names } = parseDindinCC(rows)
      if (parsed.length === 0) { setError('Nenhum lançamento encontrado no arquivo.'); return }

      // Auto-map: DB mapping tem prioridade, depois fuzzy match
      const autoMap = {}
      names.forEach(name => {
        const dbMap = dbMapIndex[name.toLowerCase().trim()]
        if (dbMap && dbMap.nome_finup && !dbMap.nao_criar) {
          const finupAcc =
            accounts.find(a => a.name.toLowerCase().trim() === dbMap.nome_finup.toLowerCase().trim()) ||
            fuzzyMatchAccount(dbMap.nome_finup, accounts)
          if (finupAcc) autoMap[name] = finupAcc.id
        } else if (!dbMap?.nao_criar) {
          const match = fuzzyMatchAccount(name, accounts)
          if (match) autoMap[name] = match.id
        }
      })

      setParsedRows(parsed)
      setAccountNames(names)
      setAccountMapping(autoMap)
    } catch (err) {
      setError('Erro ao ler arquivo: ' + err.message)
    }
  }

  const toggleRow = (id) => {
    setParsedRows(r => r.map(row => row._id === id ? { ...row, selected: !row.selected } : row))
  }

  const toggleAll = (checked) => {
    setParsedRows(r => r.map(row => ({ ...row, selected: (row._isDuplicate || row._isIgnored) ? false : checked })))
  }

  const handleImport = () => {
    const toImport = resolvedRows.filter(r => r.selected && !r._isDuplicate && !r._isIgnored)
    toImport.forEach(row => {
      const acc = accounts.find(a => a.id === row.accountId)
      addTransaction({
        type: row.type,
        accountId: row.accountId,
        toAccountId: row.toAccountId || null,
        accountType: acc?.type || null,
        amount: row.amount,
        date: row.date,
        description: row.description,
        grupoGerencial: defaultGrupoD,
      })
    })
    setResult(toImport.length)
    setParsedRows([])
    setAccountNames([])
    setAccountMapping({})
  }

  const found = resolvedRows.length
  const dups = resolvedRows.filter(r => r._isDuplicate).length
  const ignored = resolvedRows.filter(r => r._isIgnored).length
  const toImportCount = resolvedRows.filter(r => r.selected && !r._isDuplicate && !r._isIgnored).length

  if (result !== null) {
    return (
      <div className="card flex items-center gap-3 text-emerald-400">
        <Check size={20} />
        <span className="font-medium">{result} lançamento{result !== 1 ? 's' : ''} importado{result !== 1 ? 's' : ''} com sucesso.</span>
        <button className="ml-auto text-xs text-gray-500 hover:text-gray-300" onClick={() => setResult(null)}>Importar outro arquivo</button>
      </div>
    )
  }

  if (parsedRows.length === 0) {
    return (
      <div className="space-y-4">
        <DropZone onFile={handleFile} label="Selecionar arquivo de Conta Corrente (XLS/XLSX)" />
        {error && <div className="flex items-center gap-2 text-orange-600 text-sm"><AlertCircle size={14} /> {error}</div>}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Account mapping */}
      {accountNames.length > 0 && (
        <div className="card">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Mapeamento de Contas</h3>
          <div className="space-y-2">
            {accountNames.map(name => (
              <div key={name} className="flex items-center gap-3 flex-wrap">
                <span className="text-xs text-gray-300 min-w-32">{name}</span>
                <ArrowRight size={12} className="text-gray-600 shrink-0" />
                <select
                  className="input flex-1 text-xs py-1 min-w-40"
                  value={accountMapping[name] || ''}
                  onChange={e => setAccountMapping(m => ({ ...m, [name]: e.target.value }))}
                >
                  <AccountOptions accounts={accounts} accountGroups={accountGroups} placeholder="— Selecione a conta —" />
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary + action */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <SummaryBar found={found} toImport={toImportCount} duplicates={dups} ignored={ignored} />
        <div className="flex gap-2">
          <button className="btn-secondary text-xs py-1.5" onClick={() => { setParsedRows([]); setAccountNames([]) }}>
            <X size={12} className="mr-1 inline" /> Cancelar
          </button>
          <button
            className="btn-primary flex items-center gap-1.5 text-xs py-1.5"
            disabled={toImportCount === 0}
            onClick={handleImport}
          >
            <Save size={12} /> Confirmar Importação ({toImportCount})
          </button>
        </div>
      </div>

      {/* Preview table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="px-3 py-2.5 w-8">
                  <input type="checkbox" className="accent-[#0F6E56]"
                    checked={resolvedRows.filter(r => !r._isDuplicate).every(r => r.selected)}
                    onChange={e => toggleAll(e.target.checked)} />
                </th>
                <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium whitespace-nowrap">Data</th>
                <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium">Descrição</th>
                <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium">Tipo</th>
                <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium">Conta</th>
                <th className="text-right px-3 py-2.5 text-xs text-gray-400 font-medium">Valor</th>
                <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {resolvedRows.map(row => {
                const tConf = TYPE_ICON[row.type] || TYPE_ICON.expense
                const TIcon = tConf.icon
                const acc = accounts.find(a => a.id === row.accountId)
                return (
                  <tr key={row._id} className={`border-b border-gray-800/50 transition-colors ${!row.selected ? 'opacity-40' : ''} ${row._isDuplicate ? 'bg-orange-500/5' : ''}`}>
                    <td className="px-3 py-2">
                      <input type="checkbox" className="accent-[#0F6E56]"
                        checked={row.selected}
                        disabled={row._isDuplicate}
                        onChange={() => toggleRow(row._id)} />
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-400 whitespace-nowrap">{row.date?.split('-').reverse().join('/')}</td>
                    <td className="px-3 py-2 text-xs text-gray-200 max-w-xs truncate">{row.description}</td>
                    <td className="px-3 py-2">
                      <span className={`flex items-center gap-1 text-xs ${tConf.color}`}>
                        <TIcon size={11} /> {tConf.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {acc
                        ? <span className="text-gray-300">{acc.apelido || acc.name}</span>
                        : <span className="text-orange-600">Sem conta</span>
                      }
                      {row.type === 'transfer' && row.toAccountId && (
                        <span className="text-gray-600 ml-1">→ {accounts.find(a => a.id === row.toAccountId)?.name}</span>
                      )}
                    </td>
                    <td className={`px-3 py-2 text-right text-xs font-semibold whitespace-nowrap ${row.type === 'income' ? 'text-blue-600' : 'text-orange-600'}`}>
                      {fmt(row.amount)}
                    </td>
                    <td className="px-3 py-2">
                      {row._isDuplicate
                        ? <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-500">Duplicado</span>
                        : row._isIgnored
                          ? <span className="text-xs px-1.5 py-0.5 rounded bg-gray-500/20 text-gray-500">Ignorado</span>
                          : <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">Novo</span>
                      }
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Cartão de Crédito (Dindin) ────────────────────────────────────────────────

const CART_IGNORE_DESC = ['pagamento', 'pgto fatura']

function parseDindinCartao(allRows) {
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

function detectInstallment(description) {
  const match = description.match(/(?<!\d)(\d{1,2})\/(\d{1,2})(?!\d)/)
  if (!match) return null
  const num = parseInt(match[1]), total = parseInt(match[2])
  if (num < 1 || total < 2 || num > total || total > 99) return null
  return { num, total, base: description.replace(match[0], '').trim().replace(/\s+/g, ' '), matchStr: match[0] }
}

function addMonthSafe(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const raw = m - 1 + n
  const ty = y + Math.floor(raw / 12), tm = raw % 12
  const td = Math.min(d, new Date(ty, tm + 1, 0).getDate())
  return `${ty}-${String(tm + 1).padStart(2, '0')}-${String(td).padStart(2, '0')}`
}

// Ajusta data para o mês/ano da fatura, mantendo o dia original.
// Datas que já estão no mês informado são preservadas.
function applyFaturaDate(dateStr, faturaYYYYMM) {
  if (!faturaYYYYMM || !dateStr) return dateStr
  if (dateStr.startsWith(faturaYYYYMM)) return dateStr
  const day = parseInt(dateStr.slice(8, 10), 10)
  const [fy, fm] = faturaYYYYMM.split('-').map(Number)
  const maxDay = new Date(fy, fm, 0).getDate()
  return `${faturaYYYYMM}-${String(Math.min(day, maxDay)).padStart(2, '0')}`
}

function CartaoCreditoTab({ accounts, accountGroups, transactions }) {
  const {
    categories, classificationRules, gerencialGroups, processarLancamentoGerencial,
    addTransaction, addRule, classifyByRules, learnClassification, gerarContasPagarFatura,
    findMatchingSchedule, addRecurringMatchException, markScheduleRegistered, getNextOccurrences,
    cardImports, addCardImport, revertCardImport,
  } = useApp()

  const [faturaMonthYear, setFaturaMonthYear] = useState('')
  const [filename, setFilename] = useState('')
  const [rows, setRows] = useState([])
  const [cardInfo, setCardInfo] = useState({ cardName: '', faturaStr: '' })
  const [selectedAccount, setSelectedAccount] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [matchQueue, setMatchQueue] = useState([])
  const [scheduleMatchQueue, setScheduleMatchQueue] = useState([])
  const [confirmRevertId, setConfirmRevertId] = useState(null)

  const defaultGrupoD = gerencialGroups.find(g => g.number === 'D')?.id || 'grp_D'
  const creditAccounts = accounts.filter(a => a.type === 'credit')
  const selectedAcc = accounts.find(a => a.id === selectedAccount)

  const sortedGrupos = useMemo(() => [...gerencialGroups].sort((a, b) => {
    if (a.number === 'D') return 1
    if (b.number === 'D') return -1
    return typeof a.number === 'number' && typeof b.number === 'number' ? a.number - b.number : 0
  }), [gerencialGroups])

  const handleFile = async (file) => {
    if (!faturaMonthYear) { setError('Selecione o mês de referência da fatura antes de importar.'); return }
    setError('')
    setResult(null)
    setMatchQueue([])
    setFilename(file.name)
    try {
      const isCsv = /\.csv$/i.test(file.name)
      let cardName = '', faturaStr = '', parsed = []

      if (isCsv) {
        const text = await readFileAsText(file)
        if (!isItauCSV(text)) { setError('CSV não reconhecido. Verifique se é o formato de exportação do Itaú (colunas: data, lançamento, valor).'); return }
        ;({ rows: parsed, cardName, faturaStr } = parseItauCSV(text))
      } else {
        const rawRows = await parseFile(file)
        ;({ cardName, faturaStr, rows: parsed } = parseDindinCartao(rawRows))
      }

      if (parsed.length === 0) { setError('Nenhum lançamento encontrado. Verifique o formato do arquivo.'); return }

      // Ajustar datas para o mês/ano da fatura (exceto as que já estão no mês)
      if (faturaMonthYear) {
        parsed = parsed.map(row => ({ ...row, date: applyFaturaDate(row.date, faturaMonthYear) }))
      }

      // Auto-match card
      if (cardName) {
        const match = fuzzyMatchAccount(cardName, creditAccounts)
        if (match) setSelectedAccount(match.id)
      }

      // Auto-classify from rules + Movimentação → category
      const grupoD = gerencialGroups.find(g => g.number === 'D')?.id || 'grp_D'
      const processed = []
      const pendingMatches = []
      let idCtr = 0

      parsed.forEach(row => {
        const classified = classifyByRules(row.description)
        const movCat = categories.find(c => c.name.toLowerCase() === row.movimentacao.toLowerCase())
        const categoryId = classified?.categoryId || movCat?.id || ''
        const payee = classified?.payee || ''
        const installInfo = detectInstallment(row.description)
        const baseRow = {
          ...row, _id: idCtr++, categoryId, payee,
          grupoGerencial: grupoD, _installment: installInfo, _generated: false,
        }
        processed.push(baseRow)
        if (installInfo?.num === 1 && installInfo.total > 1) {
          for (let i = 2; i <= installInfo.total; i++) {
            processed.push({
              ...baseRow, _id: idCtr++ * 100 + i,
              date: addMonthSafe(baseRow.date, i - 1),
              description: baseRow.description.replace(installInfo.matchStr, `${i}/${installInfo.total}`),
              _generated: true, _seriesId: baseRow._id, _installmentNum: i,
            })
          }
        } else if (installInfo && installInfo.num > 1) {
          const key = installInfo.base.toLowerCase().slice(0, 14)
          const match = transactions.find(t =>
            Math.abs(t.amount - baseRow.amount) < 0.5 &&
            (t.description || '').toLowerCase().includes(key)
          )
          if (match) pendingMatches.push({ row: baseRow, existingTx: match, installInfo })
        }
      })

      setRows(processed.sort((a, b) => a.date.localeCompare(b.date)))
      setCardInfo({ cardName, faturaStr })
      setMatchQueue(pendingMatches)
    } catch (err) {
      setError('Erro ao ler arquivo: ' + err.message)
    }
  }

  const resolvedRows = useMemo(() => {
    if (!selectedAccount) return rows.map(r => ({ ...r, _isDuplicate: false }))
    return rows.map(row => {
      const r = { ...row, accountId: selectedAccount }
      const dup = isDuplicate(r, transactions)
      return { ...r, _isDuplicate: dup, selected: row.selected && !dup }
    })
  }, [rows, selectedAccount, transactions])

  const updateRow = (id, changes) => setRows(prev => prev.map(r => r._id === id ? { ...r, ...changes } : r))
  const toggleRow = (id) => setRows(prev => prev.map(r => r._id === id ? { ...r, selected: !r.selected } : r))
  const toggleAll = (v) => setRows(prev => prev.map(r => ({ ...r, selected: r._isDuplicate ? false : v })))

  const autoClassify = () => setRows(prev => prev.map(row => {
    if (row.categoryId) return row
    const c = classifyByRules(row.description)
    return c ? { ...row, ...c } : row
  }))

  const handleImport = () => {
    const toImport = resolvedRows.filter(r => r.selected && !r._isDuplicate)
    const txIds = []
    toImport.forEach(row => {
      const txId = addTransaction({
        type: 'expense', accountId: selectedAccount, accountType: 'credit',
        amount: row.amount, date: row.date, description: row.description,
        categoryId: row.categoryId, payee: row.payee,
        grupoGerencial: row.grupoGerencial || defaultGrupoD,
      })
      txIds.push(txId)
      if (row.categoryId) learnClassification(row.description, row.categoryId, row.payee)
      if (row.grupoGerencial) processarLancamentoGerencial({ accountId: selectedAccount, amount: row.amount, date: row.date }, row.grupoGerencial)
    })

    if (toImport.length > 0) {
      const dates = toImport.map(r => r.date).sort()
      const mesAno = faturaMonthYear || dates[0]?.slice(0, 7)
      if (mesAno) gerarContasPagarFatura(selectedAccount, dates[0], dates[dates.length - 1], mesAno)
      addCardImport({
        id: 'imp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        importedAt: new Date().toISOString(),
        count: toImport.length,
        mesAno: mesAno || '',
        filename,
        accountId: selectedAccount,
        txIds,
      })
    }

    const pending = []
    toImport.forEach(row => {
      const s = findMatchingSchedule({ type: 'expense', accountType: 'credit', amount: row.amount, payee: row.payee, description: row.description, date: row.date })
      if (s) pending.push({ schedule: s, tx: { type: 'expense', accountType: 'credit', amount: row.amount, payee: row.payee, description: row.description, date: row.date } })
    })

    if (pending.length > 0) { setScheduleMatchQueue(pending); setResult(toImport.length); setRows([]); return }
    setResult(toImport.length)
    setRows([])
  }

  const resolveMatch = (linked, catId, payee) => {
    if (linked) {
      const rowId = matchQueue[0].row._id
      setRows(prev => prev.map(r => r._id === rowId ? { ...r, categoryId: catId || r.categoryId, payee: payee || r.payee } : r))
    }
    setMatchQueue(q => q.slice(1))
  }

  const resolveScheduleMatch = (action) => {
    const cur = scheduleMatchQueue[0]
    if (action === 'register') markScheduleRegistered(cur.schedule.id, getNextOccurrences(cur.schedule, 1)[0] || cur.tx.date)
    else if (action === 'never') addRecurringMatchException(cur.tx.payee || cur.tx.description)
    setScheduleMatchQueue(q => q.slice(1))
  }

  const found = resolvedRows.length
  const dups = resolvedRows.filter(r => r._isDuplicate).length
  const toImportCount = resolvedRows.filter(r => r.selected && !r._isDuplicate).length

  return (
    <div className="space-y-4">
      {matchQueue.length > 0 && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-lg p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-100">Parcela correspondente encontrada</h3>
            <p className="text-xs text-gray-400">Parcela {matchQueue[0].installInfo.num}/{matchQueue[0].installInfo.total} de "{matchQueue[0].installInfo.base}"</p>
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => resolveMatch(false)}>Ignorar</button>
              <button className="btn-primary flex-1" onClick={() => resolveMatch(true, matchQueue[0].existingTx.categoryId, matchQueue[0].existingTx.payee)}>
                <Link size={13} className="mr-1.5 inline" /> Vincular
              </button>
            </div>
          </div>
        </div>
      )}

      {scheduleMatchQueue.length > 0 && (
        <ScheduleMatchModal
          schedule={scheduleMatchQueue[0].schedule}
          tx={scheduleMatchQueue[0].tx}
          categories={categories}
          remaining={scheduleMatchQueue.length}
          onRegister={() => resolveScheduleMatch('register')}
          onKeep={() => resolveScheduleMatch('keep')}
          onNeverAsk={() => resolveScheduleMatch('never')}
        />
      )}

      {result !== null && scheduleMatchQueue.length === 0 && (
        <div className="card flex items-center gap-3 text-emerald-400">
          <Check size={20} />
          <span className="font-medium">{result} lançamento{result !== 1 ? 's' : ''} importado{result !== 1 ? 's' : ''} com sucesso.</span>
          <button className="ml-auto text-xs text-gray-500 hover:text-gray-300" onClick={() => setResult(null)}>Importar outro</button>
        </div>
      )}

      {rows.length === 0 && result === null && (
        <div className="space-y-4">
          <div className="card">
            <label className="label mb-1.5 block">
              Mês de referência da fatura <span className="text-orange-500">*</span>
            </label>
            <select
              className="input w-64"
              value={faturaMonthYear}
              onChange={e => { setFaturaMonthYear(e.target.value); setError('') }}
              required
            >
              <option value="">Selecione o mês da fatura...</option>
              {MONTH_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {faturaMonthYear && (
              <p className="text-xs text-gray-500 mt-1.5">
                Datas fora de {faturaMonthYear.split('-').reverse().join('/')} terão mês/ano ajustado, mantendo o dia.
              </p>
            )}
          </div>
          <DropZone
            onFile={handleFile}
            label="Selecionar arquivo de Cartão de Crédito (XLS/XLSX/CSV)"
            subtitle="Formato Dindin (XLS) ou Itaú (CSV)"
            accept=".xlsx,.xls,.csv"
            disabled={!faturaMonthYear}
          />
          {!faturaMonthYear && !error && (
            <p className="text-xs text-gray-500 text-center -mt-2">
              Selecione o mês de referência para habilitar o upload.
            </p>
          )}
          {error && <div className="flex items-center gap-2 text-orange-600 text-sm"><AlertCircle size={14} /> {error}</div>}
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="card">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Cartão de Destino</label>
                <select className="input" value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)}>
                  <AccountOptions accounts={creditAccounts} accountGroups={accountGroups} placeholder="Selecione o cartão..." />
                </select>
              </div>
              <div className="flex items-end gap-4 pb-1">
                {cardInfo.cardName && <div><p className="label">Cartão detectado</p><p className="text-sm text-gray-200">{cardInfo.cardName}</p></div>}
                {cardInfo.faturaStr && <div><p className="label">Fatura</p><p className="text-sm text-gray-200">{cardInfo.faturaStr}</p></div>}
                {faturaMonthYear && (
                  <div>
                    <p className="label">Mês da Fatura</p>
                    <p className="text-sm text-gray-200">{faturaMonthYear.split('-').reverse().join('/')}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-3">
            <SummaryBar found={found} toImport={toImportCount} duplicates={dups} />
            <div className="flex gap-2">
              <button className="btn-secondary flex items-center gap-1.5 text-xs py-1.5" onClick={autoClassify}>
                <Wand2 size={12} /> Classificar Auto
              </button>
              <button className="btn-secondary text-xs py-1.5" onClick={() => setRows([])}>
                <X size={12} className="mr-1 inline" /> Cancelar
              </button>
              <button
                className="btn-primary flex items-center gap-1.5 text-xs py-1.5"
                disabled={toImportCount === 0 || !selectedAccount}
                onClick={handleImport}
              >
                <Save size={12} /> Confirmar ({toImportCount})
              </button>
            </div>
          </div>

          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="px-3 py-2.5 w-8">
                      <input type="checkbox" className="accent-[#0F6E56]"
                        checked={resolvedRows.filter(r => !r._isDuplicate).every(r => r.selected)}
                        onChange={e => toggleAll(e.target.checked)} />
                    </th>
                    <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium">Data</th>
                    <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium">Descrição</th>
                    <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium">Categoria</th>
                    <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium hidden md:table-cell">Ger.</th>
                    <th className="text-right px-3 py-2.5 text-xs text-gray-400 font-medium">Valor</th>
                    <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {resolvedRows.map(row => (
                    <tr key={row._id} className={`border-b border-gray-800/50 ${!row.selected ? 'opacity-40' : ''} ${row._generated ? 'bg-indigo-950/20' : ''} ${row._isDuplicate ? 'bg-orange-500/5' : ''}`}>
                      <td className="px-3 py-2">
                        <input type="checkbox" className="accent-[#0F6E56]"
                          checked={row.selected} disabled={row._isDuplicate}
                          onChange={() => toggleRow(row._id)} />
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-400 whitespace-nowrap">{row.date?.split('-').reverse().join('/')}</td>
                      <td className="px-3 py-2 text-gray-200 max-w-xs">
                        <div className="flex items-center gap-1.5">
                          <input className="bg-transparent text-xs focus:outline-none focus:bg-gray-800 rounded px-1 min-w-0 flex-1"
                            value={row.description}
                            onChange={e => updateRow(row._id, { description: e.target.value })} />
                          {row._installment && (
                            <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded ${row._generated ? 'bg-indigo-500/20 text-indigo-400' : 'bg-gray-700 text-gray-400'}`}>
                              {row._generated ? `${row._installmentNum}/${row._installment.total}` : `${row._installment.num}/${row._installment.total}`}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <CategorySelect
                          categories={categories}
                          className="bg-gray-800 border border-gray-700 text-gray-200 rounded px-2 py-1 text-xs focus:outline-none w-36"
                          value={row.categoryId}
                          onChange={e => { updateRow(row._id, { categoryId: e.target.value }); if (e.target.value) learnClassification(row.description, e.target.value, row.payee) }}
                          searchable
                        />
                      </td>
                      <td className="px-3 py-2 hidden md:table-cell">
                        <select
                          className="bg-gray-800 border border-gray-700 text-gray-200 rounded px-2 py-1 text-xs focus:outline-none w-24"
                          value={row.grupoGerencial}
                          onChange={e => updateRow(row._id, { grupoGerencial: e.target.value })}
                        >
                          {sortedGrupos.map(g => <option key={g.id} value={g.id}>{g.number} · {g.name}</option>)}
                        </select>
                      </td>
                      <td className={`px-3 py-2 text-right text-xs font-semibold whitespace-nowrap ${row.isDeposit ? 'text-blue-600' : 'text-orange-600'}`}>
                        {fmt(row.amount)}
                      </td>
                      <td className="px-3 py-2">
                        {row._isDuplicate
                          ? <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-500">Duplicado</span>
                          : <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">Novo</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Classification rules */}
          {classificationRules.length > 0 && (
            <div className="card">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Regras de Classificação ({classificationRules.length})</h3>
              <div className="space-y-1.5">
                {classificationRules.map(rule => {
                  const cat = categories.find(c => c.id === rule.categoryId)
                  return (
                    <div key={rule.id} className="flex items-center gap-2 text-xs text-gray-400">
                      <FileText size={10} className="text-gray-600 shrink-0" />
                      Contém <span className="text-[#0F6E56] mx-1">"{rule.contains}"</span>
                      → {cat ? `${cat.icon} ${cat.name}` : rule.categoryId}
                      {rule.payee && <span className="text-gray-600">({rule.payee})</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Histórico de importações */}
      {cardImports.length > 0 && (
        <div className="card">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Histórico de Importações
          </h3>
          <div className="space-y-1.5">
            {cardImports.slice(0, 20).map(imp => {
              const acc = accounts.find(a => a.id === imp.accountId)
              const dateStr = imp.importedAt
                ? new Date(imp.importedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                : '—'
              const mesAnoFmt = imp.mesAno ? imp.mesAno.split('-').reverse().join('/') : '—'
              return (
                <div key={imp.id} className="flex items-center gap-3 text-xs py-1.5 border-b border-gray-800/50 last:border-0">
                  <span className="text-gray-500 shrink-0 w-32">{dateStr}</span>
                  <span className="text-gray-300 truncate flex-1 min-w-0" title={imp.filename}>{imp.filename || '—'}</span>
                  <span className="text-gray-400 shrink-0">{imp.count} lançamento{imp.count !== 1 ? 's' : ''}</span>
                  <span className="text-gray-500 shrink-0">{mesAnoFmt}</span>
                  <span className="text-gray-500 shrink-0 hidden sm:inline">{acc?.apelido || acc?.name || '—'}</span>
                  <button
                    className="shrink-0 flex items-center gap-1 text-xs text-orange-500 hover:text-orange-400 border border-orange-500/30 hover:border-orange-400/50 rounded px-2 py-0.5 transition-colors"
                    onClick={() => setConfirmRevertId(imp.id)}
                  >
                    <RotateCcw size={11} /> Estornar
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmRevertId}
        onClose={() => setConfirmRevertId(null)}
        onConfirm={() => { revertCardImport(confirmRevertId); setConfirmRevertId(null) }}
        title="Estornar importação"
        message={(() => {
          const imp = cardImports.find(i => i.id === confirmRevertId)
          if (!imp) return ''
          return `Excluir ${imp.count} lançamento${imp.count !== 1 ? 's' : ''} da importação de ${imp.mesAno ? imp.mesAno.split('-').reverse().join('/') : 'data desconhecida'} (${imp.filename || 'arquivo desconhecido'})?`
        })()}
        danger
        confirmLabel="Estornar"
      />
    </div>
  )
}

// ─── Painel principal ─────────────────────────────────────────────────────────

export default function ImportPanel() {
  const { accounts, accountGroups, transactions } = useApp()
  const [tab, setTab] = useState('corrente')

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 border-b border-gray-800">
        {[
          { id: 'corrente', label: 'Conta Corrente' },
          { id: 'cartao', label: 'Cartão de Crédito' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 pb-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.id ? 'border-[#0F6E56] text-[#0F6E56]' : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'corrente' && <ContaCorrenteTab accounts={accounts} accountGroups={accountGroups} transactions={transactions} />}
      {tab === 'cartao' && <CartaoCreditoTab accounts={accounts} accountGroups={accountGroups} transactions={transactions} />}
    </div>
  )
}
