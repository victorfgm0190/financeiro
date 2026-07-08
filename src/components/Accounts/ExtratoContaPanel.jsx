import { useState, useMemo } from 'react'
import {
  ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, ChevronDown, ChevronUp,
  ChevronLeft, ChevronRight, X, Undo2, Edit2, Plus, Trash2, Check, Circle, CheckSquare, Zap,
  ListChecks, PencilLine,
} from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate, EMPTY_LANC_FILTROS, hasLancFiltros, matchLancFiltros } from '../shared/utils'
import ConfirmDialog from '../shared/ConfirmDialog'
import Modal from '../shared/Modal'
import Toast from '../shared/Toast'
import TxMobileItem from '../shared/TxMobileItem'
import LancamentoFiltros from '../shared/LancamentoFiltros'
import ReconciliarModal from '../shared/ReconciliarModal'
import BulkEditModal from '../shared/BulkEditModal'
import ValueFilterDropdown from '../shared/ValueFilterDropdown'
import DuplicateButton from '../shared/DuplicateButton'
import ReconciledTotals from '../shared/ReconciledTotals'

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

// Computes the account balance just before `fromDate` by reversing transactions in
// [fromDate, hoje]. Lançamentos com data FUTURA (date > hoje) NÃO são revertidos: eles não
// entram em account.balance (que só soma date <= hoje, igual ao recalcularSaldo), então revertê-los
// subtrairia indevidamente do saldo inicial. `hoje` em data local YYYY-MM-DD (mesmo critério).
function balanceAt(account, allTransactions, fromDate) {
  const n = new Date()
  const today = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
  let b = account.balance || 0
  allTransactions.forEach(tx => {
    if (tx.date < fromDate || tx.date > today) return
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
function buildRows(transactions, accountId, isAplicacao, aplicacaoIds) {
  const relevant = transactions
    .filter(tx => tx.accountId === accountId || tx.toAccountId === accountId)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || ''))

  // A netização bidirecional (round-trip do mesmo dia) ocorre sempre que o PAR envolve uma
  // conta de aplicação — seja a conta visualizada (isAplicacao), seja a conta oposta
  // (aplicacaoIds.has(otherAccountId)). Isso garante a netização nas DUAS pontas do par:
  // tanto no extrato da conta de aplicação quanto no da conta comum do outro lado.
  const aplIds = aplicacaoIds || new Set()
  const canNet = isAplicacao || aplIds.size > 0

  let rows
  if (!canNet) {
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

        // Par de contas (não-ordenado) em relação à conta visualizada.
        const otherAccountId = tx.accountId === accountId ? tx.toAccountId : tx.accountId
        // Só netiza o par quando ele envolve uma conta de aplicação (esta ponta ou a oposta).
        const pairInvolvesAplicacao = isAplicacao || aplIds.has(otherAccountId)
        if (!pairInvolvesAplicacao) {
          rows.push({ kind: 'single', tx })
          processed.add(tx.id)
          return
        }
        // Todos os transfers do dia entre ESTE par, em qualquer sentido (A→B e B→A).
        const pairTxs = dayTxs.filter(t =>
          !processed.has(t.id) &&
          t.type === 'transfer' &&
          ((t.accountId === accountId && t.toAccountId === otherAccountId) ||
           (t.accountId === otherAccountId && t.toAccountId === accountId))
        )
        // Netiza apenas quando há movimento nos DOIS sentidos entre o par. Movimento em
        // uma única direção mantém o comportamento atual (linhas individuais).
        const hasIn = pairTxs.some(t => t.toAccountId === accountId)
        const hasOut = pairTxs.some(t => t.accountId === accountId)
        if (pairTxs.length < 2 || !hasIn || !hasOut) {
          rows.push({ kind: 'single', tx })
          processed.add(tx.id)
          return
        }

        const flow = (t) => (t.toAccountId === accountId ? t.amount : -t.amount)
        const netFlow = Math.round(pairTxs.reduce((s, t) => s + flow(t), 0) * 100) / 100

        rows.push({ kind: 'netted', txs: pairTxs, date, netFlow, otherAccountId, bidirectional: true })
        pairTxs.forEach(t => processed.add(t.id))
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
        ? <span className="inline-flex items-center justify-center w-[17px] h-[17px] rounded-full bg-green-500 align-middle">
            <Check size={11} strokeWidth={3} className="text-white" />
          </span>
        : <Circle size={15} className="text-gray-600 hover:text-gray-400" />}
    </button>
  )
}

