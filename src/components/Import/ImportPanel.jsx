import { useState, useRef, useMemo, useEffect } from 'react'
import {
  Upload, FileText, Check, AlertCircle, Wand2, Save,
  Link, X, Layers, ArrowRight, ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, RotateCcw, Pencil,
} from 'lucide-react'
import { parseFile, normalizeDate, fuzzyMatchAccount, parseDindinCC, parseDindinCartao } from '../../lib/dindinParse'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'
import { loadAccountMappings, fetchTransactionHistory } from '../../lib/db'
import { computeFaturaRef } from '../../lib/fatura'
import { detectInstallment, installmentKey } from '../../lib/installments'
import { addMonthToFatura, faturaToDate, clampDateToFatura, isDuplicateInstallment, findExistingParcela, installmentSystemDate } from '../../lib/parcelas'
import ScheduleMatchModal from '../shared/ScheduleMatchModal'
import CategorySelect from '../shared/CategorySelect'
import RateioModal from '../shared/RateioModal'
import GerencialTotalizer from '../shared/GerencialTotalizer'
import AccountOptions from '../shared/AccountOptions'
import ConfirmDialog from '../shared/ConfirmDialog'
import Toast from '../shared/Toast'
import DateInput from '../shared/DateInput'
import Modal from '../shared/Modal'
import TransactionForm from '../Transactions/TransactionForm'
import TransactionHistoryModal from '../shared/TransactionHistoryModal'

// ─── Shared helpers ────────────────────────────────────────────────────────────

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

function parseItauCSV(text, categories = []) {
  const clean = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = clean.split('\n').map(l => l.trim()).filter(Boolean)

  // Localizar linha de cabeçalho
  const headerIdx = lines.findIndex(l => /^data[,;]lan[çc]amento[,;]valor/i.test(l))
  if (headerIdx === -1) return { rows: [], cardName: '', faturaStr: '' }

  // Categoria de estorno (primeira cujo nome contenha "estorno"); vazio se não houver.
  const estornoCategoryId = categories.find(c => (c.name || '').toLowerCase().includes('estorno'))?.id || ''

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
    if (isNaN(rawVal) || rawVal === 0) continue

    if (rawVal < 0) {
      // Pagamento de fatura (negativo) → ignorar.
      if (desc.toLowerCase().includes('pagamento efetuado')) continue
      // Demais negativos = estorno → importar como RECEITA (valor absoluto),
      // pré-classificado na categoria de estorno (se houver).
      parsed.push({
        _id: idCtr++,
        date, description: desc, movimentacao: '', amount: Math.abs(rawVal),
        isDeposit: true, type: 'income', selected: true, _isDuplicate: false,
        categoryId: estornoCategoryId, payee: '', grupoGerencial: '',
      })
      continue
    }

    parsed.push({
      _id: idCtr++,
      date, description: desc, movimentacao: '', amount: rawVal,
      isDeposit: false, type: 'expense', selected: true, _isDuplicate: false,
      categoryId: '', payee: '', grupoGerencial: '',
    })
  }

  return { rows: parsed, cardName: '', faturaStr: '' }
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

// ── Conciliação inteligente (Melhoria 1) ──────────────────────────────────────
// Normaliza texto (maiúsculas, sem acentos) e mede similaridade: 1 = idêntico, 0.9 = um
// contém o outro, senão Jaccard de palavras (% de palavras em comum). Mesmo critério do
// backend (/api/transaction-history) para a busca por fornecedor.
function normText(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim().replace(/\s+/g, ' ')
}
function descSimilarity(a, b) {
  const x = normText(a), y = normText(b)
  if (!x || !y) return 0
  if (x === y) return 1
  if (x.includes(y) || y.includes(x)) return 0.9
  const wx = x.split(' ').filter(Boolean), wy = y.split(' ').filter(Boolean)
  const sx = new Set(wx), sy = new Set(wy)
  let inter = 0
  for (const w of sx) if (sy.has(w)) inter++
  const union = new Set([...wx, ...wy]).size
  return union ? inter / union : 0
}

// Nível de duplicata, testado em ordem (primeiro match vence). Candidatos = lançamentos da
// MESMA fatura do cartão. Retorna 'certeza' | 'provavel' | 'possivel' | null.
//   certeza : date_cartao igual + valor ±0,50 + descrição idêntica
//   provavel: date_cartao igual + valor ±0,50 + descrição similar (≥70%)
//   possivel: valor ±0,50 + descrição similar (≥70%), sem considerar data
function computeDupLevel(row, candidates) {
  if (!candidates || candidates.length === 0) return null
  const amt = Number(row.amount) || 0
  const rowCardDate = row._dateCartao || row.date
  const amtClose = (t) => Math.abs((Number(t.amount) || 0) - amt) <= 0.50
  const dateEq = (t) => !!rowCardDate && (t.dateCartao || t.date) === rowCardDate
  for (const t of candidates) if (amtClose(t) && dateEq(t) && normText(t.description) === normText(row.description)) return 'certeza'
  for (const t of candidates) if (amtClose(t) && dateEq(t) && descSimilarity(t.description, row.description) >= 0.7) return 'provavel'
  for (const t of candidates) if (amtClose(t) && descSimilarity(t.description, row.description) >= 0.7) return 'possivel'
  return null
}

// Cruzamento da reconciliação: casa cada item "Só no Itaú" com um "Só no sistema" (valor
// ±0,50 + descrição), 1:1 guloso. Níveis: certeza (idêntica), provável (≥0,70), possível
// (≥0,50). Pré-marca a ação em certeza/provável (Itaú→Ignorar, sistema→Manter); possível só
// recebe badge. Reusa descSimilarity/normText. Devolve cópias anotadas com _crossLevel.
function crossMatchConciliacao(soItau, soSistema) {
  const itauOut = soItau.map(i => ({ ...i }))
  const sysOut = soSistema.map(s => ({ ...s }))
  const used = new Set()
  for (const it of itauOut) {
    let best = null, bestRank = 0, bestSim = -1
    for (const s of sysOut) {
      if (used.has(s.id)) continue
      if (Math.abs((Number(it.amount) || 0) - (Number(s.amount) || 0)) > 0.50) continue
      const sim = descSimilarity(it.description, s.description)
      const rank = normText(it.description) === normText(s.description) ? 3 : sim >= 0.7 ? 2 : sim >= 0.5 ? 1 : 0
      if (rank === 0) continue
      if (rank > bestRank || (rank === bestRank && sim > bestSim)) { best = s; bestRank = rank; bestSim = sim }
    }
    if (!best) continue
    used.add(best.id)
    const level = bestRank === 3 ? 'certeza' : bestRank === 2 ? 'provavel' : 'possivel'
    it._crossLevel = level; best._crossLevel = level
    if (level !== 'possivel') { it.acao = 'ignorar'; best.acao = 'manter' }
  }
  return { soItau: itauOut, soSistema: sysOut }
}

// Badge do nível de cruzamento (reconciliação).
function CrossBadge({ level }) {
  const map = {
    certeza:  { cls: 'bg-red-500/20 text-red-400',       label: '🔴 Já no sistema' },
    provavel: { cls: 'bg-orange-500/20 text-orange-400', label: '🟠 Provável duplicata' },
    possivel: { cls: 'bg-yellow-500/20 text-yellow-500', label: '🟡 Possível duplicata' },
  }
  const m = map[level]
  if (!m) return null
  return <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded ${m.cls}`}>{m.label}</span>
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

// Calcula o mês da fatura (YYYY-MM) de um lançamento dado o dia de fechamento do cartão.
// dia <= closingDay → fatura do mês corrente; dia > closingDay → fatura do mês seguinte.
function calcFatura(dateStr, closingDay = 14) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  const day = d.getDate()
  let m, y
  if (day <= closingDay) { m = d.getMonth() + 1; y = d.getFullYear() }
  else { const n = new Date(d.getFullYear(), d.getMonth() + 1, 1); m = n.getMonth() + 1; y = n.getFullYear() }
  return `${y}-${String(m).padStart(2, '0')}`
}

// fatura_ref (YYYY-MM) a partir do DIA da data ORIGINAL do extrato (date_cartao),
// relativa ao mês de referência selecionado. Correção do bug de desvio de mês:
//   dia <= closingDay → fatura = mês de referência
//   dia >  closingDay → fatura = mês ANTERIOR ao de referência
// (gastos após o fechamento já entraram na fatura que está sendo importada por terem
//  ocorrido depois do último fechamento, então pertencem à fatura anterior).
function faturaRefFromReference(dateCartaoStr, referenceYYYYMM, closingDay) {
  if (!referenceYYYYMM) return ''
  if (!dateCartaoStr) return referenceYYYYMM
  const day = parseInt((dateCartaoStr.split('-')[2] || '1'), 10)
  return day <= (closingDay || 14) ? referenceYYYYMM : addMonthToFatura(referenceYYYYMM, -1)
}

// installmentSystemDate: regra de date (sistema) das parcelas — agora compartilhada em
// lib/parcelas.js (reutilizada também por buildSeries e criarParcelasGerencial).

// Reescreve cada linha base para o mês de referência. As parcelas geradas (siblings)
// seguem ancoradas à fatura da linha base.
//
// Itaú CSV (row._csvItau): fatura_ref = SEMPRE o mês de referência; a date de sistema
// mantém a data original do CSV quando ela está dentro do período válido da fatura
// (início = closingDay+1 do mês anterior; fim = closingDay do mês de referência) e, se
// estiver fora (parcelados antigos), clampa para o dia de fechamento do mês de referência.
//
// Dindin (demais): comportamento anterior — fatura_ref pela data original (dia vs
// fechamento) e date no mês de referência mantendo o dia original.
function applyReferenceFatura(rows, reference, closingDay, dueDay, financialStartDay = 1) {
  if (!reference) return rows
  const [fy, fm] = reference.split('-').map(Number)
  const daysInMonth = new Date(fy, fm, 0).getDate()
  const step1 = rows.map(row => {
    if (row._generated) return row
    const origDay = row._origDay ?? parseInt((row.date || '').split('-')[2] || '1', 10)
    const clampedDay = String(Math.min(origDay, daysInMonth)).padStart(2, '0')
    const dateCartao = row._dateCartao || row.date
    const num = row._installment?.num || 1
    if (row._csvItau) {
      const baseDate = clampDateToFatura(dateCartao, reference, closingDay)
      return {
        ...row,
        faturaMonthYear: reference,
        // Parcela 1/à vista mantém a data efetiva; parcela >1 vai p/ o mês anterior à fatura.
        date: installmentSystemDate(reference, num, baseDate, financialStartDay),
      }
    }
    const fatura = faturaRefFromReference(dateCartao, reference, closingDay)
    return {
      ...row,
      faturaMonthYear: fatura,
      date: installmentSystemDate(fatura, num, `${reference}-${clampedDay}`, financialStartDay),
    }
  })
  return step1.map(row => {
    if (!row._generated) return row
    const parent = step1.find(r => r._id === row._seriesId)
    if (!parent) return row
    const faturaI = addMonthToFatura(parent.faturaMonthYear, row._installmentNum - 1)
    // Parcelas geradas (siblings) são sempre num > 1 → data no mês anterior à fatura da parcela.
    return { ...row, faturaMonthYear: faturaI, date: installmentSystemDate(faturaI, row._installmentNum, faturaToDate(faturaI, dueDay) || row.date, financialStartDay) }
  })
}

// Data corrigida (YYYY-MM-DD) de um lançamento no modo reedição: dia de fechamento
// (closingDay) do mês/ano da fatura_ref. Ex.: '2026-05' + closingDay 20 → '2026-05-20'.
function correctedDateForFatura(faturaYYYYMM, closingDay) {
  if (!faturaYYYYMM || !closingDay) return null
  const [y, m] = faturaYYYYMM.split('-').map(Number)
  if (!y || !m) return null
  const lastDay = new Date(y, m, 0).getDate()
  const day = Math.min(closingDay, lastDay)
  return `${faturaYYYYMM}-${String(day).padStart(2, '0')}`
}

// Retorna o mês de fatura mais frequente entre os lançamentos base (não gerados).
// À-vista calculam a fatura de forma confiável (calcFatura da data do gasto); parcelados X/N
// usam um offset (num-1) que pode driftar no fechamento — por isso preferimos as à-vista.
function detectMainFatura(rows) {
  const tally = (pred) => {
    const counts = {}
    rows.forEach(r => {
      if (r.faturaMonthYear && !r._generated && pred(r))
        counts[r.faturaMonthYear] = (counts[r.faturaMonthYear] || 0) + 1
    })
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0]?.[0] || ''
  }
  return tally(r => !r._installment) || tally(() => true)
}

// Um arquivo de cartão é o extrato de UMA fatura: toda parcela X/N nele pertence a esse mês.
// Ancora a parcela base ao mês de referência (sem o offset que pode driftar) e recomputa
// as parcelas geradas (siblings) a partir dela. À-vista não são tocadas.
function alignInstallmentsToFatura(rows, fatura, dueDay) {
  if (!fatura) return rows
  const [fy, fm] = fatura.split('-').map(Number)
  const maxDay = new Date(fy, fm, 0).getDate()
  const step1 = rows.map(row => {
    if (row._generated || !row._installment || row.faturaMonthYear === fatura) return row
    const origDay = row._origDay ?? parseInt((row.date || '').split('-')[2] || '1', 10)
    return { ...row, faturaMonthYear: fatura, date: `${fatura}-${String(Math.min(origDay, maxDay)).padStart(2, '0')}` }
  })
  return step1.map(row => {
    if (!row._generated) return row
    const parent = step1.find(r => r._id === row._seriesId)
    if (!parent) return row
    const faturaI = addMonthToFatura(parent.faturaMonthYear, row._installmentNum - 1)
    return { ...row, faturaMonthYear: faturaI, date: faturaToDate(faturaI, dueDay) || row.date }
  })
}

// AJUSTE 2: modal "Preencher em Lote" — aplica categoria + gerencial aos itens cuja
// descrição contém o texto informado.
function BatchFillModal({ categories, sortedGrupos, reserveFuncsForGroup, onApply, onClose }) {
  const [contains, setContains] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [grupoGerencial, setGrupoGerencial] = useState(sortedGrupos[0]?.id || '')
  const [reservaFuncaoId, setReservaFuncaoId] = useState('')
  // Mesma regra do select inline: só oferece função de reserva quando a conta-origem
  // do grupo numerado tem mais de uma função.
  const funcs = reserveFuncsForGroup(grupoGerencial)
  const showFuncs = funcs.length > 1
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface border border-gray-700 rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-100">Preencher em Lote</h3>
        <div className="space-y-3">
          <div>
            <label className="label">Descrição contém</label>
            <input
              className="input"
              value={contains}
              onChange={e => setContains(e.target.value)}
              placeholder="ex: uber"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter' && contains.trim()) onApply(contains, categoryId, grupoGerencial, showFuncs ? reservaFuncaoId : '') }}
            />
          </div>
          <div>
            <label className="label">Categoria</label>
            <CategorySelect
              categories={categories}
              className="input"
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
              searchable
            />
          </div>
          <div>
            <label className="label">Grupo Gerencial</label>
            <select className="input" value={grupoGerencial} onChange={e => { setGrupoGerencial(e.target.value); setReservaFuncaoId('') }}>
              {sortedGrupos.map(g => <option key={g.id} value={g.id}>{g.number} · {g.name}</option>)}
            </select>
          </div>
          {showFuncs && (
            <div>
              <label className="label">Função de Reserva</label>
              <select className="input" value={reservaFuncaoId} onChange={e => setReservaFuncaoId(e.target.value)}>
                <option value="">— Selecionar —</option>
                {funcs.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="flex gap-3 justify-end">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={!contains.trim()} onClick={() => onApply(contains, categoryId, grupoGerencial, showFuncs ? reservaFuncaoId : '')}>
            Aplicar
          </button>
        </div>
      </div>
    </div>
  )
}

// installment_key de um lançamento EXISTENTE (usa num/total gravados; cai p/ detecção
// quando faltarem). null quando não é parcela reconhecível.
function keyOfExistingTx(tx) {
  const det = detectInstallment(tx.description || '')
  const num = tx.installmentNum ?? det?.num
  const total = tx.installmentTotal ?? det?.total
  if (num == null || total == null) return null
  return installmentKey({
    accountId: tx.accountId, description: tx.description,
    installmentNum: num, installmentTotal: total,
    amount: tx.amount, faturaMonthYear: tx.faturaMonthYear, date: tx.date,
  })
}
// installment_key PROSPECTIVA de uma linha de importação (o que txToRow gravaria no insert).
function keyOfImportRow(row, accountId) {
  if (!row._installment) return null
  return installmentKey({
    accountId, description: row.description,
    installmentNum: row._installment.num, installmentTotal: row._installment.total,
    amount: row.amount, faturaMonthYear: row.faturaMonthYear, date: row.date,
  })
}

// Override manual de parcelamento (camada sobre detectInstallment, sem alterá-lo). Quando a
// descrição tem N/M, reaproveita base/matchStr do detector; senão base = descrição inteira e
// matchStr = null (as parcelas futuras recebem sufixo " N/M" — ver futureParcelas).
function buildManualInstallment(description, num, total) {
  const det = detectInstallment(description || '')
  return {
    num, total,
    base: det ? det.base : (description || '').trim().replace(/\s+/g, ' '),
    matchStr: det ? det.matchStr : null,
    _manual: true,
  }
}

// Chip + popover inline de parcelamento, compartilhado por importação e conciliação.
//   installment = { num, total, ... } ou null (à vista). onChange recebe o novo override (ou null).
function InstallmentControl({ installment, description, onChange }) {
  const [open, setOpen] = useState(false)
  const [num, setNum] = useState(installment?.num || 1)
  const [total, setTotal] = useState(installment?.total || 2)
  const ref = useRef(null)

  const openEditor = () => {
    setNum(installment?.num || 1)
    setTotal(installment?.total || 2)
    setOpen(true)
  }
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const confirm = () => {
    const t = Math.max(2, Math.min(99, parseInt(total, 10) || 2))
    const n = Math.max(1, Math.min(t, parseInt(num, 10) || 1))
    onChange(buildManualInstallment(description, n, t))
    setOpen(false)
  }
  const clear = () => { onChange(null); setOpen(false) }

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openEditor())}
        title={installment ? 'Editar parcelamento' : 'Marcar como parcelado'}
        className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${
          installment ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
        }`}
      >
        <Layers size={9} />
        {installment ? `Parcela ${installment.num} de ${installment.total}` : 'À vista'}
      </button>
      {open && (
        <div className="absolute z-50 mt-1 right-0 bg-surface border border-gray-700 rounded-lg shadow-xl p-2.5 w-44 space-y-2">
          <div className="flex items-end gap-1.5">
            <label className="text-[10px] text-gray-400 flex-1">
              Nº da parcela
              <input type="number" min="1" max="99" value={num} onChange={e => setNum(e.target.value)}
                className="mt-0.5 w-full bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-xs text-gray-200 focus:outline-none" />
            </label>
            <span className="text-gray-500 text-xs pb-1.5">/</span>
            <label className="text-[10px] text-gray-400 flex-1">
              Total
              <input type="number" min="2" max="99" value={total} onChange={e => setTotal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') confirm() }}
                className="mt-0.5 w-full bg-gray-800 border border-gray-700 rounded px-1.5 py-1 text-xs text-gray-200 focus:outline-none" />
            </label>
          </div>
          <div className="flex items-center justify-between gap-2">
            {installment
              ? <button type="button" onClick={clear} className="text-[10px] text-gray-400 hover:text-gray-200">↩ À vista</button>
              : <span />}
            <button type="button" onClick={confirm} className="text-[10px] px-2 py-1 rounded bg-[#0F6E56] text-white hover:bg-[#0c5a47]">Confirmar</button>
          </div>
        </div>
      )}
    </div>
  )
}

