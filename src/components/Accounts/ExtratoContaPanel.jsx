import { useState, useMemo } from 'react'
import {
  ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, ChevronDown, ChevronUp,
  ChevronLeft, ChevronRight, X, Undo2, Edit2, Copy, Plus, Trash2, CheckCircle2, Circle, CheckSquare,
} from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate, EMPTY_LANC_FILTROS, hasLancFiltros, matchLancFiltros } from '../shared/utils'
import ConfirmDialog from '../shared/ConfirmDialog'
import Toast from '../shared/Toast'
import LancamentoFiltros from '../shared/LancamentoFiltros'
import ReconciliarModal from '../shared/ReconciliarModal'

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

// Computes the account balance just before `fromDate` by reversing
// all transactions from that date onward.
function balanceAt(account, allTransactions, fromDate) {
  let b = account.balance || 0
  allTransactions.forEach(tx => {
    if (tx.date < fromDate) return
    if (tx.accountId === account.id) {
      if (tx.type === 'income') b -= tx.amount
      if (tx.type === 'expense') b += tx.amount
      if (tx.type === 'transfer') b += tx.amount
      if (tx.type === 'credit_payment') b -= tx.amount
    }
    if (tx.toAccountId === account.id) {
      if (tx.type === 'transfer' || tx.type === 'credit_payment') b -= tx.amount
    }
  })
  return Math.round(b * 100) / 100
}

// Netiza múltiplas transferências RECEBIDAS de uma mesma conta de aplicação
// (contaAplicacao=true) no mesmo dia — agrupando-as numa única linha líquida no
// extrato da conta que RECEBE. Aditivo: só agrupa linhas 'single' de transferência
// entrante cuja origem é conta de aplicação; preserva a ordem cronológica colocando
// a linha netizada na posição da primeira ocorrência do grupo.
function netCAIncoming(rows, accountId, aplicacaoIds) {
  if (!aplicacaoIds || aplicacaoIds.size === 0) return rows

  const groups = {}
  rows.forEach((row, idx) => {
    if (row.kind !== 'single') return
    const tx = row.tx
    if (tx.type === 'transfer' && tx.toAccountId === accountId && aplicacaoIds.has(tx.accountId)) {
      const key = `${tx.date}|${tx.accountId}`
      ;(groups[key] = groups[key] || []).push({ idx, tx })
    }
  })

  const toNet = Object.values(groups).filter(g => g.length >= 2)
  if (toNet.length === 0) return rows

  const insertAt = {}
  const drop = new Set()
  toNet.forEach(g => {
    const txs = g.map(x => x.tx)
    const netFlow = Math.round(txs.reduce((s, t) => s + t.amount, 0) * 100) / 100
    insertAt[g[0].idx] = {
      kind: 'netted', txs, date: txs[0].date, netFlow,
      otherAccountId: txs[0].accountId, caIncoming: true,
    }
    g.forEach((x, i) => { if (i > 0) drop.add(x.idx) })
  })

  const result = []
  rows.forEach((row, idx) => {
    if (insertAt[idx]) result.push(insertAt[idx])
    else if (!drop.has(idx)) result.push(row)
  })
  return result
}

// Builds display rows for the extract. Netiza transferências opostas (round-trip)
// do mesmo dia quando contaAplicacao=true (conta de aplicação), e — via netCAIncoming
// — também netiza múltiplas transferências recebidas de uma mesma conta de aplicação
// no extrato da conta destino.
function buildRows(transactions, accountId, netize, aplicacaoIds) {
  const relevant = transactions
    .filter(tx => tx.accountId === accountId || tx.toAccountId === accountId)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || ''))

  let rows
  if (!netize) {
    rows = relevant.map(tx => ({ kind: 'single', tx }))
  } else {
    const byDate = {}
    relevant.forEach(tx => {
      ;(byDate[tx.date] = byDate[tx.date] || []).push(tx)
    })

    rows = []
    Object.keys(byDate).sort().forEach(date => {
      const dayTxs = byDate[date]
      const processed = new Set()

      dayTxs.forEach(tx => {
        if (processed.has(tx.id)) return
        if (tx.type !== 'transfer') {
          rows.push({ kind: 'single', tx })
          processed.add(tx.id)
          return
        }

        const opposing = dayTxs.find(t =>
          !processed.has(t.id) &&
          t.id !== tx.id &&
          t.type === 'transfer' &&
          t.accountId === tx.toAccountId &&
          t.toAccountId === tx.accountId
        )

        if (!opposing) {
          rows.push({ kind: 'single', tx })
          processed.add(tx.id)
          return
        }

        const flow = (t) => (t.toAccountId === accountId ? t.amount : -t.amount)
        const netFlow = Math.round((flow(tx) + flow(opposing)) * 100) / 100
        const otherAccountId = tx.accountId === accountId ? tx.toAccountId : tx.accountId

        rows.push({ kind: 'netted', txs: [tx, opposing], date, netFlow, otherAccountId })
        processed.add(tx.id)
        processed.add(opposing.id)
      })
    })
  }

  return netCAIncoming(rows, accountId, aplicacaoIds)
}