function SingleRow({ row, accountId, accounts, balance, onReverse, onEdit, onDuplicate, onDelete, onToggleReconcile, todayStr, selectMode, selected, onToggleSelect }) {
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
      badge = { label: 'Reserva', cls: 'bg-reserva/20 text-reserva' }
    else
      badge = { label: 'Futuro', cls: 'bg-gray-500/20 text-gray-400' }
  }

  return (
    <tr
      className={`border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors cursor-pointer group ${tx.reconciled ? '' : 'opacity-60'} ${selectMode && selected ? 'bg-blue-500/10' : ''}`}
      onClick={() => selectMode ? onToggleSelect(tx.id) : (onEdit && onEdit(tx))}
    >
      {selectMode && (
        <td className="px-2 py-2.5 text-center">
          <input
            type="checkbox"
            checked={!!selected}
            onChange={() => onToggleSelect(tx.id)}
            onClick={e => e.stopPropagation()}
            className="w-4 h-4 rounded accent-blue-500 cursor-pointer align-middle"
          />
        </td>
      )}
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
          {tx.id?.startsWith('tx_gerA_') && (tx.faturaRef || tx.sourceExpenseId) && (
            <span className="flex items-center gap-1 shrink-0">
              {tx.faturaRef && (
                <span className="text-[10px] px-1 py-0.5 rounded bg-gray-800/60 text-gray-500 font-medium">
                  Fatura {tx.faturaRef}
                </span>
              )}
              {tx.sourceExpenseId && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(tx.sourceExpenseId) }}
                  title={`Despesa origem: ${tx.sourceExpenseId} (clique para copiar)`}
                  className="font-mono text-[9px] px-1 py-0.5 rounded bg-gray-800/60 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  orig: {tx.sourceExpenseId}
                </button>
              )}
            </span>
          )}
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
            <DuplicateButton onConfirm={(date) => onDuplicate(tx, date)} iconSize={14} />
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

function NettedRow({ row, accountId, accounts, balance, onToggleReconcile, selectMode, onEditTx, onDeleteTx, onDeleteGroup }) {
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
        className={`border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors cursor-pointer select-none bg-indigo-500/5 ${allReconciled ? '[&>td:not(:last-child)]:opacity-40' : ''}`}
        onClick={() => setOpen(v => !v)}
      >
        {selectMode && <td className="px-2 py-2.5" title="Transferências não são alteráveis em lote" />}
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
            {row.bidirectional && (
              <span className="text-xs bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded shrink-0 font-medium">
                {thisName} ↔ {otherName} · netizado
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
        <td className="px-2 py-2.5">
          <div className="flex items-center justify-center gap-0.5">
            {onDeleteGroup && (
              <button
                onClick={(e) => { e.stopPropagation(); onDeleteGroup(row) }}
                title="Excluir grupo netizado (todas as transferências)"
                className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
              >
                <Trash2 size={14} />
              </button>
            )}
            {open ? <ChevronUp size={12} className="text-indigo-400" /> : <ChevronDown size={12} className="text-indigo-400" />}
          </div>
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
            {selectMode && <td className="px-2 py-1.5" />}
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
            <td className="px-3 py-1.5" />
            <td className="px-2 py-1.5">
              <div className="flex items-center justify-center gap-0.5">
                {onEditTx && (
                  <button
                    onClick={() => onEditTx(tx)}
                    title="Editar transferência"
                    className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-blue-400/10 rounded transition-colors"
                  >
                    <Edit2 size={13} />
                  </button>
                )}
                {onDeleteTx && (
                  <button
                    onClick={() => onDeleteTx(tx)}
                    title="Excluir transferência"
                    className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </td>
            <td className="px-1 py-1.5" />
          </tr>
        )
      })}
    </>
  )
}