function CartaoCreditoTab({ accounts, accountGroups, transactions }) {
  const {
    categories, classificationRules, gerencialGroups, processarLancamentoGerencial,
    addTransaction, updateTransaction, deleteTransaction, addRule, classifyByRules, learnClassification, recalcularAgendamentosFatura, classifyGerencialByRules,
    findMatchingSchedule, addRecurringMatchException, markScheduleRegistered, getNextOccurrences,
    cardImports, addCardImport, updateCardImport, revertCardImport,
    payees, addPayee,
    rateiosByLancamento, saveRateiosFor,
    reserveFunctions, settings,
  } = useApp()

  // Dia de início do mês financeiro — define a data de sistema das parcelas 2..N
  // (provisão no dia financialMonthStartDay do mês anterior à fatura da parcela).
  const financialStartDay = settings?.financialMonthStartDay || 1

  // Funções de reserva vinculadas à conta-origem (resgate) de um grupo gerencial numerado.
  // Vazio para Grupo G (number===1), D, ou grupos sem conta-origem definida.
  const reserveFuncsForGroup = (grupoId) => {
    const g = gerencialGroups.find(x => x.id === grupoId)
    if (!g || typeof g.number !== 'number' || g.number === 1 || !g.defaultAccountId) return []
    return (reserveFunctions || []).filter(f => f.accountId === g.defaultAccountId)
  }
  const [rateioRow, setRateioRow] = useState(null)

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
  const [editingImport, setEditingImport] = useState(null)
  const [showBatchFill, setShowBatchFill] = useState(false)
  const [showCorrigirDatas, setShowCorrigirDatas] = useState(false)
  const [corrigirToast, setCorrigirToast] = useState(null)

  // ── Modo Conciliação de Fatura ───────────────────────────────────────────
  const [conciliarMode, setConciliarMode] = useState(false)
  const [concMatched, setConcMatched] = useState([])   // [{ csv, sys }]
  const [concSoItau, setConcSoItau] = useState([])      // itens do CSV ausentes no sistema
  const [concSoSistema, setConcSoSistema] = useState([])// lançamentos do sistema ausentes no CSV
  const [concError, setConcError] = useState('')
  const [concToast, setConcToast] = useState(null)
  const [concEditTx, setConcEditTx] = useState(null) // lançamento existente em edição (seção Conciliados)
  const concFileRef = useRef()

  // Conciliação inteligente: linhas de nível provável/possível que o usuário FORÇOU a importar.
  const [forcedDupSelect, setForcedDupSelect] = useState(() => new Set())
  const toggleForcedDup = (id) => setForcedDupSelect(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  // Modal de histórico do fornecedor (Melhoria 2).
  const [historyModal, setHistoryModal] = useState(null) // { description, items, loading, error }
  const openHistory = async (description) => {
    const desc = (description || '').trim()
    if (!desc) return
    setHistoryModal({ description: desc, items: [], loading: true })
    try {
      const { transactions: items } = await fetchTransactionHistory(desc, 5)
      setHistoryModal({ description: desc, items: items || [], loading: false })
    } catch {
      setHistoryModal({ description: desc, items: [], loading: false, error: true })
    }
  }

  const defaultGrupoD = gerencialGroups.find(g => g.number === 'D')?.id || 'grp_D'
  const creditAccounts = accounts.filter(a => a.type === 'credit')
  const selectedAcc = accounts.find(a => a.id === selectedAccount)

  // Item 7: índice das parcelas já existentes do cartão por installment_key, para detectar
  // colisão na reimportação (mesma chave = mesma parcela → atualizar, não inserir).
  const existingParcelaByKey = useMemo(() => {
    const m = new Map()
    if (!selectedAccount) return m
    for (const t of transactions) {
      if (t.accountId !== selectedAccount || t.type !== 'expense' || t.accountType !== 'credit') continue
      const k = keyOfExistingTx(t)
      if (k && !m.has(k)) m.set(k, t)
    }
    return m
  }, [transactions, selectedAccount])
  // Linhas de colisão que o usuário desmarcou (não atualizar). Default: todas aplicam.
  const [collisionSkip, setCollisionSkip] = useState(() => new Set())
  const toggleCollision = (id) => setCollisionSkip(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  const sortedGrupos = useMemo(() => [...gerencialGroups].sort((a, b) => {
    if (a.number === 'D') return 1
    if (b.number === 'D') return -1
    return typeof a.number === 'number' && typeof b.number === 'number' ? a.number - b.number : 0
  }), [gerencialGroups])

  const handleFile = async (file) => {
    setError('')
    setResult(null)
    setMatchQueue([])
    setEditingImport(null)
    setFilename(file.name)
    try {
      const isCsv = /\.csv$/i.test(file.name)
      let cardName = '', faturaStr = '', parsed = []

      if (isCsv) {
        const text = await readFileAsText(file)
        if (!isItauCSV(text)) { setError('CSV não reconhecido. Verifique se é o formato de exportação do Itaú (colunas: data, lançamento, valor).'); return }
        ;({ rows: parsed, cardName, faturaStr } = parseItauCSV(text, categories))
      } else {
        const rawRows = await parseFile(file)
        ;({ cardName, faturaStr, rows: parsed } = parseDindinCartao(rawRows))
      }

      if (parsed.length === 0) { setError('Nenhum lançamento encontrado. Verifique o formato do arquivo.'); return }

      // Auto-match card (before fatura computation so we get the right closingDay/dueDay)
      let resolvedClosingDay = accounts.find(a => a.id === selectedAccount)?.closingDay || 14
      let resolvedDueDay = accounts.find(a => a.id === selectedAccount)?.dueDay || null
      if (cardName) {
        const match = fuzzyMatchAccount(cardName, creditAccounts)
        if (match) {
          setSelectedAccount(match.id)
          resolvedClosingDay = match.closingDay || 14
          resolvedDueDay = match.dueDay || null
        }
      }

      // Auto-classify from rules + Movimentação → category; compute per-row fatura
      const grupoD = gerencialGroups.find(g => g.number === 'D')?.id || 'grp_D'
      const processed = []
      const pendingMatches = []
      let idCtr = 0

      parsed.forEach(row => {
        const rowDay = new Date(row.date + 'T00:00:00').getDate()
        const classified = classifyByRules(row.description, { dayOfMonth: rowDay, amountApprox: row.amount })
        const movCat = categories.find(c => c.name.toLowerCase() === row.movimentacao.toLowerCase())
        const categoryId = classified?.categoryId || movCat?.id || ''
        // Favorecido: regra de classificação > favorecido já vindo do parser > o próprio
        // lançamento (descrição/estabelecimento, ex.: CSV Itaú e XLS de cartão).
        const payee = classified?.payee || row.payee || row.description || ''
        const installInfo = detectInstallment(row.description)
        const isParcelado = !!installInfo
        const grupoFromRules = classified?.grupoGerencial
          || classifyGerencialByRules(row.description, row.amount, isParcelado)
        // Função de reserva da regra → só pré-preenche quando a conta-origem do grupo
        // tem múltiplas funções (mesma condição do select inline) e a função é válida nela.
        const grupoFinal = grupoFromRules || grupoD
        const funcsDoGrupo = reserveFuncsForGroup(grupoFinal)
        const reservaFuncaoFromRule = (classified?.reservaFuncaoId
          && funcsDoGrupo.length > 1
          && funcsDoGrupo.some(f => f.id === classified.reservaFuncaoId))
          ? classified.reservaFuncaoId : null
        const faturaParc1 = calcFatura(row.date, resolvedClosingDay)
        // Para parcelados X/N com X > 1: fatura = fatura da parcela 1 + (X-1) meses
        const baseFatura = (installInfo && installInfo.num > 1)
          ? addMonthToFatura(faturaParc1, installInfo.num - 1)
          : faturaParc1
        const baseRow = {
          ...row, _id: idCtr++, categoryId, payee,
          grupoGerencial: grupoFinal, _installment: installInfo, _generated: false,
          _reservaFuncaoId: reservaFuncaoFromRule,
          faturaMonthYear: baseFatura, _origDay: rowDay,
          // Data original do extrato (preservada; `date` será corrigida p/ o mês de referência).
          _dateCartao: row.date,
          // Itaú CSV usa regra própria de date/fatura_ref em applyReferenceFatura.
          _csvItau: isCsv,
        }
        processed.push(baseRow)
        // As parcelas futuras (num+1 … total) não entram na lista principal — são
        // exibidas na seção "Parcelas de faturas futuras" (derivada) e criadas na
        // confirmação. Aqui só detectamos correspondência com lançamento existente.
        if (installInfo && installInfo.num > 1) {
          const key = installInfo.base.toLowerCase().slice(0, 14)
          const match = transactions.find(t =>
            Math.abs(t.amount - baseRow.amount) < 0.5 &&
            (t.description || '').toLowerCase().includes(key)
          )
          if (match) pendingMatches.push({ row: baseRow, existingTx: match, installInfo })
        }
      })

      const sortedRows = processed.sort((a, b) => a.faturaMonthYear.localeCompare(b.faturaMonthYear) || a.date.localeCompare(b.date))

      // Auto-detectar mês de referência pelo mês de fatura mais frequente e ancorar as parcelas a ele
      const detected = detectMainFatura(sortedRows)
      let alignedRows = detected ? alignInstallmentsToFatura(sortedRows, detected, resolvedDueDay) : sortedRows
      // Aplica a regra de fatura_ref (dia da data ORIGINAL vs fechamento) e corrige a
      // data de sistema para o mês de referência, mantendo date_cartao intacta.
      if (detected) alignedRows = applyReferenceFatura(alignedRows, detected, resolvedClosingDay, resolvedDueDay, financialStartDay)
      setRows(alignedRows)
      setCardInfo({ cardName, faturaStr })
      setMatchQueue(pendingMatches)
      if (detected) setFaturaMonthYear(detected)
    } catch (err) {
      setError('Erro ao ler arquivo: ' + err.message)
    }
  }

  // Recomputa faturas e datas de todas as linhas quando o cartão muda
  const handleAccountChange = (accountId) => {
    setSelectedAccount(accountId)
    if (rows.length === 0) return
    const acc = accounts.find(a => a.id === accountId)
    const cl = acc?.closingDay || 14
    const dd = acc?.dueDay || null
    setRows(prev => {
      // Recalcula a fatura base de cada linha pela data ORIGINAL (date_cartao) e o novo
      // fechamento — nunca pela `date` já corrigida (origem do bug de desvio de mês).
      const rebased = prev.map(row => {
        if (row._generated) return row
        const inst = detectInstallment(row.description)
        const faturaParc1 = calcFatura(row._dateCartao || row.date, cl)
        const fatura = (inst && inst.num > 1) ? addMonthToFatura(faturaParc1, inst.num - 1) : faturaParc1
        return { ...row, faturaMonthYear: fatura }
      })
      const detected = detectMainFatura(rebased)
      if (detected) setFaturaMonthYear(detected)
      return detected ? applyReferenceFatura(rebased, detected, cl, dd, financialStartDay) : rebased
    })
  }

  // Propaga o Mês de Referência global para todas as linhas. A data de sistema vai para o
  // mês de referência (dia original mantido); a fatura_ref vem da data ORIGINAL pela regra
  // dia vs fechamento (gastos após o fechamento → fatura do mês anterior ao de referência).
  const handleFaturaMonthYearChange = (newFatura) => {
    setFaturaMonthYear(newFatura)
    if (!newFatura || rows.length === 0) return
    const acc = accounts.find(a => a.id === selectedAccount)
    const cl = acc?.closingDay || 14
    const dd = acc?.dueDay || null
    setRows(prev => applyReferenceFatura(prev, newFatura, cl, dd, financialStartDay))
  }

  // Carrega uma importação do histórico para reedição
  const loadImportForEdit = (imp) => {
    const txSet = new Set(imp.txIds || [])
    const impTxs = transactions.filter(t => txSet.has(t.id) && t.type !== 'transfer')
    if (impTxs.length === 0) return
    // Descrição raiz: descrição sem o sufixo de parcelamento "N/Total".
    const rootOf = (desc) => {
      const di = detectInstallment(desc || '')
      return (di ? di.base : (desc || '')).toLowerCase().trim()
    }
    const reconstructed = impTxs.map(t => {
      const inst = detectInstallment(t.description || '')
      // Parcela N/Total (N>1) sem função → herda de outro lançamento do MESMO cartão com a
      // mesma descrição raiz que tenha reserva_funcao_id preenchido.
      let reservaFuncaoId = t.reservaFuncaoId || null
      if (!reservaFuncaoId && inst && inst.num > 1) {
        const root = inst.base.toLowerCase().trim()
        const sibling = transactions.find(o =>
          o.id !== t.id && o.accountId === imp.accountId && o.reservaFuncaoId && rootOf(o.description) === root
        )
        reservaFuncaoId = sibling?.reservaFuncaoId || null
      }
      return {
        _id: t.id,
        date: t.date,
        _dateCartao: t.dateCartao || null,
        description: t.description || '',
        amount: t.amount,
        faturaMonthYear: t.faturaMonthYear || '',
        categoryId: t.categoryId || '',
        payee: t.payee || '',
        grupoGerencial: t.grupoGerencial || defaultGrupoD,
        _reservaFuncaoId: reservaFuncaoId,
        type: t.type,
        isDeposit: false,
        selected: true,
        _isDuplicate: false,
        _installment: inst,
        _generated: false,
        movimentacao: '',
        _origDay: t.date ? new Date(t.date + 'T00:00:00').getDate() : null,
        _rateios: (rateiosByLancamento?.get(t.id) || []).map(r => ({ categoriaId: r.categoriaId, valor: r.valor, descricao: r.descricao })),
      }
    })
    reconstructed.sort((a, b) =>
      (a.faturaMonthYear || '').localeCompare(b.faturaMonthYear || '') || a.date.localeCompare(b.date)
    )
    setRows(reconstructed)
    setSelectedAccount(imp.accountId)
    setFaturaMonthYear(imp.mesAno || '')
    setEditingImport(imp)
    setResult(null)
    setFilename(imp.filename || '')
    setError('')
    setCardInfo({ cardName: '', faturaStr: '' })
  }

  // Lançamentos do cartão selecionado, agrupados por fatura — candidatos da conciliação.
  const cardTxsByFatura = useMemo(() => {
    const m = new Map()
    if (!selectedAccount) return m
    for (const t of transactions) {
      if (t.accountId !== selectedAccount) continue
      if (t.type !== 'expense' && t.type !== 'income') continue
      const f = t.faturaMonthYear || ''
      if (!m.has(f)) m.set(f, [])
      m.get(f).push(t)
    }
    return m
  }, [transactions, selectedAccount])

  const resolvedRows = useMemo(() => {
    if (editingImport) return rows.map(r => ({ ...r, accountId: selectedAccount, _isDuplicate: false, _collisionTx: null, _dupLevel: null }))
    if (!selectedAccount) return rows.map(r => ({ ...r, _isDuplicate: false, _collisionTx: null, _dupLevel: null }))
    return rows.map(row => {
      const r = { ...row, accountId: selectedAccount }
      // Colisão por installment_key → atualizar o existente (não inserir, não pular).
      const k = keyOfImportRow(r, selectedAccount)
      const collisionTx = k ? existingParcelaByKey.get(k) : null
      if (collisionTx) return { ...r, _isDuplicate: false, _collisionTx: collisionTx, _dupLevel: null, selected: false }
      // Conciliação inteligente progressiva contra os lançamentos da MESMA fatura.
      const dupLevel = r._generated ? null : computeDupLevel(r, cardTxsByFatura.get(r.faturaMonthYear) || [])
      const isCerteza = dupLevel === 'certeza'
      // Certeza: nunca selecionável. Provável/Possível: desmarcado por padrão, salvo se o
      // usuário forçar. Sem duplicata: segue o `selected` da linha.
      const selected = isCerteza ? false : (dupLevel ? forcedDupSelect.has(r._id) : row.selected)
      return { ...r, _isDuplicate: isCerteza, _collisionTx: null, _dupLevel: dupLevel, selected }
    })
  }, [rows, selectedAccount, editingImport, existingParcelaByKey, cardTxsByFatura, forcedDupSelect])

  // Parcelas FUTURAS dos parcelados que serão importados (seção secundária, informativa).
  // Já existentes no banco → exibidas com a classificação atual (não são alteradas);
  // ausentes → herdam a categoria/gerencial da parcela importada e são criadas na confirmação.
  const futureParcelas = useMemo(() => {
    // Item 1: também no modo reedição — parcelas futuras ausentes de um parcelado já
    // importado são geradas/exibidas (as já existentes vêm marcadas _exists e não mudam).
    if (!selectedAccount) return []
    const dueDay = selectedAcc?.dueDay || null
    // Parcelas base já presentes na seção principal — evita duplicar uma parcela futura
    // que também aparece como item da própria fatura importada.
    const principalKeys = new Set()
    for (const row of resolvedRows) {
      if (!row.selected || row._isDuplicate || !row._installment) continue
      principalKeys.add(`${row._installment.base.toLowerCase().trim()}|${row._installment.num}`)
    }
    const out = []
    const seen = new Set() // evita repetir a mesma parcela futura vinda de pais diferentes
    for (const row of resolvedRows) {
      if (!row.selected || row._isDuplicate) continue
      const inst = row._installment
      if (!inst || inst.num >= inst.total) continue
      const base = inst.base.toLowerCase().trim()
      // Override manual sem N/M na descrição (matchStr null): a futura recebe o sufixo " N/M".
      const numWidth = inst.matchStr ? inst.matchStr.split('/')[0].length : String(inst.total).length
      for (let k = inst.num + 1; k <= inst.total; k++) {
        const key = `${base}|${k}`
        if (principalKeys.has(key) || seen.has(key)) continue
        seen.add(key)
        const futFatura = addMonthToFatura(row.faturaMonthYear, k - inst.num)
        // Parcela futura (k > 1): data de sistema = dia financialStartDay do mês anterior à fatura.
        const futDate = installmentSystemDate(futFatura, k, faturaToDate(futFatura, dueDay) || `${futFatura}-01`, financialStartDay)
        const futNumStr = String(k).padStart(numWidth, '0')
        const futDesc = inst.matchStr
          ? row.description.replace(inst.matchStr, `${futNumStr}/${inst.total}`)
          : `${row.description} ${futNumStr}/${inst.total}`
        const existing = findExistingParcela(inst, k, row.amount, selectedAccount, transactions)
        out.push({
          _id: `fut_${row._id}_${k}`, parentId: row._id,
          date: futDate, faturaMonthYear: futFatura, description: futDesc, amount: row.amount,
          num: k, total: inst.total,
          categoryId: existing ? (existing.categoryId || '') : row.categoryId,
          grupoGerencial: existing ? (existing.grupoGerencial || defaultGrupoD) : (row.grupoGerencial || defaultGrupoD),
          payee: existing ? (existing.payee || '') : row.payee,
          // Replica a função de reserva escolhida na parcela base para as parcelas futuras.
          _reservaFuncaoId: existing ? null : (row._reservaFuncaoId || null),
          _exists: !!existing,
        })
      }
    }
    return out
    // editingImport mantido nas deps: o React Compiler exige o array idêntico (preserve-
    // manual-memoization); o corpo não o usa mais, daí o aviso benigno de dep desnecessária.
  }, [resolvedRows, transactions, selectedAccount, selectedAcc, editingImport, defaultGrupoD, financialStartDay])

  const updateRow = (id, changes) => setRows(prev => prev.map(r => r._id === id ? { ...r, ...changes } : r))
  const toggleRow = (id) => setRows(prev => prev.map(r => r._id === id ? { ...r, selected: !r.selected } : r))
  const toggleAll = (v) => setRows(prev => prev.map(r => ({ ...r, selected: r._isDuplicate ? false : v })))

  // AJUSTE 2: preenche categoria + gerencial (+ função de reserva) em lote para itens
  // cuja descrição contém o texto. Ao trocar o grupo, redefine a função de reserva da linha
  // (mesma semântica do select inline, que zera _reservaFuncaoId quando o grupo muda).
  const applyBatchFill = (containsText, categoryId, grupoGerencial, reservaFuncaoId) => {
    setShowBatchFill(false)
    const t = (containsText || '').trim().toLowerCase()
    if (!t) return
    setRows(prev => prev.map(r =>
      (r.description || '').toLowerCase().includes(t)
        ? {
            ...r,
            categoryId: categoryId || r.categoryId,
            grupoGerencial: grupoGerencial || r.grupoGerencial,
            _reservaFuncaoId: grupoGerencial ? (reservaFuncaoId || null) : r._reservaFuncaoId,
          }
        : r
    ))
  }

  const autoClassify = () => {
    const grupoD = gerencialGroups.find(g => g.number === 'D')?.id || 'grp_D'
    setRows(prev => prev.map(row => {
      const rowDay = new Date(row.date + 'T00:00:00').getDate()
      const c = row.categoryId ? null : classifyByRules(row.description, { dayOfMonth: rowDay, amountApprox: row.amount })
      const isParcelado = !!row._installment
      const gerencialId = classifyGerencialByRules(row.description, row.amount, isParcelado)

      const updates = {}
      if (c) {
        updates.categoryId = c.categoryId
        updates.payee = c.payee || row.payee
        if (c.grupoGerencial) updates.grupoGerencial = c.grupoGerencial
      }
      // Apply gerencial rule if found and category rule didn't set a grupo
      if (gerencialId && !updates.grupoGerencial) updates.grupoGerencial = gerencialId

      // Função de reserva da regra → só aplica quando a conta-origem do grupo final
      // tem múltiplas funções (mesma condição do select inline) e a função é válida nela.
      if (c?.reservaFuncaoId) {
        const grupoFinal = updates.grupoGerencial || row.grupoGerencial
        const funcs = reserveFuncsForGroup(grupoFinal)
        if (funcs.length > 1 && funcs.some(f => f.id === c.reservaFuncaoId)) {
          updates._reservaFuncaoId = c.reservaFuncaoId
        }
      }

      // Reset to grupoD when no rule applies and still on default
      if (!updates.grupoGerencial && row.grupoGerencial === grupoD) {
        // keep default
      }

      return Object.keys(updates).length ? { ...row, ...updates } : row
    }))
  }

  const handleImport = () => {
    const toImport = resolvedRows.filter(r => r.selected && !r._isDuplicate && !r._collisionTx)

    // Modo reedição: atualiza campos editáveis das transações existentes e recalcula
    // os agendamentos de cada fatura afetada, passando o mapa de funções de reserva por
    // conta-origem (mesma montagem da importação nova) — sem isso o schedule_reserva_funcoes
    // do resgate não é repopulado quando só a função muda.
    if (editingImport) {
      const editClosingDay = accounts.find(a => a.id === selectedAccount)?.closingDay || 14
      const faturasAfetadas = new Set()
      const addFaturaAfetada = (faturaMY, dataStr) => {
        if (faturaMY) { faturasAfetadas.add(faturaMY); return }
        const ref = computeFaturaRef(new Date(dataStr + 'T00:00:00'), editClosingDay) // MM/YYYY
        const [m, y] = ref.split('/')
        faturasAfetadas.add(`${y}-${m}`)
      }
      // Função de reserva por (fatura → conta-origem); desempate pelo lançamento de maior valor.
      const reservaFuncaoPorFatura = new Map() // faturaMesAno → Map(contaOrigem → { funcId, amount })
      const registrarReservaFuncao = (faturaMY, grupoId, reservaFuncaoId, amount) => {
        if (!faturaMY || !reservaFuncaoId) return
        const grupo = gerencialGroups.find(g => g.id === grupoId)
        if (!grupo || typeof grupo.number !== 'number' || grupo.number === 1 || !grupo.defaultAccountId) return
        const origem = grupo.defaultAccountId
        const func = (reserveFunctions || []).find(f => f.id === reservaFuncaoId)
        if (!func || func.accountId !== origem) return
        if (!reservaFuncaoPorFatura.has(faturaMY)) reservaFuncaoPorFatura.set(faturaMY, new Map())
        const byOrigem = reservaFuncaoPorFatura.get(faturaMY)
        const prev = byOrigem.get(origem)
        const amt = Number(amount) || 0
        if (!prev || amt > prev.amount) byOrigem.set(origem, { funcId: reservaFuncaoId, amount: amt })
      }

      toImport.forEach(row => {
        updateTransaction(row._id, {
          faturaMonthYear: row.faturaMonthYear || null,
          categoryId: row.categoryId || null,
          grupoGerencial: row.grupoGerencial || null,
          date: row.date,
          dateCartao: row._dateCartao || null,
          reservaFuncaoId: row._reservaFuncaoId || null,
        })
        if (row._rateios?.length > 0) saveRateiosFor(row._id, row._rateios)
        addFaturaAfetada(row.faturaMonthYear, row.date)
        if (row.grupoGerencial) {
          registrarReservaFuncao(row.faturaMonthYear, row.grupoGerencial, row._reservaFuncaoId, row.amount)
        }
      })

      // Item 1: parcelas futuras AUSENTES de um parcelado reeditado também são criadas
      // (mesma regra da importação nova). As já existentes (fp._exists) não são tocadas.
      // Os ids criados são anexados ao histórico para permanecerem editáveis numa próxima
      // reedição. Suas faturas entram em faturasAfetadas antes do recálculo abaixo.
      const novosTxIds = []
      futureParcelas.forEach(fp => {
        if (fp._exists) return
        if (isDuplicateInstallment({ description: fp.description, amount: fp.amount }, transactions, selectedAccount)) return
        // fp.date já é a data de sistema correta (parcela >1 → mês anterior à fatura). NÃO
        // clampar ao período da própria fatura — isso jogaria a data de volta p/ o mês da fatura.
        const fpDate = fp.date
        addFaturaAfetada(fp.faturaMonthYear, fpDate)
        if (fp.payee && !payees.includes(fp.payee)) addPayee(fp.payee)
        const fId = addTransaction({
          type: 'expense', accountId: selectedAccount, accountType: 'credit',
          amount: fp.amount, date: fpDate, description: fp.description,
          categoryId: fp.categoryId, payee: fp.payee,
          grupoGerencial: fp.grupoGerencial || defaultGrupoD,
          faturaMonthYear: fp.faturaMonthYear,
          reservaFuncaoId: fp._reservaFuncaoId || null,
          installmentNum: fp.num, installmentTotal: fp.total,
          _fromImport: true,
        })
        if (fId) novosTxIds.push(fId)
        const parentRow = resolvedRows.find(r => r._id === fp.parentId)
        if (fId && parentRow?._rateios?.length > 0) saveRateiosFor(fId, parentRow._rateios)
        if (fp.grupoGerencial) {
          processarLancamentoGerencial(
            { accountId: selectedAccount, amount: fp.amount, date: fpDate, description: fp.description, faturaMonthYear: fp.faturaMonthYear },
            fp.grupoGerencial, null, { immediate: false }
          )
          registrarReservaFuncao(fp.faturaMonthYear, fp.grupoGerencial, fp._reservaFuncaoId, fp.amount)
        }
      })

      const impChanges = {}
      if (faturaMonthYear && faturaMonthYear !== editingImport.mesAno) impChanges.mesAno = faturaMonthYear
      if (novosTxIds.length > 0) impChanges.txIds = [...(editingImport.txIds || []), ...novosTxIds]
      if (Object.keys(impChanges).length > 0) {
        updateCardImport(editingImport.id, impChanges)
      }
      // Recalcula cada fatura afetada com o mapa (igual ao fluxo de importação nova). Roda
      // após os updateTransaction (todos via update funcional), então enxerga as transações
      // já atualizadas e o mapa tem prioridade no desempate da função do resgate.
      for (const fmy of faturasAfetadas) {
        const [y, m] = fmy.split('-')
        const byOrigem = reservaFuncaoPorFatura.get(fmy)
        const reservaFuncaoByAccount = byOrigem
          ? Object.fromEntries([...byOrigem].map(([origem, v]) => [origem, v.funcId]))
          : undefined
        recalcularAgendamentosFatura(editingImport.accountId, y, m, reservaFuncaoByAccount)
      }
      setEditingImport(null)
      setResult(toImport.length)
      setRows([])
      return
    }

    // Data de sistema da linha: mantida no mês de referência por applyReferenceFatura
    // (e editável na tabela de revisão), com clamp ao período válido da fatura — datas
    // fora do intervalo caem no dia de fechamento do mês da fatura. A fatura_ref vive
    // separada em row.faturaMonthYear; date_cartao nunca é alterada.
    // Exceção: parcela N/Total com N > 1 já tem date no mês ANTERIOR à fatura (regra do
    // Finup) — não clampar, senão a data voltaria p/ o mês da própria fatura.
    const computeSaveDate = (row) =>
      (row._installment?.num || 1) > 1
        ? row.date
        : clampDateToFatura(row.date, row.faturaMonthYear, importClosingDay)

    const txIds = []
    // Faturas (YYYY-MM) tocadas por este lote → recálculo dos agendamentos acumulativos no fim.
    const importClosingDay = accounts.find(a => a.id === selectedAccount)?.closingDay || 14
    const faturasAfetadas = new Set()
    const addFaturaAfetada = (faturaMY, dataStr) => {
      if (faturaMY) { faturasAfetadas.add(faturaMY); return }
      const ref = computeFaturaRef(new Date(dataStr + 'T00:00:00'), importClosingDay) // MM/YYYY
      const [m, y] = ref.split('/')
      faturasAfetadas.add(`${y}-${m}`)
    }
    // AJUSTE 2: contains (descrições) que já viraram regra — evita duplicar no lote.
    const ruleContainsSeen = new Set(classificationRules.map(r => (r.contains || '').trim().toLowerCase()).filter(Boolean))

    // Função de reserva escolhida por (fatura → conta-origem): o resgate_reserva de cada
    // fatura agrupa por conta-origem (grupo.defaultAccountId), então guardamos a função do
    // lançamento de MAIOR valor como desempate. Lançamentos sem _reservaFuncaoId não entram.
    const reservaFuncaoPorFatura = new Map() // faturaMesAno → Map(contaOrigem → { funcId, amount })
    const registrarReservaFuncao = (faturaMY, grupoId, reservaFuncaoId, amount) => {
      if (!faturaMY || !reservaFuncaoId) return
      const grupo = gerencialGroups.find(g => g.id === grupoId)
      if (!grupo || typeof grupo.number !== 'number' || grupo.number === 1 || !grupo.defaultAccountId) return
      const origem = grupo.defaultAccountId
      // Ignora valor obsoleto: a função precisa pertencer à conta-origem do grupo atual.
      const func = (reserveFunctions || []).find(f => f.id === reservaFuncaoId)
      if (!func || func.accountId !== origem) return
      if (!reservaFuncaoPorFatura.has(faturaMY)) reservaFuncaoPorFatura.set(faturaMY, new Map())
      const byOrigem = reservaFuncaoPorFatura.get(faturaMY)
      const prev = byOrigem.get(origem)
      const amt = Number(amount) || 0
      if (!prev || amt > prev.amount) byOrigem.set(origem, { funcId: reservaFuncaoId, amount: amt })
    }

    toImport.forEach(row => {
      const saveDate = computeSaveDate(row)
      const isExpense = (row.type || 'expense') === 'expense'
      addFaturaAfetada(row.faturaMonthYear, saveDate)
      if (row.payee && !payees.includes(row.payee)) addPayee(row.payee)
      const txId = addTransaction({
        type: row.type || 'expense', accountId: selectedAccount, accountType: 'credit',
        amount: row.amount, date: saveDate, description: row.description,
        dateCartao: row._dateCartao || null,
        categoryId: row.categoryId, payee: row.payee,
        grupoGerencial: isExpense ? (row.grupoGerencial || defaultGrupoD) : null,
        faturaMonthYear: row.faturaMonthYear || null,
        reservaFuncaoId: row._reservaFuncaoId || null,
        installmentNum: row._installment?.num || null,
        installmentTotal: row._installment?.total || null,
        _fromImport: true,
      })
      txIds.push(txId)
      // Rateio: grava os rateios desta linha para o lançamento recém-criado.
      if (txId && row._rateios?.length > 0) saveRateiosFor(txId, row._rateios)
      // AJUSTE 2: cada despesa preenchida vira uma regra de classificação (contém = descrição),
      // se ainda não houver uma regra com essa mesma descrição. (Estornos/receitas não geram regra.)
      if (isExpense && row.categoryId) {
        const ruleContains = (row.description || '').trim()
        const key = ruleContains.toLowerCase()
        if (ruleContains && !ruleContainsSeen.has(key)) {
          ruleContainsSeen.add(key)
          addRule({ contains: ruleContains, categoryId: row.categoryId, payee: row.payee || null, grupoGerencial: row.grupoGerencial || null, reservaFuncaoId: row._reservaFuncaoId || null })
        }
      }
      if (row.grupoGerencial) {
        // Item 8: a etapa A (transferência imediata do Grupo G) não é mais criada aqui —
        // o motor (reconcileFaturaState) a deriva no recálculo abaixo, com id determinístico
        // (tx_gerA_<id>) e só para a fatura do ciclo atual.
        processarLancamentoGerencial(
          { accountId: selectedAccount, amount: row.amount, date: saveDate, description: row.description, faturaMonthYear: row.faturaMonthYear },
          row.grupoGerencial, null, { immediate: true }
        )
        // Vínculo de função de reserva → agendamento de resgate desta fatura.
        registrarReservaFuncao(row.faturaMonthYear, row.grupoGerencial, row._reservaFuncaoId, row.amount)
      }

    })

    // Parcelas futuras (seção secundária): cria as AUSENTES no banco herdando a
    // categoria/gerencial da parcela importada; as já existentes não são alteradas.
    futureParcelas.forEach(fp => {
      if (fp._exists) return
      if (isDuplicateInstallment({ description: fp.description, amount: fp.amount }, transactions, selectedAccount)) return
      // fp.date já é a data de sistema correta (parcela >1 → dia financialMonthStartDay do mês
      // anterior à fatura). NÃO clampar ao período da própria fatura. date_cartao fica null (projeção).
      const fpDate = fp.date
      addFaturaAfetada(fp.faturaMonthYear, fpDate)
      if (fp.payee && !payees.includes(fp.payee)) addPayee(fp.payee)
      const fId = addTransaction({
        type: 'expense', accountId: selectedAccount, accountType: 'credit',
        amount: fp.amount, date: fpDate, description: fp.description,
        categoryId: fp.categoryId, payee: fp.payee,
        grupoGerencial: fp.grupoGerencial || defaultGrupoD,
        faturaMonthYear: fp.faturaMonthYear,
        reservaFuncaoId: fp._reservaFuncaoId || null,
        installmentNum: fp.num, installmentTotal: fp.total,
        _fromImport: true,
      })
      if (fId) txIds.push(fId)
      // PARTE 2: parcela futura herda o mesmo rateio da parcela principal (parent).
      const parentRow = resolvedRows.find(r => r._id === fp.parentId)
      if (fId && parentRow?._rateios?.length > 0) saveRateiosFor(fId, parentRow._rateios)
      if (fp.grupoGerencial) {
        // Futura: só os agendamentos (resgate + pagamento) da própria fatura, sem
        // transferência imediata — esta ocorre quando a parcela cair no mês dela.
        processarLancamentoGerencial(
          { accountId: selectedAccount, amount: fp.amount, date: fpDate, description: fp.description, faturaMonthYear: fp.faturaMonthYear },
          fp.grupoGerencial, null, { immediate: false }
        )
        // Função de reserva replicada da parcela base → agendamento de resgate da fatura da parcela.
        registrarReservaFuncao(fp.faturaMonthYear, fp.grupoGerencial, fp._reservaFuncaoId, fp.amount)
      }
    })

    // Item 7: colisões por installment_key — ATUALIZA o lançamento existente (UPDATE) em
    // vez de inserir/pular. Só as confirmadas (não desmarcadas pelo usuário na prévia).
    const collisionsToApply = resolvedRows.filter(r => r._collisionTx && !collisionSkip.has(r._id))
    collisionsToApply.forEach(row => {
      const tx = row._collisionTx
      const saveDate = computeSaveDate(row)
      addFaturaAfetada(row.faturaMonthYear, saveDate)
      updateTransaction(tx.id, {
        date: saveDate,
        dateCartao: row._dateCartao || tx.dateCartao || null,
        categoryId: row.categoryId || null,
        grupoGerencial: row.grupoGerencial || null,
        faturaMonthYear: row.faturaMonthYear || null,
        reservaFuncaoId: row._reservaFuncaoId || null,
      })
      if (row._rateios?.length > 0) saveRateiosFor(tx.id, row._rateios)
      if (row.grupoGerencial) registrarReservaFuncao(row.faturaMonthYear, row.grupoGerencial, row._reservaFuncaoId, row.amount)
    })

    if (toImport.length > 0) {
      const dates = toImport.map(r => computeSaveDate(r)).sort()
      const mesAno = faturaMonthYear || dates[0]?.slice(0, 7)
      const importId = 'imp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
      // Não geramos mais contas_a_pagar legadas de fatura; os agendamentos acumulativos
      // (tipo='pagamento_fatura') são reconstruídos no loop de recalcularAgendamentosFatura abaixo.
      addCardImport({
        id: importId,
        importedAt: new Date().toISOString(),
        count: toImport.length,
        mesAno: mesAno || '',
        filename,
        accountId: selectedAccount,
        txIds,
      })
    }

    // Gatilho: recálculo acumulativo dos agendamentos (devolução gerencial / resgate /
    // pagamento) de TODA fatura tocada — por inserções novas OU por colisões atualizadas.
    for (const fmy of faturasAfetadas) {
      const [y, m] = fmy.split('-')
      const byOrigem = reservaFuncaoPorFatura.get(fmy)
      const reservaFuncaoByAccount = byOrigem
        ? Object.fromEntries([...byOrigem].map(([origem, v]) => [origem, v.funcId]))
        : undefined
      recalcularAgendamentosFatura(selectedAccount, y, m, reservaFuncaoByAccount)
    }

    const totalProcessed = toImport.length + collisionsToApply.length
    const pending = []
    toImport.forEach(row => {
      const saveDate = computeSaveDate(row)
      const s = findMatchingSchedule({ type: 'expense', accountType: 'credit', amount: row.amount, payee: row.payee, description: row.description, date: saveDate })
      if (s) pending.push({ schedule: s, tx: { type: 'expense', accountType: 'credit', amount: row.amount, payee: row.payee, description: row.description, date: saveDate } })
    })

    if (pending.length > 0) { setScheduleMatchQueue(pending); setResult(totalProcessed); setRows([]); setCollisionSkip(new Set()); return }
    setResult(totalProcessed)
    setRows([])
    setCollisionSkip(new Set())
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
  const toImportCount = resolvedRows.filter(r => r.selected && !r._isDuplicate && !r._collisionTx).length
  // Item 7: linhas que colidem com parcela já existente (mesma installment_key).
  const collisionRows = resolvedRows.filter(r => r._collisionTx)
  const collisionsToApplyCount = collisionRows.filter(r => !collisionSkip.has(r._id)).length

  // ── Corrigir Datas (modo reedição) ───────────────────────────────────────
  // Para cada lançamento do lote (tx_ids da importação) com date_cartao preenchida,
  // calcula a data corrigida = dia de fechamento do mês/ano da fatura_ref. Lançamentos
  // manuais (date_cartao = null) são ignorados; date_cartao nunca é alterada.
  const corrigirPreview = useMemo(() => {
    if (!editingImport) return []
    const closingDay = selectedAcc?.closingDay
    const idSet = new Set(editingImport.txIds || [])
    return transactions
      .filter(t => idSet.has(t.id) && t.type !== 'transfer' && t.dateCartao)
      .map(t => {
        const corrected = correctedDateForFatura(t.faturaMonthYear, closingDay)
        return {
          id: t.id,
          description: t.description || '',
          faturaRef: t.faturaMonthYear || '',
          dataAtual: t.date,
          dataCorrigida: corrected,
          changed: !!corrected && corrected !== t.date,
        }
      })
  }, [editingImport, transactions, selectedAcc])

  const corrigirChangedCount = corrigirPreview.filter(p => p.changed).length

  const handleCorrigirDatas = () => {
    const changed = corrigirPreview.filter(p => p.changed)
    changed.forEach(p => updateTransaction(p.id, { date: p.dataCorrigida }))
    // Reflete a correção nas linhas em edição (estado local) sem precisar recarregar.
    if (changed.length > 0) {
      const byId = new Map(changed.map(p => [p.id, p.dataCorrigida]))
      setRows(prev => prev.map(r => byId.has(r._id) ? { ...r, date: byId.get(r._id) } : r))
    }
    // Recalcula os agendamentos gerenciais de cada fatura distinta afetada
    // (mesmo cartão da importação + cada fatura_mes_ano único).
    const faturas = new Set(changed.map(p => p.faturaRef).filter(Boolean))
    for (const f of faturas) {
      const [y, m] = f.split('-')
      recalcularAgendamentosFatura(editingImport.accountId, y, m)
    }
    setShowCorrigirDatas(false)
    setCorrigirToast(`${changed.length} data${changed.length !== 1 ? 's' : ''} corrigida${changed.length !== 1 ? 's' : ''}`)
  }

  // Totalizador da fatura (atualiza em tempo real conforme os checkboxes):
  //   importar  = despesas "Novo" selecionadas | jaExistem = despesas "Duplicado"
  //   estornos  = receitas dentro da fatura (abatidas do total)
  //   total     = despesas - estornos  (pagamentos de fatura já são filtrados no parse)
  const totais = useMemo(() => {
    let importar = 0, jaExistem = 0, estornos = 0
    for (const r of resolvedRows) {
      const val = Number(r.amount) || 0
      if (r.type === 'income') { estornos += val; continue }
      if (r._isDuplicate) jaExistem += val
      else if (r.selected) importar += val
    }
    return { importar, jaExistem, estornos, total: importar + jaExistem - estornos }
  }, [resolvedRows])

  // ── Conciliação de Fatura ──────────────────────────────────────────────────
  // Normaliza descrição p/ comparação (trim, lower, colapsa espaços).
  const normDesc = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ')

  // Lançamentos da fatura já existentes no sistema (despesas + estornos do cartão/mês).
  const faturaItensSistema = (cardId, mesAno) => {
    const card = accounts.find(a => a.id === cardId)
    if (!card || !mesAno) return []
    const closingDay = card.closingDay || 14
    const billKeyOf = (t) => t.faturaMonthYear || calcFatura(t.date, closingDay)
    return transactions.filter(t =>
      t.accountId === cardId &&
      (t.type === 'expense' || t.type === 'income') &&
      billKeyOf(t) === mesAno
    )
  }

  // Monta as 3 seções comparando o CSV do Itaú com a fatura do sistema.
  const startConciliacao = async (file) => {
    setConcError('')
    if (!selectedAccount || !faturaMonthYear) {
      setConcError('Selecione o cartão e o mês de referência antes de conciliar.')
      return
    }
    try {
      setFilename(file.name)
      const text = await readFileAsText(file)
      if (!isItauCSV(text)) {
        setConcError('CSV não reconhecido. Verifique se é o formato de exportação do Itaú (colunas: data, lançamento, valor).')
        return
      }
      const { rows: csvRows } = parseItauCSV(text, categories)
      if (csvRows.length === 0) {
        setConcError('Nenhum lançamento encontrado no CSV.')
        return
      }

      // Classifica cada item do CSV (categoria/gerencial/favorecido) p/ o caso de importação.
      const grupoD = gerencialGroups.find(g => g.number === 'D')?.id || 'grp_D'
      let idCtr = 0
      const csvClassified = csvRows.map(row => {
        const rowDay = new Date(row.date + 'T00:00:00').getDate()
        const classified = classifyByRules(row.description, { dayOfMonth: rowDay, amountApprox: row.amount })
        const isParcelado = !!detectInstallment(row.description)
        const grupo = classified?.grupoGerencial || classifyGerencialByRules(row.description, row.amount, isParcelado) || grupoD
        const funcsDoGrupo = reserveFuncsForGroup(grupo)
        const reservaFuncaoFromRule = (classified?.reservaFuncaoId
          && funcsDoGrupo.length > 1
          && funcsDoGrupo.some(f => f.id === classified.reservaFuncaoId))
          ? classified.reservaFuncaoId : null
        return {
          ...row,
          _id: `conc_${idCtr++}`,
          categoryId: classified?.categoryId || row.categoryId || '',
          payee: classified?.payee || row.payee || row.description || '',
          grupoGerencial: grupo,
          _reservaFuncaoId: reservaFuncaoFromRule,
          _installment: detectInstallment(row.description) || null,
          _dateCartao: row.date,
          acao: 'importar',
        }
      })

      // Lançamentos do sistema para esta fatura.
      const sysItens = faturaItensSistema(selectedAccount, faturaMonthYear)

      // Match guloso 1:1 por descrição (normalizada) + valor (tolerância R$ 0,50) + tipo.
      const usedSys = new Set()
      const matched = []
      const soItau = []
      for (const c of csvClassified) {
        const sys = sysItens.find(t =>
          !usedSys.has(t.id) &&
          t.type === c.type &&
          Math.abs((Number(t.amount) || 0) - (Number(c.amount) || 0)) <= 0.50 &&
          normDesc(t.description) === normDesc(c.description)
        )
        if (sys) { usedSys.add(sys.id); matched.push({ csv: c, sys }) }
        else soItau.push(c)
      }
      const soSistema = sysItens
        .filter(t => !usedSys.has(t.id))
        .map(t => ({ ...t, acao: 'manter' }))

      // Conciliação inteligente cruzada: pré-marca duplicatas entre os dois leftovers.
      const cross = crossMatchConciliacao(soItau, soSistema)

      setConcMatched(matched)
      setConcSoItau(cross.soItau)
      setConcSoSistema(cross.soSistema)
      setConciliarMode(true)
      setRows([])
      setResult(null)
    } catch (err) {
      setConcError('Erro ao ler arquivo: ' + err.message)
    }
  }

  const exitConciliacao = () => {
    setConciliarMode(false)
    setConcMatched([])
    setConcSoItau([])
    setConcSoSistema([])
    setConcError('')
  }

  // Base normalizada de um parcelado (para casar parcelas da mesma série).
  const concRootOf = (desc) => {
    const di = detectInstallment(desc || '')
    return (di ? di.base : (desc || '')).toLowerCase().trim()
  }
  const setItauField = (id, changes) =>
    setConcSoItau(prev => {
      const next = prev.map(i => i._id === id ? { ...i, ...changes } : i)
      // Ao escolher Função de Reserva numa parcela, propaga para as demais parcelas da MESMA
      // série (mesma base, mesmo grupo) que ainda não têm função definida.
      if ('_reservaFuncaoId' in changes && changes._reservaFuncaoId) {
        const alvo = next.find(i => i._id === id)
        if (alvo && detectInstallment(alvo.description)) {
          const root = concRootOf(alvo.description)
          return next.map(i =>
            i._id !== id && !i._reservaFuncaoId &&
            i.grupoGerencial === alvo.grupoGerencial &&
            detectInstallment(i.description) && concRootOf(i.description) === root
              ? { ...i, _reservaFuncaoId: changes._reservaFuncaoId }
              : i
          )
        }
      }
      return next
    })
  const setSistemaAcao = (id, acao) =>
    setConcSoSistema(prev => prev.map(i => i.id === id ? { ...i, acao } : i))

  // Totalizador em tempo real (sinal: despesa +, estorno/receita −).
  const concTotais = useMemo(() => {
    const sgn = (r) => (r.type === 'income' ? -1 : 1) * (Number(r.amount) || 0)
    let csv = 0, sistema = 0
    for (const m of concMatched) { csv += sgn(m.csv); sistema += sgn(m.sys) }
    for (const i of concSoItau) { csv += sgn(i); if (i.acao === 'importar') sistema += sgn(i) }
    for (const i of concSoSistema) { if (i.acao === 'manter') sistema += sgn(i) }
    return { csv, sistema, diff: csv - sistema }
  }, [concMatched, concSoItau, concSoSistema])

  // Importa um item "Só no Itaú" como lançamento da fatura (mesmo fluxo da importação normal).
  const importConcItem = (item) => {
    const closingDay = selectedAcc?.closingDay || 14
    const saveDate = clampDateToFatura(item.date, faturaMonthYear, closingDay)
    const isExpense = (item.type || 'expense') === 'expense'
    if (item.payee && !payees.includes(item.payee)) addPayee(item.payee)
    const txId = addTransaction({
      type: item.type || 'expense', accountId: selectedAccount, accountType: 'credit',
      amount: item.amount, date: saveDate, description: item.description,
      dateCartao: item._dateCartao || item.date || null,
      categoryId: item.categoryId, payee: item.payee,
      grupoGerencial: isExpense ? (item.grupoGerencial || defaultGrupoD) : null,
      reservaFuncaoId: isExpense ? (item._reservaFuncaoId || null) : null,
      installmentNum: item._installment?.num || null,
      installmentTotal: item._installment?.total || null,
      faturaMonthYear: faturaMonthYear || null,
      _fromImport: true,
    })
    if (isExpense && item.grupoGerencial) {
      processarLancamentoGerencial(
        { accountId: selectedAccount, amount: item.amount, date: saveDate, description: item.description, faturaMonthYear },
        item.grupoGerencial, null, { immediate: true }
      )
    }
    return txId
  }

  const confirmarConciliacao = () => {
    const importar = concSoItau.filter(i => i.acao === 'importar')
    const excluir = concSoSistema.filter(i => i.acao === 'excluir')

    const txIds = []
    importar.forEach(i => { const id = importConcItem(i); if (id) txIds.push(id) })
    excluir.forEach(i => deleteTransaction(i.id))

    // Função de reserva por (fatura → conta-origem), desempate pelo maior valor — mesmo
    // mecanismo da importação normal: o resgate de cada fatura adota a função escolhida.
    const funcPorFatura = new Map() // faturaMY → Map(origem → { funcId, amount })
    const registrarFunc = (faturaMY, grupoId, reservaFuncaoId, amount) => {
      if (!faturaMY || !reservaFuncaoId) return
      const grupo = gerencialGroups.find(g => g.id === grupoId)
      if (!grupo || typeof grupo.number !== 'number' || grupo.number === 1 || !grupo.defaultAccountId) return
      const origem = grupo.defaultAccountId
      const func = (reserveFunctions || []).find(f => f.id === reservaFuncaoId)
      if (!func || func.accountId !== origem) return
      if (!funcPorFatura.has(faturaMY)) funcPorFatura.set(faturaMY, new Map())
      const m = funcPorFatura.get(faturaMY)
      const amt = Number(amount) || 0
      const prev = m.get(origem)
      if (!prev || amt > prev.amount) m.set(origem, { funcId: reservaFuncaoId, amount: amt })
    }
    // Itens-base da própria fatura conciliada.
    for (const i of importar) {
      if ((i.type || 'expense') === 'expense' && i.grupoGerencial) {
        registrarFunc(faturaMonthYear, i.grupoGerencial, i._reservaFuncaoId, i.amount)
      }
    }

    // Parcelas futuras dos itens parcelados (mesma lógica do fluxo de importação normal):
    // cria as ausentes em faturas futuras, herdando categoria/grupo/favorecido/função.
    const dueDay = selectedAcc?.dueDay || null
    const closingDay = selectedAcc?.closingDay || 14
    const futurasFaturas = new Set()
    const seenFut = new Set()
    for (const item of importar) {
      const inst = item._installment
      if ((item.type || 'expense') !== 'expense' || !inst || inst.num >= inst.total) continue
      const base = inst.base.toLowerCase().trim()
      const numWidth = inst.matchStr ? inst.matchStr.split('/')[0].length : String(inst.total).length
      for (let k = inst.num + 1; k <= inst.total; k++) {
        const futFatura = addMonthToFatura(faturaMonthYear, k - inst.num)
        const dedupKey = `${base}|${k}|${futFatura}`
        if (seenFut.has(dedupKey)) continue
        seenFut.add(dedupKey)
        const futNumStr = String(k).padStart(numWidth, '0')
        const futDesc = inst.matchStr
          ? item.description.replace(inst.matchStr, `${futNumStr}/${inst.total}`)
          : `${item.description} ${futNumStr}/${inst.total}`
        if (findExistingParcela(inst, k, item.amount, selectedAccount, transactions)) continue
        if (isDuplicateInstallment({ description: futDesc, amount: item.amount }, transactions, selectedAccount)) continue
        const futDate = clampDateToFatura(faturaToDate(futFatura, dueDay) || `${futFatura}-01`, futFatura, closingDay)
        if (item.payee && !payees.includes(item.payee)) addPayee(item.payee)
        const fId = addTransaction({
          type: 'expense', accountId: selectedAccount, accountType: 'credit',
          amount: item.amount, date: futDate, description: futDesc,
          categoryId: item.categoryId, payee: item.payee,
          grupoGerencial: item.grupoGerencial || defaultGrupoD,
          reservaFuncaoId: item._reservaFuncaoId || null,
          faturaMonthYear: futFatura,
          installmentNum: k, installmentTotal: inst.total,
          _fromImport: true,
        })
        if (fId) txIds.push(fId)
        if (item.grupoGerencial) {
          processarLancamentoGerencial(
            { accountId: selectedAccount, amount: item.amount, date: futDate, description: futDesc, faturaMonthYear: futFatura },
            item.grupoGerencial, null, { immediate: false }
          )
          registrarFunc(futFatura, item.grupoGerencial, item._reservaFuncaoId, item.amount)
        }
        futurasFaturas.add(futFatura)
      }
    }

    const mapFor = (faturaMY) => {
      const m = funcPorFatura.get(faturaMY)
      return m ? Object.fromEntries([...m].map(([o, v]) => [o, v.funcId])) : undefined
    }

    // Recalcula os agendamentos acumulativos da fatura conciliada + de cada fatura futura afetada.
    if (faturaMonthYear) {
      const [y, m] = faturaMonthYear.split('-')
      recalcularAgendamentosFatura(selectedAccount, y, m, mapFor(faturaMonthYear))
    }
    for (const fmy of futurasFaturas) {
      if (fmy === faturaMonthYear) continue
      const [y, m] = fmy.split('-')
      recalcularAgendamentosFatura(selectedAccount, y, m, mapFor(fmy))
    }

    // Registra os importados no histórico (permite estornar como uma importação normal).
    if (txIds.length > 0) {
      addCardImport({
        id: 'imp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        importedAt: new Date().toISOString(),
        count: txIds.length,
        mesAno: faturaMonthYear || '',
        filename: `Conciliação · ${filename || 'Itaú CSV'}`,
        accountId: selectedAccount,
        txIds,
      })
    }

    const totalFinal = concTotais.sistema
    setConcToast(`Fatura conciliada. Total: ${fmt(totalFinal)}`)
    exitConciliacao()
  }

  // ── Render: Modo Conciliação ───────────────────────────────────────────────
  if (conciliarMode) {
    const importarCount = concSoItau.filter(i => i.acao === 'importar').length
    const excluirCount = concSoSistema.filter(i => i.acao === 'excluir').length
    const diffZero = Math.abs(concTotais.diff) < 0.005
    return (
      <div className="space-y-4">
        {/* Cabeçalho */}
        <div className="card flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-blue-400">
            <ArrowLeftRight size={16} />
            <span className="text-sm font-semibold">Conciliação de Fatura</span>
          </div>
          <span className="text-xs text-gray-500">
            {selectedAcc?.apelido || selectedAcc?.name} · {faturaMonthYear?.split('-').reverse().join('/')}
            {filename ? ` · ${filename}` : ''}
          </span>
          <button className="ml-auto btn-secondary text-xs py-1.5" onClick={exitConciliacao}>
            <X size={12} className="mr-1 inline" /> Sair
          </button>
        </div>

        {/* Totalizador */}
        <div className="card flex flex-wrap items-center gap-x-6 gap-y-2 py-3">
          <div className="flex items-baseline gap-2">
            <span className="text-xs text-gray-500">Total CSV Itaú:</span>
            <span className="text-sm font-semibold text-gray-200">{fmt(concTotais.csv)}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xs text-gray-500">Total sistema (após ações):</span>
            <span className="text-sm font-semibold text-gray-200">{fmt(concTotais.sistema)}</span>
          </div>
          <div className="flex items-baseline gap-2 sm:ml-auto">
            <span className="text-xs text-gray-400">Diferença:</span>
            <span className={`text-lg font-bold ${diffZero ? 'text-blue-400' : 'text-orange-500'}`}>
              {fmt(concTotais.diff)}
            </span>
            {diffZero && <Check size={16} className="text-blue-400" />}
          </div>
        </div>

        {concError && <div className="flex items-center gap-2 text-orange-600 text-sm"><AlertCircle size={14} /> {concError}</div>}

        {/* Ação */}
        <div className="flex items-center justify-end gap-2">
          <span className="text-xs text-gray-500 mr-auto">
            {concMatched.length} conciliado{concMatched.length !== 1 ? 's' : ''} ·
            {' '}{importarCount} a importar · {excluirCount} a excluir
          </span>
          <button className="btn-secondary text-xs py-1.5" onClick={exitConciliacao}>Cancelar</button>
          <button
            className="btn-primary flex items-center gap-1.5 text-xs py-1.5"
            disabled={importarCount === 0 && excluirCount === 0}
            onClick={confirmarConciliacao}
          >
            <Check size={12} /> Confirmar Conciliação
          </button>
        </div>

        {/* SEÇÃO B — Só no Itaú */}
        <div className="card p-0 overflow-hidden">
          <div className="px-3 py-2.5 border-b border-gray-800 bg-emerald-950/30 flex items-center gap-2 flex-wrap">
            <ArrowDownCircle size={13} className="text-emerald-400 shrink-0" />
            <h3 className="text-xs font-semibold text-emerald-300">Só no Itaú — falta no sistema</h3>
            <span className="text-[10px] text-gray-500">{concSoItau.length} item{concSoItau.length !== 1 ? 's' : ''}</span>
          </div>
          {concSoItau.length === 0 ? (
            <p className="text-xs text-gray-600 px-4 py-4">Nenhum item exclusivo do Itaú.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium">Data</th>
                    <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium">Descrição</th>
                    <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium">Categoria</th>
                    <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium hidden md:table-cell">Ger.</th>
                    <th className="text-right px-3 py-2.5 text-xs text-gray-400 font-medium">Valor</th>
                    <th className="text-center px-3 py-2.5 text-xs text-gray-400 font-medium">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {concSoItau.map(item => (
                    <tr
                      key={item._id}
                      onClick={(e) => { if (e.target.closest('input,select,button,textarea,label,a')) return; openHistory(item.description) }}
                      title="Ver histórico do fornecedor"
                      className={`border-b border-gray-800/50 cursor-pointer hover:bg-gray-800/30 ${item.acao !== 'importar' ? 'opacity-40' : ''}`}
                    >
                      <td className="px-3 py-2 text-xs text-gray-400 whitespace-nowrap">{item.date?.split('-').reverse().join('/')}</td>
                      <td className="px-3 py-2 max-w-xs">
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-gray-200 truncate" title={item.description}>{item.description}</span>
                          <div className="flex items-center gap-1.5">
                            <InstallmentControl
                              installment={item._installment}
                              description={item.description}
                              onChange={inst => setItauField(item._id, { _installment: inst })}
                            />
                            <CrossBadge level={item._crossLevel} />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <CategorySelect
                          categories={categories}
                          className="bg-gray-800 border border-gray-700 text-gray-200 rounded px-2 py-1 text-xs focus:outline-none w-36"
                          value={item.categoryId}
                          onChange={e => setItauField(item._id, { categoryId: e.target.value })}
                          searchable
                        />
                      </td>
                      <td className="px-3 py-2 hidden md:table-cell">
                        <select
                          className="bg-gray-800 border border-gray-700 text-gray-200 rounded px-2 py-1 text-xs focus:outline-none w-24"
                          value={item.grupoGerencial}
                          onChange={e => setItauField(item._id, { grupoGerencial: e.target.value, _reservaFuncaoId: null })}
                        >
                          {sortedGrupos.map(g => <option key={g.id} value={g.id}>{g.number} · {g.name}</option>)}
                        </select>
                        {(() => {
                          // Grupo numerado com mais de uma função de reserva na conta-origem:
                          // escolhe de qual função vem o resgate (gravado no agendamento via recalc).
                          const funcs = reserveFuncsForGroup(item.grupoGerencial)
                          if (funcs.length <= 1) return null
                          return (
                            <select
                              className="mt-1 block bg-gray-800 border border-gray-700 text-gray-300 rounded px-2 py-1 text-xs focus:outline-none w-24"
                              value={item._reservaFuncaoId || ''}
                              onChange={e => setItauField(item._id, { _reservaFuncaoId: e.target.value || null })}
                              title="Função de reserva do resgate"
                            >
                              <option value="">— Selecionar —</option>
                              {funcs.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                            </select>
                          )
                        })()}
                      </td>
                      <td className={`px-3 py-2 text-right text-xs font-semibold whitespace-nowrap ${item.type === 'income' ? 'text-blue-600' : 'text-orange-600'}`}>
                        {fmt(item.amount)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-3 text-xs">
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input type="radio" className="accent-[#0F6E56]" name={`itau_${item._id}`}
                              checked={item.acao === 'importar'} onChange={() => setItauField(item._id, { acao: 'importar' })} />
                            <span className="text-emerald-400">Importar</span>
                          </label>
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input type="radio" className="accent-gray-500" name={`itau_${item._id}`}
                              checked={item.acao === 'ignorar'} onChange={() => setItauField(item._id, { acao: 'ignorar' })} />
                            <span className="text-gray-400">Ignorar</span>
                          </label>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* SEÇÃO C — Só no sistema */}
        <div className="card p-0 overflow-hidden">
          <div className="px-3 py-2.5 border-b border-gray-800 bg-orange-950/30 flex items-center gap-2 flex-wrap">
            <ArrowUpCircle size={13} className="text-orange-400 shrink-0" />
            <h3 className="text-xs font-semibold text-orange-300">Só no sistema — não está no CSV do Itaú</h3>
            <span className="text-[10px] text-gray-500">{concSoSistema.length} item{concSoSistema.length !== 1 ? 's' : ''}</span>
          </div>
          {concSoSistema.length === 0 ? (
            <p className="text-xs text-gray-600 px-4 py-4">Nenhum item exclusivo do sistema.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium">Data</th>
                    <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium">Descrição</th>
                    <th className="text-right px-3 py-2.5 text-xs text-gray-400 font-medium">Valor</th>
                    <th className="text-center px-3 py-2.5 text-xs text-gray-400 font-medium">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {concSoSistema.map(item => (
                    <tr
                      key={item.id}
                      onClick={(e) => { if (e.target.closest('input,select,button,textarea,label,a')) return; openHistory(item.description) }}
                      title="Ver histórico do fornecedor"
                      className={`border-b border-gray-800/50 cursor-pointer hover:bg-gray-800/30 ${item.acao === 'excluir' ? 'opacity-40 bg-orange-500/5' : ''}`}
                    >
                      <td className="px-3 py-2 text-xs text-gray-400 whitespace-nowrap">{item.date?.split('-').reverse().join('/')}</td>
                      <td className="px-3 py-2 max-w-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-gray-200 truncate" title={item.description}>{item.description}</span>
                          <CrossBadge level={item._crossLevel} />
                        </div>
                      </td>
                      <td className={`px-3 py-2 text-right text-xs font-semibold whitespace-nowrap ${item.type === 'income' ? 'text-blue-600' : 'text-orange-600'}`}>
                        {fmt(item.amount)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-3 text-xs">
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input type="radio" className="accent-[#0F6E56]" name={`sys_${item.id}`}
                              checked={item.acao === 'manter'} onChange={() => setSistemaAcao(item.id, 'manter')} />
                            <span className="text-gray-300">Manter</span>
                          </label>
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input type="radio" className="accent-orange-500" name={`sys_${item.id}`}
                              checked={item.acao === 'excluir'} onChange={() => setSistemaAcao(item.id, 'excluir')} />
                            <span className="text-orange-400">Excluir</span>
                          </label>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* SEÇÃO A — Conciliados */}
        <div className="card p-0 overflow-hidden">
          <div className="px-3 py-2.5 border-b border-gray-800 bg-gray-800/40 flex items-center gap-2 flex-wrap">
            <Check size={13} className="text-gray-400 shrink-0" />
            <h3 className="text-xs font-semibold text-gray-300">Conciliados</h3>
            <span className="text-[10px] text-gray-500">{concMatched.length} item{concMatched.length !== 1 ? 's' : ''} · sem ação necessária</span>
          </div>
          {concMatched.length === 0 ? (
            <p className="text-xs text-gray-600 px-4 py-4">Nenhum item conciliado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left px-3 py-2.5 text-xs text-gray-500 font-medium">Data</th>
                    <th className="text-left px-3 py-2.5 text-xs text-gray-500 font-medium">Descrição</th>
                    <th className="text-right px-3 py-2.5 text-xs text-gray-500 font-medium">Valor Itaú</th>
                    <th className="text-right px-3 py-2.5 text-xs text-gray-500 font-medium">Valor sistema</th>
                    <th className="text-center px-3 py-2.5 text-xs text-gray-500 font-medium w-10">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {concMatched.map(m => (
                    <tr
                      key={m.sys.id}
                      onClick={(e) => { if (e.target.closest('input,select,button,textarea,label,a')) return; openHistory(m.csv.description) }}
                      title="Ver histórico do fornecedor"
                      className="border-b border-gray-800/40 text-gray-400 cursor-pointer hover:bg-gray-800/30"
                    >
                      <td className="px-3 py-2 text-xs whitespace-nowrap">{m.csv.date?.split('-').reverse().join('/')}</td>
                      <td className="px-3 py-2 text-xs max-w-xs truncate" title={m.csv.description}>{m.csv.description}</td>
                      <td className="px-3 py-2 text-right text-xs whitespace-nowrap">{fmt(m.csv.amount)}</td>
                      <td className="px-3 py-2 text-right text-xs whitespace-nowrap">{fmt(m.sys.amount)}</td>
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => setConcEditTx(m.sys)}
                          title="Editar lançamento"
                          className="p-1 text-gray-500 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors"
                        >
                          <Pencil size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <Modal open={!!concEditTx} onClose={() => setConcEditTx(null)} title="Editar Lançamento" size="lg">
          <TransactionForm initial={concEditTx} onClose={() => setConcEditTx(null)} />
        </Modal>

        <TransactionHistoryModal state={historyModal} onClose={() => setHistoryModal(null)} />

        {concToast && <Toast message={concToast} onClose={() => setConcToast(null)} />}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {showBatchFill && (
        <BatchFillModal
          categories={categories}
          sortedGrupos={sortedGrupos}
          reserveFuncsForGroup={reserveFuncsForGroup}
          onApply={applyBatchFill}
          onClose={() => setShowBatchFill(false)}
        />
      )}

      {rateioRow && (
        <RateioModal
          total={Number(rateioRow.amount) || 0}
          categories={categories}
          categoryType={rateioRow.type === 'income' ? 'income' : 'expense'}
          initial={rateioRow._rateios || []}
          onSave={rs => { updateRow(rateioRow._id, { _rateios: rs }); setRateioRow(null) }}
          onDeleteAll={() => { updateRow(rateioRow._id, { _rateios: [] }); setRateioRow(null) }}
          onClose={() => setRateioRow(null)}
        />
      )}

      {/* Melhoria 2: histórico do fornecedor (últimas 5 ocorrências) ao clicar na linha. */}
      <TransactionHistoryModal state={historyModal} onClose={() => setHistoryModal(null)} />

      {showCorrigirDatas && editingImport && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCorrigirDatas(false)} />
          <div className="relative bg-surface border border-gray-700 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh]">
            <div className="px-5 py-4 border-b border-gray-800">
              <h3 className="text-sm font-semibold text-gray-100">
                Correção de datas — {corrigirPreview.length} lançamento{corrigirPreview.length !== 1 ? 's' : ''}
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                A data de cada lançamento vai para o dia de fechamento ({selectedAcc?.closingDay || '—'}) do mês da fatura. A data original do banco é preservada.
              </p>
            </div>
            <div className="overflow-y-auto flex-1">
              {corrigirPreview.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-10">Nenhum lançamento elegível neste lote.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface">
                    <tr className="border-b border-gray-800">
                      <th className="text-left px-4 py-2.5 text-xs text-gray-400 font-medium">Descrição</th>
                      <th className="text-left px-4 py-2.5 text-xs text-gray-400 font-medium">Fatura</th>
                      <th className="text-left px-4 py-2.5 text-xs text-gray-400 font-medium">Data atual</th>
                      <th className="text-left px-4 py-2.5 text-xs text-gray-400 font-medium">Data corrigida</th>
                    </tr>
                  </thead>
                  <tbody>
                    {corrigirPreview.map(p => (
                      <tr key={p.id} className={`border-b border-gray-800/50 ${p.changed ? '' : 'text-gray-600'}`}>
                        <td className="px-4 py-2 max-w-xs truncate" title={p.description}>{p.description}</td>
                        <td className="px-4 py-2 text-xs whitespace-nowrap">{p.faturaRef ? p.faturaRef.split('-').reverse().join('/') : '—'}</td>
                        <td className="px-4 py-2 text-xs whitespace-nowrap">{fmtDate(p.dataAtual)}</td>
                        <td className={`px-4 py-2 text-xs whitespace-nowrap ${p.changed ? 'text-emerald-400 font-medium' : ''}`}>
                          {p.changed ? fmtDate(p.dataCorrigida) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="px-5 py-4 border-t border-gray-800 flex items-center justify-between gap-3">
              <span className="text-xs text-gray-400">
                {corrigirChangedCount} data{corrigirChangedCount !== 1 ? 's' : ''} ser{corrigirChangedCount !== 1 ? 'ão' : 'á'} corrigida{corrigirChangedCount !== 1 ? 's' : ''}
              </span>
              <div className="flex gap-3">
                <button className="btn-secondary text-sm" onClick={() => setShowCorrigirDatas(false)}>Cancelar</button>
                <button className="btn-primary text-sm" disabled={corrigirChangedCount === 0} onClick={handleCorrigirDatas}>Confirmar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {matchQueue.length > 0 && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-surface border border-gray-700 rounded-2xl shadow-2xl w-full max-w-lg p-5 space-y-4">
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
          {/* Cartão + mês de referência (usados na conciliação; na importação normal o
              arquivo detecta automaticamente e sobrescreve). */}
          <div className="card grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Cartão</label>
              <select className="input" value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)}>
                <AccountOptions accounts={creditAccounts} accountGroups={accountGroups} placeholder="Selecione o cartão..." />
              </select>
            </div>
            <div>
              <label className="label">Mês de Referência</label>
              <select className="input" value={faturaMonthYear} onChange={e => setFaturaMonthYear(e.target.value)}>
                <option value="">Selecione...</option>
                {MONTH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <DropZone
            onFile={handleFile}
            label="Selecionar arquivo de Cartão de Crédito (XLS/XLSX/CSV)"
            subtitle="Formato Dindin (XLS) ou Itaú (CSV) — fatura detectada automaticamente"
            accept=".xlsx,.xls,.csv"
          />

          {/* Conciliar Fatura: compara o CSV do Itaú com a fatura já existente no sistema. */}
          <div className="flex items-center gap-3 flex-wrap">
            <input
              ref={concFileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={e => { if (e.target.files[0]) { startConciliacao(e.target.files[0]); e.target.value = '' } }}
            />
            <button
              className="btn-secondary flex items-center gap-1.5 text-xs py-1.5"
              disabled={!selectedAccount || !faturaMonthYear}
              onClick={() => concFileRef.current?.click()}
              title={!selectedAccount || !faturaMonthYear ? 'Selecione o cartão e o mês de referência' : 'Conciliar fatura com CSV do Itaú'}
            >
              <ArrowLeftRight size={12} /> Conciliar Fatura
            </button>
            <span className="text-xs text-gray-600">
              Compara o CSV do Itaú com os lançamentos já existentes na fatura selecionada.
            </span>
          </div>

          {error && <div className="flex items-center gap-2 text-orange-600 text-sm"><AlertCircle size={14} /> {error}</div>}
          {concError && <div className="flex items-center gap-2 text-orange-600 text-sm"><AlertCircle size={14} /> {concError}</div>}
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="card">
            {editingImport && (
              <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs">
                <Pencil size={12} />
                <span>Modo de reedição — {editingImport.filename || 'importação anterior'} · {editingImport.count} lançamento{editingImport.count !== 1 ? 's' : ''}</span>
                <div className="ml-auto flex items-center gap-3">
                  <button className="text-blue-300 hover:text-blue-100 font-medium" onClick={() => setShowCorrigirDatas(true)}>🗓 Corrigir Datas</button>
                  <button className="text-blue-500 hover:text-blue-300" onClick={() => { setEditingImport(null); setRows([]) }}>Cancelar</button>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="label">Cartão de Destino</label>
                <select className="input" value={selectedAccount} disabled={!!editingImport} onChange={e => handleAccountChange(e.target.value)}>
                  <AccountOptions accounts={creditAccounts} accountGroups={accountGroups} placeholder="Selecione o cartão..." />
                </select>
              </div>
              <div>
                <label className="label">Mês de Referência</label>
                <select className="input" value={faturaMonthYear} onChange={e => handleFaturaMonthYearChange(e.target.value)}>
                  <option value="">Selecione...</option>
                  {MONTH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="flex items-end gap-4 pb-1">
                {cardInfo.cardName && <div><p className="label">Cartão detectado</p><p className="text-sm text-gray-200">{cardInfo.cardName}</p></div>}
                {cardInfo.faturaStr && <div><p className="label">Fatura (arquivo)</p><p className="text-sm text-gray-200">{cardInfo.faturaStr}</p></div>}
              </div>
            </div>
          </div>

          {/* Totalizador da fatura */}
          <div className="card flex flex-wrap items-center gap-x-5 gap-y-2 py-3">
            <div className="flex items-baseline gap-2">
              <span className="text-xs text-gray-500">Total a ser importado:</span>
              <span className="text-sm font-semibold text-receita">{fmt(totais.importar)}</span>
            </div>
            <span className="text-gray-600 font-medium">+</span>
            <div className="flex items-baseline gap-2">
              <span className="text-xs text-gray-500">Já existem:</span>
              <span className="text-sm font-semibold text-orange-500">{fmt(totais.jaExistem)}</span>
            </div>
            {totais.estornos > 0 && (
              <>
                <span className="text-gray-600 font-medium">−</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-xs text-gray-500">Estornos:</span>
                  <span className="text-sm font-semibold text-despesa">{fmt(totais.estornos)}</span>
                </div>
              </>
            )}
            <span className="text-gray-600 font-medium">=</span>
            <div className="flex items-baseline gap-2 sm:ml-auto">
              <span className="text-xs text-gray-400">Total da fatura:</span>
              <span className="text-lg font-bold text-gray-100">{fmt(totais.total)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between flex-wrap gap-3">
            <SummaryBar found={found} toImport={toImportCount} duplicates={dups} />
            <div className="flex gap-2">
              {!editingImport && (
                <button className="btn-secondary flex items-center gap-1.5 text-xs py-1.5" onClick={autoClassify}>
                  <Wand2 size={12} /> Classificar Auto
                </button>
              )}
              {!editingImport && (
                <button className="btn-secondary flex items-center gap-1.5 text-xs py-1.5" onClick={() => setShowBatchFill(true)}>
                  <Layers size={12} /> Preencher em Lote
                </button>
              )}
              <button className="btn-secondary text-xs py-1.5" onClick={() => { setRows([]); setEditingImport(null) }}>
                <X size={12} className="mr-1 inline" /> Cancelar
              </button>
              <button
                className="btn-primary flex items-center gap-1.5 text-xs py-1.5"
                disabled={(toImportCount === 0 && collisionsToApplyCount === 0) || !selectedAccount}
                onClick={handleImport}
              >
                <Save size={12} /> {editingImport
                  ? `Salvar (${toImportCount})`
                  : `Confirmar (${toImportCount}${collisionsToApplyCount > 0 ? ` +${collisionsToApplyCount}↻` : ''})`}
              </button>
            </div>
          </div>

          <div className="card p-0 overflow-hidden">
            <GerencialTotalizer txs={resolvedRows} gerencialGroups={gerencialGroups} />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="px-3 py-2.5 w-8">
                      <input type="checkbox" className="accent-[#0F6E56]"
                        checked={(() => { const sel = resolvedRows.filter(r => !r._dupLevel && !r._collisionTx); return sel.length > 0 && sel.every(r => r.selected) })()}
                        onChange={e => toggleAll(e.target.checked)} />
                    </th>
                    <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium">Data Sistema</th>
                    <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium">Data Cartão</th>
                    <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium">Fatura</th>
                    <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium">Descrição</th>
                    <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium">Categoria</th>
                    <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium hidden md:table-cell">Ger.</th>
                    <th className="text-right px-3 py-2.5 text-xs text-gray-400 font-medium">Valor</th>
                    <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {resolvedRows.map(row => (
                    <tr
                      key={row._id}
                      onClick={(e) => { if (e.target.closest('input,select,button,textarea,label,a')) return; openHistory(row.description) }}
                      title="Ver histórico do fornecedor"
                      className={`border-b border-gray-800/50 cursor-pointer hover:bg-gray-800/30 ${!row.selected ? 'opacity-40' : ''} ${row._dupLevel === 'certeza' ? 'bg-red-500/5' : row._dupLevel ? 'bg-amber-500/5' : ''} ${row._collisionTx ? 'bg-amber-500/5' : ''}`}
                    >
                      <td className="px-3 py-2">
                        <input type="checkbox" className="accent-[#0F6E56]"
                          checked={row.selected} disabled={row._dupLevel === 'certeza' || !!row._collisionTx}
                          onChange={() => { (row._dupLevel === 'provavel' || row._dupLevel === 'possivel') ? toggleForcedDup(row._id) : toggleRow(row._id) }} />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <DateInput
                          className="bg-gray-800 border border-gray-700 text-gray-300 rounded px-1.5 py-0.5 text-xs focus:outline-none w-32"
                          value={row.date || ''}
                          onChange={e => updateRow(row._id, { date: e.target.value })}
                        />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <DateInput
                          className="bg-gray-800 border border-gray-700 text-gray-400 rounded px-1.5 py-0.5 text-xs focus:outline-none w-32"
                          value={row._dateCartao || ''}
                          onChange={e => updateRow(row._id, { _dateCartao: e.target.value || null })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          className="bg-gray-800 border border-gray-700 text-gray-200 rounded px-1.5 py-0.5 text-xs focus:outline-none"
                          value={row.faturaMonthYear || ''}
                          onChange={e => updateRow(row._id, { faturaMonthYear: e.target.value })}
                        >
                          <option value="">—</option>
                          {MONTH_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.value.split('-').reverse().join('/')}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-gray-200 max-w-xs">
                        <div className="flex items-center gap-1.5">
                          <input className="bg-transparent text-xs focus:outline-none focus:bg-gray-800 rounded px-1 min-w-0 flex-1"
                            value={row.description}
                            onChange={e => updateRow(row._id, { description: e.target.value })} />
                          <InstallmentControl
                            installment={row._installment}
                            description={row.description}
                            onChange={inst => updateRow(row._id, { _installment: inst })}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          {row._rateios?.length > 0 ? (
                            <span className="text-xs text-gray-300 bg-gray-700/50 rounded px-2 py-1 whitespace-nowrap w-36 inline-block truncate" title={`${row._rateios.length} categorias separadas`}>
                              {row._rateios.length} separadas
                            </span>
                          ) : (
                            <CategorySelect
                              categories={categories}
                              className="bg-gray-800 border border-gray-700 text-gray-200 rounded px-2 py-1 text-xs focus:outline-none w-36"
                              value={row.categoryId}
                              onChange={e => { updateRow(row._id, { categoryId: e.target.value }); if (e.target.value) learnClassification(row.description, e.target.value, row.payee, { dayOfMonth: new Date(row.date + 'T00:00:00').getDate(), amountApprox: row.amount, grupoGerencial: row.grupoGerencial, reservaFuncaoId: row._reservaFuncaoId }) }}
                              searchable
                            />
                          )}
                          <button type="button" onClick={() => setRateioRow(row)} title="Separar em categorias" className="text-[10px] text-indigo-400 hover:text-indigo-300 shrink-0">Separar</button>
                        </div>
                      </td>
                      <td className="px-3 py-2 hidden md:table-cell">
                        <select
                          className="bg-gray-800 border border-gray-700 text-gray-200 rounded px-2 py-1 text-xs focus:outline-none w-24"
                          value={row.grupoGerencial}
                          onChange={e => updateRow(row._id, { grupoGerencial: e.target.value, _reservaFuncaoId: null })}
                        >
                          {sortedGrupos.map(g => <option key={g.id} value={g.id}>{g.number} · {g.name}</option>)}
                        </select>
                        {(() => {
                          // Grupo numerado com mais de uma função de reserva na conta-origem:
                          // permite escolher de qual função virá o resgate (gravado no agendamento).
                          const funcs = reserveFuncsForGroup(row.grupoGerencial)
                          if (funcs.length <= 1) return null
                          return (
                            <select
                              className="mt-1 block bg-gray-800 border border-gray-700 text-gray-300 rounded px-2 py-1 text-xs focus:outline-none w-24"
                              value={row._reservaFuncaoId || ''}
                              onChange={e => updateRow(row._id, { _reservaFuncaoId: e.target.value || null })}
                              title="Função de reserva do resgate"
                            >
                              <option value="">— Selecionar —</option>
                              {funcs.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                            </select>
                          )
                        })()}
                      </td>
                      <td className={`px-3 py-2 text-right text-xs font-semibold whitespace-nowrap ${row.isDeposit ? 'text-blue-600' : 'text-orange-600'}`}>
                        {fmt(row.amount)}
                      </td>
                      <td className="px-3 py-2">
                        {row._collisionTx
                          ? <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400" title="Já existe no banco (mesma installment_key) — ver seção 'atualizar?'">No banco ↻</span>
                          : row._dupLevel === 'certeza'
                            ? <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400" title="date_cartao + valor + descrição idênticos — já existe na fatura">🔴 Já existe</span>
                            : row._dupLevel === 'provavel'
                              ? <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400" title="date_cartao + valor iguais e descrição similar — pode importar marcando">🟠 Provável duplicata</span>
                              : row._dupLevel === 'possivel'
                                ? <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-500" title="valor e descrição similares (data ignorada) — pode importar marcando">🟡 Possível duplicata</span>
                                : <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">Novo</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Item 7: parcelas que JÁ existem no banco (mesma installment_key) — prévia
              antes/depois e confirmação item a item; aplicar = UPDATE, não INSERT. */}
          {collisionRows.length > 0 && (
            <div className="card p-0 overflow-hidden">
              <div className="px-3 py-2.5 border-b border-gray-800 bg-amber-950/30 flex items-center gap-2 flex-wrap">
                <Layers size={13} className="text-amber-400 shrink-0" />
                <h3 className="text-xs font-semibold text-amber-300">Parcelas já no banco — atualizar?</h3>
                <span className="text-[10px] text-gray-500">
                  {collisionRows.length} colisã{collisionRows.length !== 1 ? 'ões' : 'o'} (mesma installment_key)
                  {' · '}{collisionsToApplyCount} marcada{collisionsToApplyCount !== 1 ? 's' : ''} p/ atualizar
                </span>
              </div>
              <div className="divide-y divide-gray-800">
                {collisionRows.map(r => {
                  const tx = r._collisionTx
                  const apply = !collisionSkip.has(r._id)
                  const nm = (arr, id) => (id && arr.find(x => x.id === id)?.name) || '—'
                  const dt = (s) => (s || '').split('-').reverse().join('/')
                  const fields = [
                    ['Data', dt(tx.date), dt(r.date)],
                    ['Valor', fmt(tx.amount), fmt(r.amount)],
                    ['Categoria', nm(categories, tx.categoryId), nm(categories, r.categoryId)],
                    ['Grupo', nm(gerencialGroups, tx.grupoGerencial), nm(gerencialGroups, r.grupoGerencial)],
                    ['Reserva', nm(reserveFunctions, tx.reservaFuncaoId), nm(reserveFunctions, r._reservaFuncaoId)],
                  ]
                  return (
                    <div key={r._id} className={`px-3 py-2.5 ${apply ? '' : 'opacity-50'}`}>
                      <label className="flex items-center gap-2 mb-1.5 cursor-pointer">
                        <input type="checkbox" checked={apply} onChange={() => toggleCollision(r._id)} className="accent-amber-500" />
                        <span className="text-xs text-gray-300 truncate">{r.description}</span>
                        {r._installment && (
                          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">{r._installment.num}/{r._installment.total}</span>
                        )}
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-x-3 gap-y-1 pl-6">
                        {fields.map(([label, before, after]) => {
                          const changed = before !== after
                          return (
                            <div key={label} className="text-[11px] min-w-0">
                              <div className="text-gray-600">{label}</div>
                              {changed ? (
                                <div className="flex items-center gap-1 flex-wrap">
                                  <span className="text-gray-500 line-through truncate">{before}</span>
                                  <span className="text-amber-300 truncate">→ {after}</span>
                                </div>
                              ) : (
                                <div className="text-gray-400 truncate">{before}</div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Parcelas de faturas futuras — somente informativo (não importadas agora) */}
          {futureParcelas.length > 0 && (
            <div className="card p-0 overflow-hidden">
              <div className="px-3 py-2.5 border-b border-gray-800 bg-indigo-950/30 flex items-center gap-2 flex-wrap">
                <Layers size={13} className="text-indigo-400 shrink-0" />
                <h3 className="text-xs font-semibold text-indigo-300">Parcelas de faturas futuras — não serão importadas agora</h3>
                <span className="text-[10px] text-gray-500">
                  {futureParcelas.length} parcela{futureParcelas.length !== 1 ? 's' : ''}
                  {' · '}{futureParcelas.filter(f => !f._exists).length} a criar
                  {' · '}{futureParcelas.filter(f => f._exists).length} já existe{futureParcelas.filter(f => f._exists).length !== 1 ? 'm' : ''}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left px-3 py-2.5 text-xs text-gray-500 font-medium">Data</th>
                      <th className="text-left px-3 py-2.5 text-xs text-gray-500 font-medium">Fatura</th>
                      <th className="text-left px-3 py-2.5 text-xs text-gray-500 font-medium">Descrição</th>
                      <th className="text-left px-3 py-2.5 text-xs text-gray-500 font-medium">Categoria</th>
                      <th className="text-left px-3 py-2.5 text-xs text-gray-500 font-medium hidden md:table-cell">Ger.</th>
                      <th className="text-right px-3 py-2.5 text-xs text-gray-500 font-medium">Valor</th>
                      <th className="text-left px-3 py-2.5 text-xs text-gray-500 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {futureParcelas.map(fp => {
                      const cat = categories.find(c => c.id === fp.categoryId)
                      const ger = gerencialGroups.find(g => g.id === fp.grupoGerencial)
                      return (
                        <tr key={fp._id} className="border-b border-gray-800/40 opacity-70">
                          <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{fp.date?.split('-').reverse().join('/')}</td>
                          <td className="px-3 py-2 text-xs text-gray-400 whitespace-nowrap">{fp.faturaMonthYear?.split('-').reverse().join('/')}</td>
                          <td className="px-3 py-2 text-gray-300 max-w-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-xs">{fp.description}</span>
                              <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400">{fp.num}/{fp.total}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-400">{cat ? `${cat.icon} ${cat.name}` : <span className="text-gray-600">—</span>}</td>
                          <td className="px-3 py-2 text-xs text-gray-400 hidden md:table-cell">{ger ? `${ger.number} · ${ger.name}` : <span className="text-gray-600">—</span>}</td>
                          <td className="px-3 py-2 text-right text-xs font-semibold text-gray-400 whitespace-nowrap">{fmt(fp.amount)}</td>
                          <td className="px-3 py-2">
                            {fp._exists
                              ? <span className="text-xs px-1.5 py-0.5 rounded bg-gray-600/30 text-gray-400">Já existe</span>
                              : <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300">Será criada</span>
                            }
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

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
                <div
                  key={imp.id}
                  className="flex items-center gap-3 text-xs py-1.5 border-b border-gray-800/50 last:border-0 cursor-pointer hover:bg-gray-800/30 rounded px-1 -mx-1 transition-colors"
                  onClick={() => loadImportForEdit(imp)}
                >
                  <span className="text-gray-500 shrink-0 w-32">{dateStr}</span>
                  <span className="text-gray-300 truncate flex-1 min-w-0" title={imp.filename}>{imp.filename || '—'}</span>
                  <span className="text-gray-400 shrink-0">{imp.count} lançamento{imp.count !== 1 ? 's' : ''}</span>
                  <span className="text-gray-500 shrink-0">{mesAnoFmt}</span>
                  <span className="text-gray-500 shrink-0 hidden sm:inline">{acc?.apelido || acc?.name || '—'}</span>
                  <button
                    className="shrink-0 flex items-center gap-1 text-xs text-blue-500 hover:text-blue-400 border border-blue-500/30 hover:border-blue-400/50 rounded px-2 py-0.5 transition-colors"
                    onClick={e => { e.stopPropagation(); loadImportForEdit(imp) }}
                  >
                    <Pencil size={11} /> Editar
                  </button>
                  <button
                    className="shrink-0 flex items-center gap-1 text-xs text-orange-500 hover:text-orange-400 border border-orange-500/30 hover:border-orange-400/50 rounded px-2 py-0.5 transition-colors"
                    onClick={e => { e.stopPropagation(); setConfirmRevertId(imp.id) }}
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

      {corrigirToast && <Toast message={corrigirToast} onClose={() => setCorrigirToast(null)} />}
    </div>
  )
}

// ─── Painel principal ─────────────────────────────────────────────────────────

export default function ImportPanel() {
  const { profileAccounts: accounts, accountGroups, profileTransactions: transactions } = useApp()
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