// Computes the entry/exit delta for a single transaction relative to accountId.
function txDelta(tx, accountId) {
  if (tx.type === 'income' && tx.accountId === accountId) return tx.amount
  if (tx.type === 'expense' && tx.accountId === accountId) return -tx.amount
  if (tx.type === 'transfer' || tx.type === 'credit_payment') {
    if (tx.toAccountId === accountId) return tx.amount
    if (tx.accountId === accountId) return -tx.amount
  }
  return 0
}

function AccountName({ id, accounts, fallback = '—' }) {
  const acc = accounts.find(a => a.id === id)
  return <span>{acc ? (acc.apelido || acc.name) : fallback}</span>
}

// Ícone clicável de reconciliação para a coluna "R".
function ReconcileBtn({ reconciled, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={reconciled ? 'Reconciliado — clique para desmarcar' : 'Marcar como reconciliado'}
      className="p-1 rounded hover:bg-gray-700/50 transition-colors"
    >
      {reconciled
        ? <CheckCircle2 size={15} className="text-emerald-500" />
        : <Circle size={15} className="text-gray-600 hover:text-gray-400" />}
    </button>
  )
}

function SingleRow({ row, accountId, accounts, balance, onReverse, onEdit, onDuplicate, onDelete, onToggleReconcile, todayStr }) {
  const { tx } = row
  const delta = txDelta(tx, accountId)
  const isIn = delta > 0
  const isTransfer = tx.type === 'transfer' || tx.type === 'credit_payment'

  let deId = null, paraId = null, deLabel = null, paraLabel = null
  if (isTransfer) {
    deId = tx.accountId; paraId = tx.toAccountId
  } else if (tx.type === 'income') {
    deLabel = tx.payee || 'Receita'; paraId = accountId
  } else {
    deId = accountId; paraLabel = tx.payee || 'Despesa'
  }

  let badge = null
  if (todayStr && tx.date > todayStr) {
    if (tx.scheduleId || tx.origin === 'agendamento')
      badge = { label: 'Agendamento', cls: 'bg-sky-500/20 text-sky-400' }
    else if (tx.grupoGerencial)
      badge = { label: 'Gerencial', cls: 'bg-violet-500/20 text-violet-400' }
    else if (tx.reservaAuto)
      badge = { label: 'Reserva', cls: 'bg-teal-500/20 text-teal-400' }
    else
      badge = { label: 'Futuro', cls: 'bg-gray-500/20 text-gray-400' }
  }

  return (
    <tr
      className={`border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors cursor-pointer group ${tx.reconciled ? 'opacity-70' : ''}`}
      onClick={() => onEdit && onEdit(tx)}
    >
      <td className="px-3 py-2.5 text-xs text-gray-400 truncate">{fmtDate(tx.date)}</td>
      <td className="px-3 py-2.5 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
          {isTransfer
            ? <ArrowLeftRight size={12} className="text-gray-500 shrink-0" />
            : isIn
              ? <ArrowDownCircle size={12} className="text-blue-600 shrink-0" />
              : <ArrowUpCircle size={12} className="text-orange-600 shrink-0" />
          }
          <span className="text-xs text-gray-200 truncate">{tx.description || (tx.type === 'income' ? 'Receita' : tx.type === 'expense' ? 'Despesa' : 'Transferência')}</span>
          {badge && <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 font-medium ${badge.cls}`}>{badge.label}</span>}
        </div>
      </td>
      <td className="px-3 py-2.5 text-xs text-gray-400 truncate">{tx.payee || ''}</td>
      <td className="px-3 py-2.5 text-xs text-gray-400 truncate">
        {deId ? <AccountName id={deId} accounts={accounts} /> : deLabel}
      </td>
      <td className="px-3 py-2.5 text-xs text-gray-400 truncate">
        {paraId ? <AccountName id={paraId} accounts={accounts} /> : paraLabel}
      </td>
      <td className="px-3 py-2.5 text-right text-xs font-semibold text-blue-600 whitespace-nowrap">
        {isIn ? fmt(Math.abs(delta)) : ''}
      </td>
      <td className="px-3 py-2.5 text-right text-xs font-semibold text-orange-600 whitespace-nowrap">
        {!isIn ? fmt(Math.abs(delta)) : ''}
      </td>
      <td className={`px-3 py-2.5 text-right text-xs font-bold whitespace-nowrap ${balance >= 0 ? 'text-gray-300' : 'text-orange-600'}`}>
        {fmt(balance)}
      </td>
      <td className="px-2 py-2.5">
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {onEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(tx) }}
              title="Editar lançamento"
              className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-blue-400/10 rounded transition-colors"
            >
              <Edit2 size={14} />
            </button>
          )}
          {onDuplicate && !tx.reservaAuto && (
            <button
              onClick={(e) => { e.stopPropagation(); onDuplicate(tx) }}
              title="Duplicar lançamento (+30 dias)"
              className="p-1.5 text-gray-500 hover:text-emerald-400 hover:bg-emerald-400/10 rounded transition-colors"
            >
              <Copy size={14} />
            </button>
          )}
          {onReverse && !tx.reservaAuto && (
            <button
              onClick={(e) => { e.stopPropagation(); onReverse(tx) }}
              title="Estornar lançamento"
              className="p-1.5 text-gray-500 hover:text-amber-400 hover:bg-amber-400/10 rounded transition-colors"
            >
              <Undo2 size={14} />
            </button>
          )}
          {onDelete && !tx.reservaAuto && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(tx) }}
              title="Excluir lançamento"
              className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </td>
      <td className="px-1 py-2.5 text-center">
        <ReconcileBtn
          reconciled={!!tx.reconciled}
          onClick={(e) => { e.stopPropagation(); onToggleReconcile([tx.id], !tx.reconciled) }}
        />
      </td>
    </tr>
  )
}

function NettedRow({ row, accountId, accounts, balance, onToggleReconcile }) {
  const [open, setOpen] = useState(false)
  const { netFlow, otherAccountId, txs } = row
  const isIn = netFlow > 0
  const otherAcc = accounts.find(a => a.id === otherAccountId)
  const otherName = otherAcc ? (otherAcc.apelido || otherAcc.name) : '?'
  const thisAcc = accounts.find(a => a.id === accountId)
  const thisName = thisAcc ? (thisAcc.apelido || thisAcc.name) : '?'
  const allReconciled = txs.every(t => t.reconciled)

  return (
    <>
      <tr
        className={`border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors cursor-pointer select-none bg-indigo-500/5 ${allReconciled ? 'opacity-70' : ''}`}
        onClick={() => setOpen(v => !v)}
      >
        <td className="px-3 py-2.5 text-xs text-gray-400 truncate">{fmtDate(row.date)}</td>
        <td className="px-3 py-2.5 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
            <ArrowLeftRight size={12} className="text-indigo-400 shrink-0" />
            <span className="text-xs text-gray-200 truncate">Transf. líquida</span>
            <span className="text-xs text-indigo-400 ml-1 shrink-0">({txs.length} mov.)</span>
            {row.caIncoming && (
              <span className="text-xs bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded shrink-0 font-medium">
                {otherName} · netizado
              </span>
            )}
          </div>
        </td>
        <td />
        <td className="px-3 py-2.5 text-xs text-gray-400 truncate">{isIn ? otherName : thisName}</td>
        <td className="px-3 py-2.5 text-xs text-gray-400 truncate">{isIn ? thisName : otherName}</td>
        <td className="px-3 py-2.5 text-right text-xs font-semibold text-blue-600 whitespace-nowrap">
          {isIn ? fmt(Math.abs(netFlow)) : ''}
        </td>
        <td className="px-3 py-2.5 text-right text-xs font-semibold text-orange-600 whitespace-nowrap">
          {!isIn ? fmt(Math.abs(netFlow)) : ''}
        </td>
        <td className={`px-3 py-2.5 text-right text-xs font-bold whitespace-nowrap ${balance >= 0 ? 'text-gray-300' : 'text-orange-600'}`}>
          {fmt(balance)}
        </td>
        <td className="px-3 py-2.5 text-center">
          {open ? <ChevronUp size={12} className="text-indigo-400" /> : <ChevronDown size={12} className="text-indigo-400" />}
        </td>
        <td className="px-1 py-2.5 text-center">
          <ReconcileBtn
            reconciled={allReconciled}
            onClick={(e) => { e.stopPropagation(); onToggleReconcile(txs.map(t => t.id), !allReconciled) }}
          />
        </td>
      </tr>
      {open && txs.map(tx => {
        const delta = txDelta(tx, accountId)
        const isInSub = delta > 0
        const fromAcc = accounts.find(a => a.id === tx.accountId)
        const toAcc = accounts.find(a => a.id === tx.toAccountId)
        return (
          <tr key={tx.id} className="border-b border-gray-800/30 bg-indigo-500/5">
            <td className="px-3 py-1.5 pl-8 text-xs text-gray-600 truncate">{fmtDate(tx.date)}</td>
            <td className="px-3 py-1.5 pl-2 text-xs text-gray-500 italic truncate">
              {tx.description || 'Transferência'}
            </td>
            <td />
            <td className="px-3 py-1.5 text-xs text-gray-500 truncate">
              {fromAcc ? (fromAcc.apelido || fromAcc.name) : '—'}
            </td>
            <td className="px-3 py-1.5 text-xs text-gray-500 truncate">
              {toAcc ? (toAcc.apelido || toAcc.name) : '—'}
            </td>
            <td className="px-3 py-1.5 text-right text-xs text-blue-600/70 whitespace-nowrap">
              {isInSub ? fmt(Math.abs(delta)) : ''}
            </td>
            <td className="px-3 py-1.5 text-right text-xs text-orange-600/70 whitespace-nowrap">
              {!isInSub ? fmt(Math.abs(delta)) : ''}
            </td>
            <td colSpan={3} />
          </tr>
        )
      })}
    </>
  )
}

export default function ExtratoContaPanel({ account: accountProp, onClose, onEdit, onNewTx, onDelete, backButton }) {
  const { transactions, accounts, reverseTransaction, deleteTransaction, getFinancialPeriod, setReconciled } = useApp()
  // Always derive account from live context so balance stays current after new transactions
  const account = accounts.find(a => a.id === accountProp.id) || accountProp

  const now = new Date()
  const defaultMonth = (() => {
    try {
      const fp = getFinancialPeriod()
      return fp.start.toISOString().slice(0, 7)
    } catch {
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    }
  })()

  const [selectedMonth, setSelectedMonth] = useState(defaultMonth)

  const [year, month] = selectedMonth.split('-').map(Number)
  const from = `${selectedMonth}-01`
  const to = new Date(year, month, 0).toISOString().split('T')[0]
  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`

  const prevMonth = () => {
    const d = new Date(year, month - 2, 1)
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const nextMonth = () => {
    const d = new Date(year, month, 1)
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const [confirmEstorno, setConfirmEstorno] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [toast, setToast] = useState(null)

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000) }

  const handleReverse = (tx) => {
    reverseTransaction(tx.id)
    setConfirmEstorno(null)
    const msg = tx.scheduleId
      ? `Lançamento estornado. Agendamento restaurado para ${fmtDate(tx.date)}.`
      : 'Lançamento estornado.'
    showToast(msg)
  }

  const handleDelete = (tx) => {
    if (onDelete) onDelete(tx.id)
    else deleteTransaction(tx.id)
    setConfirmDelete(null)
  }

  const handleDuplicate = (tx) => {
    if (!onEdit) return
    const d = new Date(tx.date + 'T00:00:00')
    d.setDate(d.getDate() + 30)
    const newDate = d.toISOString().split('T')[0]
    // eslint-disable-next-line no-unused-vars
    const { id, createdAt, scheduleId, origin, grupoGerencial, gerencialScheduleId, reservaAuto, ...rest } = tx
    onEdit({ ...rest, date: newDate })
  }

  const todayStr = now.toISOString().split('T')[0]
  const isAplicacao = !!account.contaAplicacao

  const filteredTxs = useMemo(() =>
    transactions.filter(tx => tx.date >= from && tx.date <= to),
    [transactions, from, to]
  )

  const aplicacaoIds = useMemo(
    () => new Set(accounts.filter(a => a.contaAplicacao).map(a => a.id)),
    [accounts]
  )

  const rows = useMemo(
    () => buildRows(filteredTxs, account.id, isAplicacao, aplicacaoIds),
    [filteredTxs, account.id, isAplicacao, aplicacaoIds]
  )

  const startBalance = useMemo(() => balanceAt(account, transactions, from), [account, transactions, from])

  const rowsWithBalance = useMemo(() => {
    let b = startBalance
    return rows.map(row => {
      if (row.kind === 'single') {
        b = Math.round((b + txDelta(row.tx, account.id)) * 100) / 100
      } else {
        b = Math.round((b + row.netFlow) * 100) / 100
      }
      return { ...row, runningBalance: b }
    })
  }, [rows, startBalance, account.id])

  // Reconciliação — lançamentos NÃO reconciliados do período (mês) em exibição.
  const [showReconciliar, setShowReconciliar] = useState(false)
  const periodPending = useMemo(
    () => filteredTxs
      .filter(tx => (tx.accountId === account.id || tx.toAccountId === account.id) && !tx.reconciled)
      .sort((a, b) => a.date.localeCompare(b.date)),
    [filteredTxs, account.id]
  )

  // Filtros em tempo real — afetam apenas as linhas exibidas; os totais do header
  // continuam calculados sobre o período completo (rowsWithBalance).
  const [filtros, setFiltros] = useState(EMPTY_LANC_FILTROS)
  const displayRows = useMemo(() => {
    if (!hasLancFiltros(filtros)) return rowsWithBalance
    return rowsWithBalance.filter(row =>
      row.kind === 'netted'
        ? row.txs.some(tx => matchLancFiltros(tx, filtros, accounts))
        : matchLancFiltros(row.tx, filtros, accounts)
    )
  }, [rowsWithBalance, filtros, accounts])

  const totals = useMemo(() => {
    let entrada = 0, saida = 0
    rowsWithBalance.forEach(row => {
      const delta = row.kind === 'single'
        ? txDelta(row.tx, account.id)
        : row.netFlow
      if (delta > 0) entrada += delta
      else saida += Math.abs(delta)
    })
    return { entrada: Math.round(entrada * 100) / 100, saida: Math.round(saida * 100) / 100 }
  }, [rowsWithBalance, account.id])

  const finalBalance = rowsWithBalance[rowsWithBalance.length - 1]?.runningBalance ?? startBalance

  const colGroup = (
    <colgroup>
      <col style={{ width: '84px' }} />
      <col />
      <col style={{ width: '64px' }} />
      <col style={{ width: '82px' }} />
      <col style={{ width: '82px' }} />
      <col style={{ width: '88px' }} />
      <col style={{ width: '88px' }} />
      <col style={{ width: '92px' }} />
      <col style={{ width: '100px' }} />
      <col style={{ width: '40px' }} />
    </colgroup>
  )

  return (
    <div>
      {/* ── Sticky block: title · filters · KPIs · table header ── */}
      <div className="sticky top-0 z-10 bg-gray-950">
        <div className="space-y-3 pb-3">
          {/* Title row */}
          <div className="flex items-center gap-3">
            {backButton && onClose && (
              <button
                onClick={onClose}
                className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors shrink-0"
              >
                <ChevronLeft size={16} /> Voltar
              </button>
            )}
            <h2 className="text-sm font-semibold text-gray-200 truncate flex-1">
              {account.apelido || account.name}
              {isAplicacao && (
                <span className="ml-2 text-xs bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded font-normal">Aplicação · netizado</span>
              )}
            </h2>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setShowReconciliar(true)}
                className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5"
                title="Reconciliar transações do período"
              >
                <CheckSquare size={12} /> Reconciliar
              </button>
              {onNewTx && (
                <button onClick={onNewTx} className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5">
                  <Plus size={12} /> Novo Lançamento
                </button>
              )}
              {!backButton && onClose && (
                <button onClick={onClose} className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Month navigator */}
          <div className="flex items-center gap-1">
            <button
              onClick={prevMonth}
              className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="text-sm font-medium text-gray-200 min-w-[90px] text-center">{monthLabel}</span>
            <button
              onClick={nextMonth}
              className="p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
            >
              <ChevronRight size={15} />
            </button>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="card">
              <p className="text-xs text-gray-400 uppercase mb-1">Saldo Atual</p>
              <p className={`text-lg font-bold ${(account.balance || 0) >= 0 ? 'text-gray-200' : 'text-orange-600'}`}>{fmt(account.balance || 0)}</p>
            </div>
            <div className="card">
              <div className="flex items-center gap-2 mb-1 text-blue-600"><ArrowDownCircle size={13} /><p className="text-xs text-gray-400 uppercase">Entradas</p></div>
              <p className="text-lg font-bold text-blue-600">{fmt(totals.entrada)}</p>
            </div>
            <div className="card">
              <div className="flex items-center gap-2 mb-1 text-orange-600"><ArrowUpCircle size={13} /><p className="text-xs text-gray-400 uppercase">Saídas</p></div>
              <p className="text-lg font-bold text-orange-600">{fmt(totals.saida)}</p>
            </div>
          </div>
        </div>

        {/* Table column header */}
        <div className="bg-gray-900 border-x border-t border-gray-800 rounded-t-xl overflow-hidden">
          <table className="w-full text-sm table-fixed">
            {colGroup}
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium whitespace-nowrap">Data</th>
                <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium">Histórico</th>
                <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium truncate overflow-hidden">Favorecido</th>
                <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium truncate overflow-hidden">Conta De</th>
                <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium truncate overflow-hidden">Conta Para</th>
                <th className="text-right px-3 py-2.5 text-xs text-blue-600 font-medium whitespace-nowrap">
                  <span className="flex items-center justify-end gap-1"><ArrowDownCircle size={10} /> Entrada</span>
                </th>
                <th className="text-right px-3 py-2.5 text-xs text-orange-600 font-medium whitespace-nowrap">
                  <span className="flex items-center justify-end gap-1"><ArrowUpCircle size={10} /> Saída</span>
                </th>
                <th className="text-right px-3 py-2.5 text-xs text-gray-400 font-medium whitespace-nowrap">Saldo</th>
                <th className="w-8" />
                <th className="text-center px-1 py-2.5 text-xs text-gray-400 font-medium" title="Reconciliado">R</th>
              </tr>
            </thead>
          </table>
        </div>

        {/* Filtros em tempo real (abaixo do header da tabela) */}
        <div className="border-x border-gray-800 bg-gray-900">
          <LancamentoFiltros filtros={filtros} setFiltros={setFiltros} />
        </div>
      </div>

      {/* ── Table body ── */}
      <div className="bg-gray-900 border-x border-b border-gray-800 rounded-b-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm table-fixed">
            {colGroup}
            <tbody>
              {/* Starting balance row */}
              <tr className="border-b border-gray-800/50 bg-gray-800/20">
                <td className="px-3 py-2 text-xs text-gray-600">{fmtDate(from)}</td>
                <td className="px-3 py-2 text-xs text-gray-500 italic" colSpan={6}>Saldo inicial do período</td>
                <td className={`px-3 py-2 text-right text-xs font-bold ${startBalance >= 0 ? 'text-gray-400' : 'text-orange-600'}`}>
                  {fmt(startBalance)}
                </td>
                <td colSpan={2} />
              </tr>
              {displayRows.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center py-10 text-gray-500 text-xs">
                    {hasLancFiltros(filtros) ? 'Nenhum lançamento corresponde aos filtros' : 'Nenhum lançamento no período'}
                  </td>
                </tr>
              )}
              {displayRows.map((row, i) =>
                row.kind === 'netted' ? (
                  <NettedRow key={i} row={row} accountId={account.id} accounts={accounts} balance={row.runningBalance} onToggleReconcile={setReconciled} />
                ) : (
                  <SingleRow
                    key={i}
                    row={row}
                    accountId={account.id}
                    accounts={accounts}
                    balance={row.runningBalance}
                    onReverse={setConfirmEstorno}
                    onEdit={onEdit}
                    onDuplicate={onEdit ? handleDuplicate : null}
                    onDelete={setConfirmDelete}
                    onToggleReconcile={setReconciled}
                    todayStr={todayStr}
                  />
                )
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmEstorno}
        onClose={() => setConfirmEstorno(null)}
        onConfirm={() => handleReverse(confirmEstorno)}
        title="Estornar Lançamento"
        message={
          confirmEstorno?.scheduleId
            ? `Estornar este lançamento? O agendamento voltará para pendente na data ${fmtDate(confirmEstorno?.date)}.`
            : 'Estornar este lançamento? Esta ação não pode ser desfeita.'
        }
        confirmLabel="Confirmar Estorno"
        danger
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => handleDelete(confirmDelete)}
        title="Excluir Lançamento"
        message="Excluir este lançamento permanentemente? Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        danger
      />

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      {showReconciliar && (
        <ReconciliarModal
          items={periodPending}
          onApply={setReconciled}
          onClose={() => setShowReconciliar(false)}
        />
      )}
    </div>
  )
}