export default function ExtratoContaPanel({ account: accountProp, onClose, onEdit, onNewTx, onDelete, backButton }) {
  const { transactions, schedules, accounts, settings, reverseTransaction, deleteTransaction, deleteSchedule, findLinkedResgate, setReconciled } = useApp()
  // Always derive account from live context so balance stays current after new transactions
  const account = accounts.find(a => a.id === accountProp.id) || accountProp

  const now = new Date()
  // Mês de exibição inicial = mês CALENDÁRIO da data atual (qualquer dia de junho → junho),
  // independente de financialMonthStartDay/ciclo financeiro. Construção local para evitar o
  // desvio de fuso do toISOString().
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const [selectedMonth, setSelectedMonth] = useState(defaultMonth)

  const [year, month] = selectedMonth.split('-').map(Number)
  const from = `${selectedMonth}-01`
  const to = new Date(year, month, 0).toISOString().split('T')[0]
  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`

  const prevMonth = () => {
    const d = new Date(year, month - 2, 1)
    setSelEntradas(new Set()); setSelSaidas(new Set()); setSelectedIds(new Set())
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const nextMonth = () => {
    const d = new Date(year, month, 1)
    setSelEntradas(new Set()); setSelSaidas(new Set()); setSelectedIds(new Set())
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  const [confirmEstorno, setConfirmEstorno] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(null) // row netizado a excluir inteiro
  const [showBulkDelete, setShowBulkDelete] = useState(false) // modal de exclusão em lote (modo Selecionar)
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
    const r = findLinkedResgate(tx.id)
    if (onDelete) onDelete(tx.id)
    else deleteTransaction(tx.id)
    if (r) deleteSchedule(r.id)
    setConfirmDelete(null)
  }

  // Exclui todas as transferências de um grupo netizado (mesmo fluxo de deleteTransaction,
  // que reverte saldo e cascata: reservaAuto, gerenciais, etc.). O netizado é só visual, então
  // a lista re-agrupa sozinha no próximo render.
  const handleDeleteGroup = (row) => {
    for (const tx of (row?.txs || [])) {
      if (onDelete) onDelete(tx.id)
      else deleteTransaction(tx.id)
    }
    setConfirmDeleteGroup(null)
    showToast('Grupo netizado excluído.')
  }

  // Duplicar: abre o form em modo NOVO (sem id) pré-preenchido com os dados do lançamento e a
  // data escolhida no popover. NÃO salva automaticamente — o usuário revisa e confirma.
  // Mantém grupo gerencial (classificação do usuário) e descarta vínculos de automação/série e
  // a fatura/dateCartao (recalculadas pela nova data). Parcelados: duplica apenas a parcela
  // clicada — num/total/parentTxId são descartados para não recriar a série.
  const handleDuplicate = (tx, newDate) => {
    if (!onEdit) return
    // eslint-disable-next-line no-unused-vars
    const { id, createdAt, scheduleId, origin, gerencialScheduleId, reservaAuto, parentTxId, installmentNum, installmentTotal, installmentKey, faturaMonthYear, dateCartao, ...rest } = tx
    onEdit({ ...rest, date: newDate || tx.date })
  }

  const todayStr = now.toISOString().split('T')[0]
  const isAplicacao = !!account.contaAplicacao
  // Conta gerencial = subconta "Ger. …" (marcada com grupoGerencial pelo motor). Só nelas
  // exibimos os totalizadores por fatura (as transferências tx_gerA_* carregam fatura_ref).
  const isGerencial = !!account.grupoGerencial

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

  // Reconciliação — TODOS os lançamentos reconciliáveis do período (mês) em exibição,
  // conciliados e pendentes. O modal filtra conforme o modo (Reconciliar / Não reconciliar).
  const [showReconciliar, setShowReconciliar] = useState(false)
  const [bulkEditTxs, setBulkEditTxs] = useState(null)

  // ── Seleção múltipla (modo "Selecionar") ──
  // Permite selecionar lançamentos diretamente no extrato, sem passar pela
  // reconciliação, e então "Alterar Selecionados" (BulkEditModal) ou conciliar/
  // desconciliar em lote. Opera só sobre lançamentos individuais (linhas 'single');
  // transferências netizadas não são selecionáveis. Reaproveita setReconciled e o
  // fluxo de BulkEditModal — não altera nenhuma lógica de reconciliação/edição.
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())

  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const exitSelect = () => { setSelectMode(false); setSelectedIds(new Set()) }
  const toggleSelectMode = () => selectMode ? exitSelect() : setSelectMode(true)

  const periodReconcilable = useMemo(
    () => filteredTxs
      .filter(tx => (tx.accountId === account.id || tx.toAccountId === account.id))
      .sort((a, b) => a.date.localeCompare(b.date)),
    [filteredTxs, account.id]
  )

  // Conciliar Gerenciais: marca como conciliados todos os lançamentos pendentes do
  // período/conta cuja descrição começa com "Reserva Gerencial - " (sem abrir modal).
  const handleConciliarGerenciais = () => {
    const pend = periodReconcilable.filter(
      tx => !tx.reconciled && (tx.description || '').startsWith('Reserva Gerencial - ')
    )
    if (pend.length === 0) { showToast('Nenhum lançamento gerencial pendente'); return }
    setReconciled(pend.map(t => t.id), true)
    showToast(`${pend.length} ${pend.length !== 1 ? 'lançamentos gerenciais conciliados' : 'lançamento gerencial conciliado'}`)
  }

  // Filtros em tempo real — afetam apenas as linhas exibidas; os totais do header
  // continuam calculados sobre o período completo (rowsWithBalance).
  const [filtros, setFiltros] = useState(EMPTY_LANC_FILTROS)
  // Filtro de conciliação: 'todos' | 'conciliados' | 'pendentes'.
  const [reconFilter, setReconFilter] = useState('todos')
  // Filtro de valor (multiselect) por Entrada/Saída — valores reais do período.
  const [selEntradas, setSelEntradas] = useState(() => new Set())
  const [selSaidas, setSelSaidas] = useState(() => new Set())
  const rowReconciled = (row) => row.kind === 'netted' ? row.txs.every(t => t.reconciled) : !!row.tx.reconciled

  // Linhas após os demais filtros (texto + conciliação), antes do filtro de valor.
  const baseRows = useMemo(() => {
    let out = rowsWithBalance
    if (hasLancFiltros(filtros)) {
      out = out.filter(row =>
        row.kind === 'netted'
          ? row.txs.some(tx => matchLancFiltros(tx, filtros, accounts))
          : matchLancFiltros(row.tx, filtros, accounts)
      )
    }
    if (reconFilter !== 'todos') {
      out = out.filter(row => reconFilter === 'conciliados' ? rowReconciled(row) : !rowReconciled(row))
    }
    return out
  }, [rowsWithBalance, filtros, accounts, reconFilter])

  // Valores reais (distintos) de Entrada e Saída do período já filtrado, maior → menor.
  const { entradaValues, saidaValues } = useMemo(() => {
    const e = new Set(), s = new Set()
    for (const row of baseRows) {
      const d = row.kind === 'single' ? txDelta(row.tx, account.id) : row.netFlow
      if (d > 0) e.add(Math.round(d * 100) / 100)
      else if (d < 0) s.add(Math.round(-d * 100) / 100)
    }
    return {
      entradaValues: [...e].sort((a, b) => b - a),
      saidaValues: [...s].sort((a, b) => b - a),
    }
  }, [baseRows, account.id])

  const displayRows = useMemo(() => {
    const hasE = selEntradas.size > 0, hasS = selSaidas.size > 0
    if (!hasE && !hasS) return baseRows
    return baseRows.filter(row => {
      const d = row.kind === 'single' ? txDelta(row.tx, account.id) : row.netFlow
      if (d > 0) return hasE ? selEntradas.has(Math.round(d * 100) / 100) : true
      if (d < 0) return hasS ? selSaidas.has(Math.round(-d * 100) / 100) : true
      return true
    })
  }, [baseRows, selEntradas, selSaidas, account.id])

  // Lançamentos individuais (não-transfer netizado) atualmente visíveis e selecionáveis.
  const selectableIds = useMemo(
    () => displayRows.filter(r => r.kind === 'single').map(r => r.tx.id),
    [displayRows]
  )

  // Conciliados/Pendentes dos lançamentos VISÍVEIS (após filtros de período/texto/valor).
  // Por LINHA (mesmo valor exibido: delta do lançamento / netFlow do grupo netizado), usando o
  // status de conciliação da linha — evita contar as duas pernas de uma transferência netizada.
  const reconciledTotals = useMemo(() => {
    let conciliado = 0, pendente = 0
    for (const row of displayRows) {
      const d = row.kind === 'single' ? txDelta(row.tx, account.id) : row.netFlow
      const v = Math.abs(Math.round(d * 100) / 100)
      const isRec = row.kind === 'netted' ? row.txs.every(t => t.reconciled) : !!row.tx.reconciled
      if (isRec) conciliado = Math.round((conciliado + v) * 100) / 100
      else pendente = Math.round((pendente + v) * 100) / 100
    }
    return { conciliado, pendente }
  }, [displayRows, account.id])

  // Totalizador gerencial (só em conta gerencial): resume a fatura ANTERIOR e a ATUAL do ciclo
  // financeiro (financialMonthStartDay, mesma regra do resto do app). Para a fatura anterior:
  //   • entradas = provisões recebidas na subconta (etapa A tx_gerA_*, txDelta > 0);
  //   • resgate  = devoluções/resgates JÁ EXECUTADOS (saídas com sourceScheduleId, faturaRef =
  //                anterior) MAIS agendamentos gerenciais PENDENTES (não registrados) que saem
  //                desta subconta com fatura_mes_ano = anterior;
  //   • líquido  = entradas − resgate.
  // Para a fatura atual: só as entradas. "Total" = saldo real da subconta (account.balance).
  // Retorna null fora de conta gerencial; a fatura anterior é omitida quando não tem entradas.
  const faturaTotals = useMemo(() => {
    if (!isGerencial) return null
    const r2 = (x) => Math.round(x * 100) / 100
    // Conta ocorrências em registered/skipped tolerando array ([]) ou objeto ({}), pois o JSONB
    // pode vir em qualquer das duas formas. > 0 = agendamento já executado/pulado (não pendente).
    const countEntries = (v) => Array.isArray(v) ? v.length : (v && typeof v === 'object' ? Object.keys(v).length : 0)
    const startDay = settings?.financialMonthStartDay || 1
    const nowRef = new Date()
    // O totalizador segue o MÊS VISUALIZADO no extrato (selectedMonth = year/month, 1-indexed),
    // não o mês de hoje. Regras:
    //   • Visualizando o mês CALENDÁRIO corrente → mantém a lógica do ciclo financeiro: antes do dia
    //     startDay a fatura atual ainda é a do mês visualizado; a partir do startDay, a do mês seguinte
    //     (a devolução, no dia startDay do mês da fatura, ainda está por ocorrer).
    //   • Visualizando um mês passado/futuro → o ciclo daquele mês está encerrado: fatura atual = mês
    //     visualizado, fatura anterior = mês anterior a ele.
    const isMesCorrente = year === nowRef.getFullYear() && (month - 1) === nowRef.getMonth()
    let atualCycle, anteriorCycle
    if (isMesCorrente) {
      const cycleAnchor = ((settings?.financialMonthMode || 'custom') !== 'calendar' && nowRef.getDate() < startDay)
        ? new Date(year, month - 2, 1)  // ciclo ainda no mês anterior ao visualizado
        : new Date(year, month - 1, 1)  // ciclo no próprio mês visualizado
      atualCycle = new Date(cycleAnchor.getFullYear(), cycleAnchor.getMonth() + 1, 1)
      anteriorCycle = cycleAnchor
    } else {
      atualCycle = new Date(year, month - 1, 1)      // fatura do próprio mês visualizado
      anteriorCycle = new Date(year, month - 2, 1)   // fatura do mês anterior
    }
    const mkRef = (dt) => `${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`
    const mkYm = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
    const refAtual = mkRef(atualCycle)
    const refAnterior = mkRef(anteriorCycle)
    const mesAnoAtual = mkYm(atualCycle)
    const mesAnoAnterior = mkYm(anteriorCycle)

    // Resume UMA fatura. As entradas (etapa A recebida na subconta, d>0) são separadas pela
    // FRONTEIRA = dia 1 do mês da fatura: date < 01/MM → "mês anterior" (gastos do mês anterior que
    // já pertencem a esta fatura); date >= 01/MM → "este mês". Resgate = devoluções/resgates JÁ
    // EXECUTADOS (saídas d<0 com sourceScheduleId, mesma faturaRef) + agendamentos gerenciais
    // PENDENTES (não registrados/pulados) que saem desta subconta com o mesmo fatura_mes_ano.
    // Líquido = (mês ant. + este mês) − resgate. Aplica-se igual à fatura anterior e à atual.
    const resumoFatura = (ref, mesAno) => {
      const cutMonth = `${mesAno}-01` // dia 1 do mês da fatura; tx.date é ISO YYYY-MM-DD (compara string)
      let mesAnt = 0, esteMes = 0, resgate = 0
      for (const tx of transactions) {
        if (tx.faturaRef !== ref) continue
        if (tx.accountId !== account.id && tx.toAccountId !== account.id) continue
        const d = txDelta(tx, account.id)
        if (d > 0) {
          if ((tx.date || '') < cutMonth) mesAnt = r2(mesAnt + d)
          else esteMes = r2(esteMes + d)
        } else if (d < 0 && tx.sourceScheduleId) {
          resgate = r2(resgate + (-d))
        }
      }
      for (const s of schedules) {
        if (s.accountId !== account.id) continue
        if (s.tipo !== 'gerencial_devolucao' && s.tipo !== 'resgate_reserva') continue
        if (s.faturaMesAno !== mesAno) continue
        if (countEntries(s.registered) > 0 || countEntries(s.skipped) > 0) continue // já executado/pulado
        resgate = r2(resgate + (Number(s.amount) || 0))
      }
      const entradas = r2(mesAnt + esteMes)
      return { ref, mesAnt, esteMes, entradas, resgate, liquido: r2(entradas - resgate) }
    }

    const anteriorResumo = resumoFatura(refAnterior, mesAnoAnterior)
    return {
      anterior: anteriorResumo.entradas > 0 ? anteriorResumo : null,
      atual: resumoFatura(refAtual, mesAnoAtual),
      total: Number(account.balance) || 0,
    }
  }, [transactions, schedules, account.id, account.balance, isGerencial, settings, year, month])

  const allVisibleSelected = selectableIds.length > 0 && selectableIds.every(id => selectedIds.has(id))
  const toggleSelectAllVisible = () => setSelectedIds(prev => {
    if (allVisibleSelected) {
      const next = new Set(prev)
      selectableIds.forEach(id => next.delete(id))
      return next
    }
    return new Set([...prev, ...selectableIds])
  })

  const selectedTxs = useMemo(
    () => transactions.filter(tx => selectedIds.has(tx.id)),
    [transactions, selectedIds]
  )

  const handleBulkReconcile = (value) => {
    if (selectedIds.size === 0) return
    setReconciled([...selectedIds], value)
    const n = selectedIds.size
    showToast(`${n} ${n !== 1 ? 'lançamentos' : 'lançamento'} ${value ? (n !== 1 ? 'conciliados' : 'conciliado') : (n !== 1 ? 'desconciliados' : 'desconciliado')}`)
  }

  // Resumo dos selecionados por natureza, para o modal de exclusão em lote. Gerencial tem
  // precedência (id tx_gerA_* ou descrição "…Gerencial…"), depois transfer/expense/income.
  const bulkDeleteSummary = useMemo(() => {
    const s = { gerencial: 0, transfer: 0, expense: 0, income: 0, outros: 0 }
    for (const tx of selectedTxs) {
      if (tx.id?.startsWith('tx_gerA_') || /gerencial/i.test(tx.description || '')) s.gerencial++
      else if (tx.type === 'transfer') s.transfer++
      else if (tx.type === 'expense') s.expense++
      else if (tx.type === 'income') s.income++
      else s.outros++
    }
    return s
  }, [selectedTxs])

  // Exclui todos os selecionados em sequência (mesmo fluxo do delete individual: reverte saldo,
  // cascata gerencial/filhos no AppContext e remove o resgate vinculado). Limpa seleção ao fim.
  const handleBulkDelete = () => {
    const txs = selectedTxs
    if (txs.length === 0) return
    for (const tx of txs) {
      const r = findLinkedResgate(tx.id)
      if (onDelete) onDelete(tx.id)
      else deleteTransaction(tx.id)
      if (r) deleteSchedule(r.id)
    }
    const n = txs.length
    setShowBulkDelete(false)
    exitSelect()
    showToast(`${n} ${n !== 1 ? 'lançamentos excluídos' : 'lançamento excluído'}`)
  }

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
      {selectMode && <col style={{ width: '36px' }} />}
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
      {/* ── Bloco sticky (apenas desktop md+): title · filters · KPIs · table header.
             No mobile rola normalmente para liberar a tela à lista. ── */}
      <div className="md:sticky md:top-0 md:z-10 md:bg-gray-950">
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
                onClick={toggleSelectMode}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 ${selectMode ? 'btn-primary' : 'btn-secondary'}`}
                title={selectMode ? 'Sair do modo de seleção' : 'Selecionar lançamentos para alterar ou conciliar'}
              >
                <ListChecks size={12} /> {selectMode ? 'Cancelar Seleção' : 'Selecionar'}
              </button>
              <button
                onClick={() => setShowReconciliar(true)}
                className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5"
                title="Reconciliar transações do período"
              >
                <CheckSquare size={12} /> Reconciliar
              </button>
              <button
                onClick={handleConciliarGerenciais}
                className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5"
                title='Conciliar todos os lançamentos "Reserva Gerencial" pendentes do período'
              >
                <Zap size={12} /> Conciliar Gerenciais
              </button>
              {onNewTx && (
                <button onClick={onNewTx} className="btn-primary hidden md:flex items-center gap-1.5 text-xs px-3 py-1.5">
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

        {/* Table column header (desktop) */}
        <div className="hidden md:block bg-surface border-x border-t border-gray-800 rounded-t-xl overflow-hidden">
          <table className="w-full text-sm table-fixed">
            {colGroup}
            <thead>
              <tr className="border-b border-gray-800">
                {selectMode && (
                  <th className="px-2 py-2.5 text-center">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAllVisible}
                      className="w-4 h-4 rounded accent-blue-500 cursor-pointer align-middle"
                      title="Selecionar todos os visíveis"
                    />
                  </th>
                )}
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
        <div className="border-x border-gray-800 bg-surface">
          <LancamentoFiltros
            filtros={filtros}
            setFiltros={setFiltros}
            extra={
              <>
                <ValueFilterDropdown
                  label="Entrada"
                  values={entradaValues}
                  selected={selEntradas}
                  onChange={setSelEntradas}
                  iconColor="text-blue-500"
                />
                <ValueFilterDropdown
                  label="Saída"
                  values={saidaValues}
                  selected={selSaidas}
                  onChange={setSelSaidas}
                  iconColor="text-orange-500"
                />
                <div className="flex items-center rounded-md border border-gray-700 overflow-hidden shrink-0">
                  {[
                    { v: 'todos', label: 'Todos' },
                    { v: 'conciliados', label: '✓ Conciliados' },
                    { v: 'pendentes', label: '○ Pendentes' },
                  ].map(o => (
                    <button
                      key={o.v}
                      type="button"
                      onClick={() => setReconFilter(o.v)}
                      className={`px-2 py-1 text-xs transition-colors border-l border-gray-700 first:border-l-0 ${
                        reconFilter === o.v
                          ? o.v === 'conciliados' ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 text-gray-100'
                          : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </>
            }
          />
        </div>

        {/* Totalizador gerencial (fatura anterior + atual) + Conciliados/Pendentes (lançamentos visíveis) */}
        {(reconciledTotals.conciliado > 0 || reconciledTotals.pendente > 0 || faturaTotals) && (
          <div className="border-x border-gray-800 bg-surface/40 px-4 py-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs">
            {faturaTotals && (
              <div className="rounded bg-gray-800/60 px-3 py-1.5 space-y-1 min-w-[210px]">
                {[faturaTotals.anterior, faturaTotals.atual].filter(Boolean).map((f, i) => (
                  <div key={f.ref} className="space-y-1">
                    {i > 0 && <div className="border-t border-gray-700/60 my-1" />}
                    <div className="text-gray-400 font-medium">Fatura {f.ref}</div>
                    {f.mesAnt > 0 && (
                      <div className="flex items-center justify-between gap-6">
                        <span className="text-gray-500">Mês anterior</span>
                        <span className="font-semibold text-blue-600">{fmt(f.mesAnt)}</span>
                      </div>
                    )}
                    {f.esteMes > 0 && (
                      <div className="flex items-center justify-between gap-6">
                        <span className="text-gray-500">Este mês</span>
                        <span className="font-semibold text-blue-600">{fmt(f.esteMes)}</span>
                      </div>
                    )}
                    {f.resgate > 0 && (
                      <div className="flex items-center justify-between gap-6">
                        <span className="text-gray-500">Resgate</span>
                        <span className="font-semibold text-orange-600">{fmt(f.resgate)}</span>
                      </div>
                    )}
                    {f.entradas > 0 && (
                      <div className="flex items-center justify-between gap-6">
                        <span className="text-gray-500">Líquido</span>
                        <span className={`font-semibold ${
                          f.liquido === 0 ? 'text-gray-500' : f.liquido > 0 ? 'text-blue-600' : 'text-orange-600'
                        }`}>{fmt(f.liquido)}</span>
                      </div>
                    )}
                  </div>
                ))}
                <div className="flex items-center justify-between gap-6">
                  <span className="text-gray-500">Total</span>
                  <span className={`font-semibold ${faturaTotals.total < 0 ? 'text-orange-600' : 'text-blue-600'}`}>{fmt(faturaTotals.total)}</span>
                </div>
              </div>
            )}
            <ReconciledTotals
              conciliado={reconciledTotals.conciliado}
              pendente={reconciledTotals.pendente}
              className="ml-auto"
            />
          </div>
        )}
      </div>

      {/* ── Table body (desktop) ── */}
      <div className="hidden md:block bg-surface border-x border-b border-gray-800 rounded-b-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm table-fixed">
            {colGroup}
            <tbody>
              {/* Starting balance row */}
              <tr className="border-b border-gray-800/50 bg-gray-800/20">
                {selectMode && <td className="px-2 py-2" />}
                <td className="px-3 py-2 text-xs text-gray-600">{fmtDate(from)}</td>
                <td className="px-3 py-2 text-xs text-gray-500 italic" colSpan={6}>Saldo inicial do período</td>
                <td className={`px-3 py-2 text-right text-xs font-bold ${startBalance >= 0 ? 'text-gray-400' : 'text-orange-600'}`}>
                  {fmt(startBalance)}
                </td>
                <td colSpan={2} />
              </tr>
              {displayRows.length === 0 && (
                <tr>
                  <td colSpan={selectMode ? 11 : 10} className="text-center py-10 text-gray-500 text-xs">
                    {hasLancFiltros(filtros) || reconFilter !== 'todos' ? 'Nenhum lançamento corresponde aos filtros' : 'Nenhum lançamento no período'}
                  </td>
                </tr>
              )}
              {displayRows.map((row, i) =>
                row.kind === 'netted' ? (
                  <NettedRow key={i} row={row} accountId={account.id} accounts={accounts} balance={row.runningBalance} onToggleReconcile={setReconciled} selectMode={selectMode} onEditTx={onEdit} onDeleteTx={setConfirmDelete} onDeleteGroup={setConfirmDeleteGroup} />
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
                    selectMode={selectMode}
                    selected={selectedIds.has(row.tx.id)}
                    onToggleSelect={toggleSelect}
                  />
                )
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Lista mobile (cards estilo app bancário) ── */}
      <div className="md:hidden bg-surface border-x border-b border-gray-800 rounded-b-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-800/20 border-b border-gray-800/60">
          <span className="text-xs text-gray-500 italic">Saldo inicial · {fmtDate(from)}</span>
          <span className={`text-xs font-bold ${startBalance >= 0 ? 'text-gray-400' : 'text-orange-600'}`}>{fmt(startBalance)}</span>
        </div>
        {displayRows.length === 0 ? (
          <p className="text-center py-10 text-gray-500 text-xs">
            {hasLancFiltros(filtros) || reconFilter !== 'todos' ? 'Nenhum lançamento corresponde aos filtros' : 'Nenhum lançamento no período'}
          </p>
        ) : displayRows.map((row, i) => {
          const saldoNode = (
            <p className={`text-[11px] mt-0.5 ${row.runningBalance >= 0 ? 'text-gray-500' : 'text-orange-600'}`}>
              Saldo {fmt(row.runningBalance)}
            </p>
          )
          if (row.kind === 'netted') {
            const allRec = row.txs.every(t => t.reconciled)
            const otherAcc = accounts.find(a => a.id === row.otherAccountId)
            const otherName = otherAcc ? (otherAcc.apelido || otherAcc.name) : '?'
            return (
              <TxMobileItem
                key={i}
                type="transfer"
                title="Transf. líquida"
                subtitle={`${otherName} · ${row.txs.length} mov.`}
                dateLabel={fmtDate(row.date)}
                amount={Math.abs(row.netFlow)}
                dimmed={allRec}
                trailing={saldoNode}
              />
            )
          }
          const tx = row.tx
          const delta = txDelta(tx, account.id)
          const isTransfer = tx.type === 'transfer' || tx.type === 'credit_payment'
          const fromAcc = accounts.find(a => a.id === tx.accountId)
          const toAcc = accounts.find(a => a.id === tx.toAccountId)
          const subtitle = isTransfer
            ? `${fromAcc ? (fromAcc.apelido || fromAcc.name) : '—'} → ${toAcc ? (toAcc.apelido || toAcc.name) : '—'}`
            : (tx.payee && tx.description && tx.description !== tx.payee ? tx.description : null)
          const title = tx.payee || tx.description ||
            (tx.type === 'income' ? 'Receita' : tx.type === 'expense' ? 'Despesa' : 'Transferência')
          const isSelected = selectedIds.has(tx.id)
          return (
            <TxMobileItem
              key={i}
              type={tx.type}
              title={title}
              subtitle={subtitle}
              dateLabel={fmtDate(tx.date)}
              amount={Math.abs(delta)}
              dimmed={selectMode ? false : !tx.reconciled}
              onClick={selectMode ? () => toggleSelect(tx.id) : (onEdit ? () => onEdit(tx) : undefined)}
              trailing={saldoNode}
              leading={
                selectMode ? (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(tx.id)}
                    onClick={e => e.stopPropagation()}
                    className="w-5 h-5 rounded accent-blue-500 cursor-pointer shrink-0"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setReconciled([tx.id], !tx.reconciled) }}
                    className="p-1 rounded hover:bg-gray-700/50 transition-colors shrink-0"
                    title={tx.reconciled ? 'Reconciliado — toque para desmarcar' : 'Marcar como reconciliado'}
                  >
                    {tx.reconciled
                      ? <span className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-full bg-green-500"><Check size={12} strokeWidth={3} className="text-white" /></span>
                      : <Circle size={16} className="text-gray-600" />}
                  </button>
                )
              }
            />
          )
        })}
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
        message={(() => {
          const r = confirmDelete && findLinkedResgate(confirmDelete.id)
          if (!r) return 'Excluir este lançamento permanentemente? Esta ação não pode ser desfeita.'
          return (
            <>
              ⚠️ Este lançamento possui um agendamento de resgate vinculado:<br /><br />
              <span className="text-gray-100 font-medium">{r.description} — {fmt(r.amount)} — {fmtDate(r.startDate)}</span><br /><br />
              Ambos serão excluídos. Deseja continuar?
            </>
          )
        })()}
        confirmLabel={confirmDelete && findLinkedResgate(confirmDelete.id) ? 'Excluir ambos' : 'Excluir'}
        danger
      />

      <ConfirmDialog
        open={!!confirmDeleteGroup}
        onClose={() => setConfirmDeleteGroup(null)}
        onConfirm={() => handleDeleteGroup(confirmDeleteGroup)}
        title="Excluir grupo netizado"
        message={`Excluir as ${confirmDeleteGroup?.txs?.length || 0} transferências deste grupo permanentemente? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir grupo"
        danger
      />

      <Modal open={showBulkDelete} onClose={() => setShowBulkDelete(false)} title="Excluir lançamentos" size="sm">
        <p className="text-gray-300 text-sm mb-4">
          Deseja realmente excluir {selectedIds.size} lançamento{selectedIds.size !== 1 ? 's' : ''}?
        </p>
        <div className="space-y-1.5 mb-6 text-sm">
          {bulkDeleteSummary.gerencial > 0 && (
            <div className="flex justify-between text-gray-300"><span>Transferências gerenciais</span><span className="font-semibold tabular-nums">{bulkDeleteSummary.gerencial}</span></div>
          )}
          {bulkDeleteSummary.transfer > 0 && (
            <div className="flex justify-between text-gray-300"><span>Transferências</span><span className="font-semibold tabular-nums">{bulkDeleteSummary.transfer}</span></div>
          )}
          {bulkDeleteSummary.expense > 0 && (
            <div className="flex justify-between text-gray-300"><span>Despesas</span><span className="font-semibold tabular-nums">{bulkDeleteSummary.expense}</span></div>
          )}
          {bulkDeleteSummary.income > 0 && (
            <div className="flex justify-between text-gray-300"><span>Receitas</span><span className="font-semibold tabular-nums">{bulkDeleteSummary.income}</span></div>
          )}
          {bulkDeleteSummary.outros > 0 && (
            <div className="flex justify-between text-gray-300"><span>Outros</span><span className="font-semibold tabular-nums">{bulkDeleteSummary.outros}</span></div>
          )}
        </div>
        <p className="text-orange-600/90 text-xs mb-6">Esta ação não pode ser desfeita.</p>
        <div className="flex gap-3 justify-end">
          <button className="btn-secondary" onClick={() => setShowBulkDelete(false)}>Cancelar</button>
          <button
            className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors"
            onClick={handleBulkDelete}
          >
            Excluir tudo
          </button>
        </div>
      </Modal>

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      {showReconciliar && (
        <ReconciliarModal
          items={periodReconcilable}
          onApply={setReconciled}
          onClose={() => setShowReconciliar(false)}
          onAlterar={(txs) => { setShowReconciliar(false); setBulkEditTxs(txs) }}
        />
      )}

      {bulkEditTxs && (
        <BulkEditModal
          txs={bulkEditTxs}
          onClose={() => setBulkEditTxs(null)}
          onApplied={(n) => { exitSelect(); showToast(`${n} ${n === 1 ? 'lançamento alterado' : 'lançamentos alterados'}`) }}
        />
      )}

      {/* Espaçador para a barra de ações fixa não cobrir o último lançamento
          (mais alto no mobile por causa da navegação inferior) */}
      {selectMode && <div className="h-36 md:h-24" />}

      {/* ── Barra de ações (modo Selecionar) ──
          Acima do BottomNav (h-16) no mobile; rente à base no desktop. */}
      {selectMode && (
        <div className="fixed bottom-16 md:bottom-0 inset-x-0 z-[45] px-3 pb-3 pointer-events-none">
          <div className="pointer-events-auto mx-auto max-w-3xl bg-surface border border-gray-700 rounded-xl shadow-2xl px-4 py-3 flex items-center gap-3 flex-wrap">
            <span className="text-sm text-gray-300 font-medium">
              {selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''}
            </span>
            <div className="flex items-center gap-2 ml-auto flex-wrap">
              <button
                onClick={() => setBulkEditTxs(selectedTxs)}
                disabled={selectedIds.size === 0}
                className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <PencilLine size={12} /> Alterar Selecionados
              </button>
              <button
                onClick={() => handleBulkReconcile(true)}
                disabled={selectedIds.size === 0}
                className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Conciliar lançamentos selecionados"
              >
                <Check size={12} /> Conciliar
              </button>
              <button
                onClick={() => handleBulkReconcile(false)}
                disabled={selectedIds.size === 0}
                className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Desconciliar lançamentos selecionados"
              >
                <Circle size={12} /> Desconciliar
              </button>
              <button
                onClick={() => setShowBulkDelete(true)}
                disabled={selectedIds.size === 0}
                className="bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-colors flex items-center gap-1.5 text-xs px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                title="Excluir lançamentos selecionados"
              >
                <Trash2 size={12} /> Excluir
              </button>
              <button
                onClick={exitSelect}
                className="btn-secondary flex items-center gap-1.5 text-xs px-3 py-1.5"
              >
                <X size={12} /> Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
