import { useState, useMemo } from 'react'
import { ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, ChevronDown, ChevronUp, X, Undo2, Edit2, Copy } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'
import ConfirmDialog from '../shared/ConfirmDialog'
import Toast from '../shared/Toast'

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

// Builds display rows for the extract, netting opposing same-date transfers
// when contaAplicacao=true.
function buildRows(transactions, accountId, netize) {
  const relevant = transactions
    .filter(tx => tx.accountId === accountId || tx.toAccountId === accountId)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || ''))

  if (!netize) return relevant.map(tx => ({ kind: 'single', tx }))

  const byDate = {}
  relevant.forEach(tx => {
    ;(byDate[tx.date] = byDate[tx.date] || []).push(tx)
  })

  const rows = []
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

  return rows
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

function SingleRow({ row, accountId, accounts, balance, onReverse, onEdit, onDuplicate }) {
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

  return (
    <tr
      className="border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors cursor-pointer group"
      onClick={() => onEdit && onEdit(tx)}
    >
      <td className="px-3 py-2.5 text-xs text-gray-400 whitespace-nowrap">{fmtDate(tx.date)}</td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          {isTransfer
            ? <ArrowLeftRight size={12} className="text-gray-500 shrink-0" />
            : isIn
              ? <ArrowDownCircle size={12} className="text-blue-600 shrink-0" />
              : <ArrowUpCircle size={12} className="text-orange-600 shrink-0" />
          }
          <span className="text-xs text-gray-200 truncate max-w-[160px]">{tx.description || (tx.type === 'income' ? 'Receita' : tx.type === 'expense' ? 'Despesa' : 'Transferência')}</span>
        </div>
      </td>
      <td className="px-3 py-2.5 text-xs text-gray-400 whitespace-nowrap">
        {deId ? <AccountName id={deId} accounts={accounts} /> : deLabel}
      </td>
      <td className="px-3 py-2.5 text-xs text-gray-400 whitespace-nowrap">
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
        </div>
      </td>
    </tr>
  )
}

function NettedRow({ row, accountId, accounts, balance }) {
  const [open, setOpen] = useState(false)
  const { netFlow, otherAccountId, txs } = row
  const isIn = netFlow > 0
  const otherAcc = accounts.find(a => a.id === otherAccountId)
  const otherName = otherAcc ? (otherAcc.apelido || otherAcc.name) : '?'
  const thisAcc = accounts.find(a => a.id === accountId)
  const thisName = thisAcc ? (thisAcc.apelido || thisAcc.name) : '?'

  return (
    <>
      <tr
        className="border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors cursor-pointer select-none bg-indigo-500/5"
        onClick={() => setOpen(v => !v)}
      >
        <td className="px-3 py-2.5 text-xs text-gray-400 whitespace-nowrap">{fmtDate(row.date)}</td>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <ArrowLeftRight size={12} className="text-indigo-400 shrink-0" />
            <span className="text-xs text-gray-200">Transf. líquida</span>
            <span className="text-xs text-indigo-400 ml-1">({txs.length} mov.)</span>
          </div>
        </td>
        <td className="px-3 py-2.5 text-xs text-gray-400 whitespace-nowrap">{isIn ? otherName : thisName}</td>
        <td className="px-3 py-2.5 text-xs text-gray-400 whitespace-nowrap">{isIn ? thisName : otherName}</td>
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
      </tr>
      {open && txs.map(tx => {
        const delta = txDelta(tx, accountId)
        const isInSub = delta > 0
        const fromAcc = accounts.find(a => a.id === tx.accountId)
        const toAcc = accounts.find(a => a.id === tx.toAccountId)
        return (
          <tr key={tx.id} className="border-b border-gray-800/30 bg-indigo-500/5">
            <td className="px-3 py-1.5 pl-8 text-xs text-gray-600 whitespace-nowrap">{fmtDate(tx.date)}</td>
            <td className="px-3 py-1.5 pl-2 text-xs text-gray-500 italic">
              {tx.description || 'Transferência'}
            </td>
            <td className="px-3 py-1.5 text-xs text-gray-500 whitespace-nowrap">
              {fromAcc ? (fromAcc.apelido || fromAcc.name) : '—'}
            </td>
            <td className="px-3 py-1.5 text-xs text-gray-500 whitespace-nowrap">
              {toAcc ? (toAcc.apelido || toAcc.name) : '—'}
            </td>
            <td className="px-3 py-1.5 text-right text-xs text-blue-600/70 whitespace-nowrap">
              {isInSub ? fmt(Math.abs(delta)) : ''}
            </td>
            <td className="px-3 py-1.5 text-right text-xs text-orange-600/70 whitespace-nowrap">
              {!isInSub ? fmt(Math.abs(delta)) : ''}
            </td>
            <td colSpan={2} />
          </tr>
        )
      })}
    </>
  )
}

export default function ExtratoContaPanel({ account: accountProp, onClose, onEdit }) {
  const { transactions, accounts, schedules, reverseTransaction } = useApp()
  // Always derive account from live context so balance stays current after new transactions
  const account = accounts.find(a => a.id === accountProp.id) || accountProp
  const now = new Date()
  const [from, setFrom] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  )
  const [to, setTo] = useState(
    new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
  )
  const [confirmEstorno, setConfirmEstorno] = useState(null)
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

  const handleDuplicate = (tx) => {
    if (!onEdit) return
    const d = new Date(tx.date + 'T00:00:00')
    d.setDate(d.getDate() + 30)
    const newDate = d.toISOString().split('T')[0]
    // eslint-disable-next-line no-unused-vars
    const { id, createdAt, scheduleId, origin, grupoGerencial, gerencialScheduleId, reservaAuto, ...rest } = tx
    onEdit({ ...rest, date: newDate })
  }

  const isAplicacao = !!account.contaAplicacao
  const isGerencial = !!(account.name?.startsWith('Ger. ') && account.grupoGerencial)

  const gerencialSchedules = useMemo(() =>
    (schedules || []).filter(s => s.overrides?._gerencial?.gerencialContaId === account.id)
      .sort((a, b) => (a.overrides._gerencial.faturaRef || '').localeCompare(b.overrides._gerencial.faturaRef || '')),
    [schedules, account.id]
  )

  const filteredTxs = useMemo(() =>
    transactions.filter(tx => tx.date >= from && tx.date <= to),
    [transactions, from, to]
  )

  const rows = useMemo(() => buildRows(filteredTxs, account.id, isAplicacao), [filteredTxs, account.id, isAplicacao])

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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-200">
            Extrato — {account.apelido || account.name}
            {isAplicacao && (
              <span className="ml-2 text-xs bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded font-normal">Aplicação · netizado</span>
            )}
          </h2>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors">
            <X size={14} />
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="label">De</label>
          <input className="input" type="date" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">Até</label>
          <input className="input" type="date" value={to} onChange={e => setTo(e.target.value)} />
        </div>
      </div>

      {/* KPI summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card">
          <div className="flex items-center gap-2 mb-1 text-blue-600"><ArrowDownCircle size={13} /><p className="text-xs text-gray-400 uppercase">Entradas</p></div>
          <p className="text-lg font-bold text-blue-600">{fmt(totals.entrada)}</p>
        </div>
        <div className="card">
          <div className="flex items-center gap-2 mb-1 text-orange-600"><ArrowUpCircle size={13} /><p className="text-xs text-gray-400 uppercase">Saídas</p></div>
          <p className="text-lg font-bold text-orange-600">{fmt(totals.saida)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-400 uppercase mb-1">Saldo Final</p>
          <p className={`text-lg font-bold ${finalBalance >= 0 ? 'text-gray-200' : 'text-orange-600'}`}>{fmt(finalBalance)}</p>
        </div>
      </div>

      {/* Faturas Provisionadas — only for Ger. accounts */}
      {isGerencial && gerencialSchedules.length > 0 && (
        <div className="card space-y-2">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Faturas Provisionadas</h3>
          {gerencialSchedules.map(s => {
            const faturaRef = s.overrides?._gerencial?.faturaRef || '—'
            const done = (s.registered || []).length > 0
            return (
              <div key={s.id} className="flex items-center justify-between py-2 border-b border-gray-800/50 last:border-0">
                <div>
                  <p className="text-xs text-gray-200 font-medium">Fatura {faturaRef}</p>
                  <p className="text-xs text-gray-500">Devolução: {fmtDate(s.startDate)}</p>
                </div>
                <div className="text-right space-y-1">
                  <p className="text-xs font-semibold text-purple-300">{fmt(s.amount)}</p>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${done ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
                    {done ? 'Executado' : 'Pendente'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium whitespace-nowrap">Data</th>
                <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium">Histórico</th>
                <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium whitespace-nowrap">Conta De</th>
                <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium whitespace-nowrap">Conta Para</th>
                <th className="text-right px-3 py-2.5 text-xs text-blue-600 font-medium whitespace-nowrap">
                  <span className="flex items-center justify-end gap-1"><ArrowDownCircle size={10} /> Entrada</span>
                </th>
                <th className="text-right px-3 py-2.5 text-xs text-orange-600 font-medium whitespace-nowrap">
                  <span className="flex items-center justify-end gap-1"><ArrowUpCircle size={10} /> Saída</span>
                </th>
                <th className="text-right px-3 py-2.5 text-xs text-gray-400 font-medium whitespace-nowrap">Saldo</th>
                <th className="w-6" />
              </tr>
            </thead>
            <tbody>
              {/* Starting balance row */}
              <tr className="border-b border-gray-800/50 bg-gray-800/20">
                <td className="px-3 py-2 text-xs text-gray-600">{fmtDate(from)}</td>
                <td className="px-3 py-2 text-xs text-gray-500 italic" colSpan={5}>Saldo inicial do período</td>
                <td className={`px-3 py-2 text-right text-xs font-bold ${startBalance >= 0 ? 'text-gray-400' : 'text-orange-600'}`}>
                  {fmt(startBalance)}
                </td>
                <td />
              </tr>
              {rowsWithBalance.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-gray-500 text-xs">
                    Nenhum lançamento no período
                  </td>
                </tr>
              )}
              {rowsWithBalance.map((row, i) =>
                row.kind === 'netted' ? (
                  <NettedRow key={i} row={row} accountId={account.id} accounts={accounts} balance={row.runningBalance} />
                ) : (
                  <SingleRow key={i} row={row} accountId={account.id} accounts={accounts} balance={row.runningBalance} onReverse={setConfirmEstorno} onEdit={onEdit} onDuplicate={handleDuplicate} />
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
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
