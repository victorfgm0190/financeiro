import { useMemo, useState } from 'react'
import {
  Plus, Calendar, CheckCircle, SkipForward, Trash2, Edit2,
  Clock, CreditCard, BarChart3, ArrowDownCircle, ArrowUpCircle, AlertTriangle, History, ArrowLeftRight,
  MousePointer2, X, Eye, RotateCcw,
} from 'lucide-react'
import { addDays, format, differenceInDays, parseISO } from 'date-fns'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'
import Modal from '../shared/Modal'
import ConfirmDialog from '../shared/ConfirmDialog'
import ScheduleForm from './ScheduleForm'
import AccountOptions from '../shared/AccountOptions'
import CategorySelect from '../shared/CategorySelect'
import FavorecidoAutocomplete from '../shared/FavorecidoAutocomplete'

const FREQ_LABELS = {
  once: 'Única',
  daily: 'Diária',
  weekly: 'Semanal',
  biweekly: 'Quinzenal',
  monthly: 'Mensal',
  bimonthly: 'Bimestral',
  quarterly: 'Trimestral',
  quadrimestral: 'Quadrimestral',
  semiannual: 'Semestral',
  annual: 'Anual',
}

const VIEW_FILTERS = [
  { id: 'future',  label: 'Todos os futuros' },
  { id: 'next30',  label: 'Próximos 30 dias' },
  { id: 'month',   label: 'Este mês' },
  { id: 'all',     label: 'Todos' },
  { id: 'history', label: 'Histórico' },
  { id: 'ra',      label: 'Resgates Anuais' },
]

function GerBadge({ grupoId, gerencialGroups }) {
  if (!grupoId) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-blue-500/20 text-blue-400">G</span>
    )
  }
  const grupo = gerencialGroups.find(g => g.id === grupoId)
  if (!grupo) return null
  let cls = 'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold'
  if (grupo.number === 1) cls += ' bg-emerald-500/20 text-emerald-400'
  else if (grupo.number === 'D') cls += ' bg-gray-700/50 text-gray-500'
  else cls += ' bg-orange-500/20 text-orange-600'
  const label = grupo.number === 1 ? '1' : grupo.alias
  return <span className={cls}>{label}</span>
}

function TabButton({ active, onClick, children, badge }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
        active ? 'border-[#0F6E56] text-[#0F6E56]' : 'border-transparent text-gray-500 hover:text-gray-300'
      }`}
    >
      {children}
      {badge > 0 && (
        <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${active ? 'bg-[#0F6E56]/20 text-[#0F6E56]' : 'bg-gray-700 text-gray-400'}`}>
          {badge}
        </span>
      )}
    </button>
  )
}

function PayableCard({ payable, gerencialGroups, accounts, onMarkPaid, onDelete }) {
  const card = accounts.find(a => a.id === payable.cartaoId)
  const today = new Date().toISOString().split('T')[0]
  const isOverdue = payable.status === 'pending' && payable.dueDate < today
  const isDueSoon = payable.status === 'pending' && !isOverdue && payable.dueDate <= new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0]
  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <GerBadge grupoId={payable.grupoGerencialId} gerencialGroups={gerencialGroups} />
            {card && <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">{card.apelido || card.name}</span>}
            {payable.status === 'paid' && <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-medium">Pago</span>}
          </div>
          <h3 className="font-semibold text-gray-100">{payable.description}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xs flex items-center gap-1 ${isOverdue ? 'text-red-400' : isDueSoon ? 'text-amber-400' : 'text-gray-500'}`}>
              <Clock size={10} />
              Vence {fmtDate(payable.dueDate)}
              {isOverdue && ' · Vencida'}
              {isDueSoon && !isOverdue && ' · Em breve'}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <p className="text-lg font-bold text-orange-600">{fmt(payable.amount)}</p>
          <div className="flex gap-1">
            {payable.status === 'pending' && (
              <button onClick={() => onMarkPaid(payable.id)} className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-500/20 text-blue-600 rounded-lg hover:bg-blue-500/30 transition-colors">
                <CheckCircle size={11} /> Marcar Pago
              </button>
            )}
            <button onClick={() => onDelete(payable.id)} className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors">
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SectionHeader({ label, count, variant = 'default', cols = 9 }) {
  const colors = {
    overdue:  'text-red-400 bg-red-500/10 border-red-500/20',
    soon:     'text-amber-400 bg-amber-500/10 border-amber-500/20',
    month:    'text-blue-400 bg-blue-500/10 border-blue-500/20',
    default:  'text-gray-400 bg-gray-800/60 border-gray-700/50',
    history:  'text-gray-500 bg-gray-800/30 border-gray-700/20',
  }
  return (
    <tr>
      <td colSpan={cols} className={`px-4 py-2 border-y text-xs font-semibold uppercase tracking-wide ${colors[variant]}`}>
        {label}
        {count > 0 && <span className="ml-2 font-bold">{count}</span>}
      </td>
    </tr>
  )
}

function PayModal({ schedule, nextDate, accounts, categories, gerencialGroups, addTransaction, markScheduleRegistered, onClose }) {
  const { payees, transactions, addPayee } = useApp()
  const sortedPayees = useMemo(() => {
    const counts = {}
    for (const tx of transactions) { if (tx.payee) counts[tx.payee] = (counts[tx.payee] || 0) + 1 }
    return [...new Set([...payees])].sort((a, b) => (counts[b] || 0) - (counts[a] || 0))
  }, [transactions, payees])
  const today = format(new Date(), 'yyyy-MM-dd')
  const initialTab = schedule.transactionType === 'income' ? 'recebimento'
    : schedule.transactionType === 'transfer' ? 'transferencia'
    : 'pagamento'

  const [tab, setTab] = useState(initialTab)

  const [payAccountId, setPayAccountId] = useState(schedule.accountId || '')
  const [payPayee, setPayPayee] = useState(schedule.payee || '')
  const [payAmount, setPayAmount] = useState(schedule.amount?.toString() || '')
  const [payDate, setPayDate] = useState(nextDate || today)
  const [payCategoryId, setPayCategoryId] = useState(schedule.categoryId || '')
  const [payGrupo, setPayGrupo] = useState(schedule.grupoGerencial || '')
  const [payNotes, setPayNotes] = useState(schedule.notes || '')

  const [recAccountId, setRecAccountId] = useState(schedule.accountId || '')
  const [recPayee, setRecPayee] = useState(schedule.payee || '')
  const [recAmount, setRecAmount] = useState(schedule.amount?.toString() || '')
  const [recDate, setRecDate] = useState(nextDate || today)
  const [recCategoryId, setRecCategoryId] = useState(schedule.categoryId || '')
  const [recNotes, setRecNotes] = useState(schedule.notes || '')

  const [trfFromId, setTrfFromId] = useState(schedule.accountId || '')
  const [trfToId, setTrfToId] = useState(schedule.toAccountId || '')
  const [trfAmount, setTrfAmount] = useState(schedule.amount?.toString() || '')
  const [trfDate, setTrfDate] = useState(nextDate || today)
  const [trfNotes, setTrfNotes] = useState(schedule.notes || '')

  const contaPrincipal =
    accounts.find(a => a.type === 'checking' && a.contaCorrentePrincipal) ||
    accounts.find(a => a.isMain && a.type !== 'credit') ||
    accounts.find(a => a.type === 'checking')

  const handleConfirm = () => {
    const regDate = nextDate || today
    if (tab === 'pagamento') {
      const amount = parseFloat(payAmount) || 0
      if (payPayee && !payees.includes(payPayee)) addPayee(payPayee)
      addTransaction({
        type: 'expense', accountId: payAccountId, payee: payPayee,
        amount, date: payDate, categoryId: payCategoryId,
        grupoGerencial: payGrupo || undefined,
        description: schedule.description, notes: payNotes,
      })
      markScheduleRegistered(schedule.id, regDate)
      if (payGrupo) {
        const grupo = gerencialGroups.find(g => g.id === payGrupo)
        if (grupo && grupo.number !== 'D') {
          if (grupo.number === 1) {
            const contaReserva = accounts.find(a => a.id === grupo.defaultAccountId)
            if (payAccountId && contaReserva) {
              addTransaction({ type: 'transfer', accountId: payAccountId, toAccountId: contaReserva.id, amount, date: payDate, description: `Reserva ${grupo.name}`, grupoGerencial: grupo.id })
            }
          } else {
            const contaResgate = accounts.find(a => a.id === grupo.defaultAccountId)
            if (contaResgate && contaPrincipal) {
              addTransaction({ type: 'transfer', accountId: contaResgate.id, toAccountId: contaPrincipal.id, amount, date: payDate, description: `Resgate ${grupo.name}`, grupoGerencial: grupo.id })
            }
          }
        }
      }
    } else if (tab === 'recebimento') {
      if (recPayee && !payees.includes(recPayee)) addPayee(recPayee)
      addTransaction({
        type: 'income', accountId: recAccountId, payee: recPayee,
        amount: parseFloat(recAmount) || 0, date: recDate,
        categoryId: recCategoryId, description: schedule.description, notes: recNotes,
      })
      markScheduleRegistered(schedule.id, regDate)
    } else {
      addTransaction({
        type: 'transfer', accountId: trfFromId, toAccountId: trfToId,
        amount: parseFloat(trfAmount) || 0, date: trfDate,
        description: schedule.description, notes: trfNotes,
      })
      markScheduleRegistered(schedule.id, regDate)
    }
    onClose()
  }

  const TAB_LABELS = { pagamento: 'Pagamento', recebimento: 'Recebimento', transferencia: 'Transferência' }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
          <div>
            <h3 className="font-semibold text-gray-100">Registrar Agendamento</h3>
            <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[280px]">{schedule.description}</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-300 rounded transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex border-b border-gray-800 shrink-0">
          {['pagamento', 'recebimento', 'transferencia'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                tab === t ? 'border-[#0F6E56] text-[#0F6E56]' : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {tab === 'pagamento' && (
            <>
              <div>
                <label className="label">Banco de</label>
                <select className="input" value={payAccountId} onChange={e => setPayAccountId(e.target.value)}>
                  <AccountOptions accounts={accounts} />
                </select>
              </div>
              <div>
                <label className="label">Favorecido</label>
                <FavorecidoAutocomplete value={payPayee} onChange={setPayPayee} suggestions={sortedPayees} placeholder="Favorecido" />
              </div>
              <div>
                <label className="label">Valor</label>
                <input className="input" type="number" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)} />
              </div>
              <div>
                <label className="label">Data</label>
                <input className="input" type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
              </div>
              <div>
                <label className="label">Categoria</label>
                <CategorySelect categories={categories} type="expense" value={payCategoryId} onChange={e => setPayCategoryId(e.target.value)} />
              </div>
              <div>
                <label className="label">Classificação Gerencial</label>
                <select className="input" value={payGrupo} onChange={e => setPayGrupo(e.target.value)}>
                  <option value="">Sem grupo</option>
                  {gerencialGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Anotações</label>
                <input className="input" value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder="Opcional" />
              </div>
            </>
          )}

          {tab === 'recebimento' && (
            <>
              <div>
                <label className="label">Banco para</label>
                <select className="input" value={recAccountId} onChange={e => setRecAccountId(e.target.value)}>
                  <AccountOptions accounts={accounts} />
                </select>
              </div>
              <div>
                <label className="label">Pagador</label>
                <FavorecidoAutocomplete value={recPayee} onChange={setRecPayee} suggestions={sortedPayees} placeholder="Pagador" />
              </div>
              <div>
                <label className="label">Valor</label>
                <input className="input" type="number" step="0.01" value={recAmount} onChange={e => setRecAmount(e.target.value)} />
              </div>
              <div>
                <label className="label">Data</label>
                <input className="input" type="date" value={recDate} onChange={e => setRecDate(e.target.value)} />
              </div>
              <div>
                <label className="label">Categoria</label>
                <CategorySelect categories={categories} type="income" value={recCategoryId} onChange={e => setRecCategoryId(e.target.value)} />
              </div>
              <div>
                <label className="label">Anotações</label>
                <input className="input" value={recNotes} onChange={e => setRecNotes(e.target.value)} placeholder="Opcional" />
              </div>
            </>
          )}

          {tab === 'transferencia' && (
            <>
              <div>
                <label className="label">Banco de</label>
                <select className="input" value={trfFromId} onChange={e => setTrfFromId(e.target.value)}>
                  <AccountOptions accounts={accounts} />
                </select>
              </div>
              <div>
                <label className="label">Banco para</label>
                <select className="input" value={trfToId} onChange={e => setTrfToId(e.target.value)}>
                  <AccountOptions accounts={accounts} />
                </select>
              </div>
              <div>
                <label className="label">Valor</label>
                <input className="input" type="number" step="0.01" value={trfAmount} onChange={e => setTrfAmount(e.target.value)} />
              </div>
              <div>
                <label className="label">Data</label>
                <input className="input" type="date" value={trfDate} onChange={e => setTrfDate(e.target.value)} />
              </div>
              <div>
                <label className="label">Anotações</label>
                <input className="input" value={trfNotes} onChange={e => setTrfNotes(e.target.value)} placeholder="Opcional" />
              </div>
            </>
          )}
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-gray-800 shrink-0">
          <button className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
          <button className="btn-primary flex-1 flex items-center justify-center gap-2" onClick={handleConfirm}>
            <CheckCircle size={14} /> Confirmar {TAB_LABELS[tab]}
          </button>
        </div>
      </div>
    </div>
  )
}

function EstornarModal({ schedule, nextDate, accounts, onClose, onConfirm }) {
  const acc = accounts.find(a => a.id === schedule.accountId)
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h3 className="font-semibold text-gray-100">Estornar Ocorrência</h3>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-300 rounded transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="bg-gray-800/60 rounded-lg p-3 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Favorecido</span>
              <span className="text-gray-200">{schedule.payee || '—'}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Valor</span>
              <span className="text-gray-200 font-bold">{fmt(schedule.amount)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Data</span>
              <span className="text-gray-200">{nextDate ? fmtDate(nextDate) : '—'}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Conta</span>
              <span className="text-gray-200">{acc?.apelido || acc?.name || '—'}</span>
            </div>
          </div>
          <p className="text-xs text-amber-400 bg-amber-400/10 rounded-lg px-3 py-2">
            Esta ação não pode ser desfeita. Deseja confirmar?
          </p>
        </div>
        <div className="flex gap-3 px-5 py-4 border-t border-gray-800">
          <button className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
          <button
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 rounded-lg transition-colors"
            onClick={onConfirm}
          >
            <RotateCcw size={14} /> Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}

function ExcluirModal({ schedule, nextDate, onClose, onConfirm }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h3 className="font-semibold text-gray-100">Excluir Agendamento</h3>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-300 rounded transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="bg-gray-800/60 rounded-lg p-3 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Favorecido</span>
              <span className="text-gray-200">{schedule.payee || '—'}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Valor</span>
              <span className="text-gray-200 font-bold">{fmt(schedule.amount)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Frequência</span>
              <span className="text-gray-200">{FREQ_LABELS[schedule.frequency] || schedule.frequency}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Próxima data</span>
              <span className="text-gray-200">{nextDate ? fmtDate(nextDate) : '—'}</span>
            </div>
          </div>
          <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">
            Esta ação não pode ser desfeita. Deseja confirmar?
          </p>
        </div>
        <div className="flex gap-3 px-5 py-4 border-t border-gray-800">
          <button className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
          <button
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg transition-colors"
            onClick={onConfirm}
          >
            <Trash2 size={14} /> Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}

function ScheduleRow({
  schedule, nextDate, categories, accounts, gerencialGroups,
  addTransaction, markScheduleRegistered, registerScheduleOccurrence, skipScheduleOccurrence,
  deleteSchedule, onEditSchedule,
  selectionMode, isSelected, onToggleSelect,
}) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const cat = categories.find(c => c.id === schedule.categoryId)
  const acc = accounts.find(a => a.id === schedule.accountId)
  const toAcc = accounts.find(a => a.id === schedule.toAccountId)
  const isDepositoReserva = schedule.transactionType === 'transfer' && !!toAcc?.isReserva
  const isResgateReserva  = schedule.transactionType === 'transfer' && !!acc?.isReserva && !isDepositoReserva
  const registered = schedule.registered || []
  const skipped = schedule.skipped || []
  const totalDone = registered.length + skipped.length
  const isInstallment = schedule.occurrenceType === 'installment'

  const daysLate = nextDate && nextDate < today
    ? differenceInDays(parseISO(today), parseISO(nextDate))
    : 0

  const [showPay, setShowPay] = useState(false)
  const [showEstornar, setShowEstornar] = useState(false)
  const [showExcluir, setShowExcluir] = useState(false)

  const displayDate = nextDate || (registered.length > 0 ? registered[registered.length - 1] : schedule.startDate)

  return (
    <>
      <tr className={`border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors group ${daysLate > 0 ? 'bg-red-500/5' : ''} ${!nextDate ? 'opacity-60' : ''} ${isSelected ? 'bg-indigo-500/5' : ''}`}>
        {/* Checkbox */}
        {selectionMode && (
          <td className="px-3 py-3 w-8">
            {nextDate ? (
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleSelect(schedule.id)}
                onClick={e => e.stopPropagation()}
                className="w-4 h-4 rounded accent-[#0F6E56] cursor-pointer"
              />
            ) : (
              <div className="w-4 h-4" />
            )}
          </td>
        )}

        {/* Próxima Data */}
        <td className="px-3 py-3 whitespace-nowrap">
          {nextDate ? (
            <div>
              <p className="text-xs text-gray-300 font-medium">{fmtDate(nextDate)}</p>
              {daysLate > 0 && (
                <span className="inline-flex items-center gap-0.5 mt-0.5 text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-medium">
                  <AlertTriangle size={9} />
                  {daysLate}d em atraso
                </span>
              )}
            </div>
          ) : (
            <div>
              <p className="text-xs text-gray-600 font-medium">{displayDate ? fmtDate(displayDate) : '—'}</p>
              <span className="text-xs text-gray-700">Concluído</span>
            </div>
          )}
        </td>

        {/* Descrição */}
        <td className="px-3 py-3 max-w-[200px]">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-xs text-gray-200 font-medium truncate">{schedule.description}</p>
            {schedule.transactionType === 'expense' && (
              <GerBadge grupoId={schedule.grupoGerencial} gerencialGroups={gerencialGroups} />
            )}
            {isInstallment && (
              <span className="text-xs bg-gray-700/60 text-gray-400 px-1 py-0.5 rounded whitespace-nowrap">
                {totalDone}/{schedule.installments}x
              </span>
            )}
          </div>
          {schedule.transactionType === 'transfer' ? (
            <p className="text-xs text-gray-600 mt-0.5 truncate">
              <span className="text-purple-400">↔</span>{' '}
              {acc?.apelido || acc?.name || '?'} → {toAcc?.apelido || toAcc?.name || '?'}
            </p>
          ) : acc ? (
            <p className="text-xs text-gray-600 mt-0.5 truncate">{acc.apelido || acc.name}</p>
          ) : null}
        </td>

        {/* Movimentação */}
        <td className="px-3 py-3 whitespace-nowrap">
          {schedule.transactionType === 'income' ? (
            <span className="inline-flex items-center gap-1 text-xs bg-blue-500/15 text-blue-600 px-2 py-0.5 rounded font-medium">
              <ArrowDownCircle size={11} /> Receita
            </span>
          ) : isDepositoReserva ? (
            <span className="inline-flex items-center gap-1 text-xs bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded font-medium">
              <ArrowDownCircle size={11} /> Depósito Reserva
            </span>
          ) : isResgateReserva ? (
            <span className="inline-flex items-center gap-1 text-xs bg-orange-500/15 text-orange-600 px-2 py-0.5 rounded font-medium">
              <ArrowUpCircle size={11} /> Resgate Reserva
            </span>
          ) : schedule.transactionType === 'transfer' ? (
            <span className="inline-flex items-center gap-1 text-xs bg-purple-500/15 text-purple-400 px-2 py-0.5 rounded font-medium">
              <ArrowLeftRight size={11} /> Transferência
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs bg-orange-500/15 text-orange-600 px-2 py-0.5 rounded font-medium">
              <ArrowUpCircle size={11} /> Despesa
            </span>
          )}
        </td>

        {/* Categoria */}
        <td className="px-3 py-3 hidden md:table-cell">
          {cat
            ? <span className="text-xs text-gray-400">{cat.icon} {cat.name}</span>
            : <span className="text-gray-700 text-xs">—</span>}
        </td>

        {/* Favorecido */}
        <td className="px-3 py-3 hidden lg:table-cell">
          <span className="text-xs text-gray-400 truncate max-w-[120px] block">{schedule.payee || <span className="text-gray-700">—</span>}</span>
        </td>

        {/* Valor */}
        <td className="px-3 py-3 whitespace-nowrap text-right">
          <span className={`text-sm font-bold ${schedule.transactionType === 'income' ? 'text-blue-600' : isDepositoReserva ? 'text-emerald-400' : isResgateReserva ? 'text-orange-600' : schedule.transactionType === 'transfer' ? 'text-purple-400' : 'text-orange-600'}`}>
            {fmt(schedule.amount)}
          </span>
        </td>

        {/* Frequência */}
        <td className="px-3 py-3 whitespace-nowrap hidden sm:table-cell">
          <span className="text-xs text-gray-500">{FREQ_LABELS[schedule.frequency] || schedule.frequency}</span>
        </td>

        {/* Ações */}
        <td className="px-3 py-3 whitespace-nowrap">
          <div className="flex items-center gap-1">
            {nextDate && (
              <>
                <button
                  onClick={() => setShowPay(true)}
                  title="Pagar"
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-500/20 text-blue-600 rounded hover:bg-blue-500/30 transition-colors font-medium"
                >
                  <CheckCircle size={12} /> Pagar
                </button>
                <button
                  onClick={() => setShowEstornar(true)}
                  title="Estornar"
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-orange-500/15 text-orange-600 rounded hover:bg-orange-500/25 transition-colors font-medium"
                >
                  <RotateCcw size={12} /> Estornar
                </button>
              </>
            )}
            <button onClick={() => onEditSchedule(schedule)} className="p-1.5 text-gray-600 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors">
              <Edit2 size={12} />
            </button>
            <button onClick={() => setShowExcluir(true)} className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors">
              <Trash2 size={12} />
            </button>
          </div>
        </td>
      </tr>

      {showPay && (
        <PayModal
          schedule={schedule}
          nextDate={nextDate}
          accounts={accounts}
          categories={categories}
          gerencialGroups={gerencialGroups}
          addTransaction={addTransaction}
          markScheduleRegistered={markScheduleRegistered}
          onClose={() => setShowPay(false)}
        />
      )}

      {showEstornar && (
        <EstornarModal
          schedule={schedule}
          nextDate={nextDate}
          accounts={accounts}
          onClose={() => setShowEstornar(false)}
          onConfirm={() => { skipScheduleOccurrence(schedule.id, nextDate); setShowEstornar(false) }}
        />
      )}

      {showExcluir && (
        <ExcluirModal
          schedule={schedule}
          nextDate={nextDate}
          onClose={() => setShowExcluir(false)}
          onConfirm={() => { deleteSchedule(schedule.id); setShowExcluir(false) }}
        />
      )}
    </>
  )
}

function BatchRegisterModal({ selectedRows, accounts, onConfirm, onClose }) {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const total = selectedRows.reduce((sum, r) => sum + (r.schedule.amount || 0), 0)

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
          <h3 className="font-semibold text-gray-100">
            Registrar {selectedRows.length} agendamento{selectedRows.length !== 1 ? 's' : ''}
          </h3>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-300 rounded transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Date picker */}
          <div>
            <label className="label">Data de registro</label>
            <input
              type="date"
              className="input"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>

          {/* List of selected items */}
          <div className="rounded-lg border border-gray-800 overflow-hidden">
            {selectedRows.map(({ schedule, nextDate }) => {
              const acc = accounts.find(a => a.id === schedule.accountId)
              const valueColor = schedule.transactionType === 'income' ? 'text-blue-400'
                : schedule.transactionType === 'transfer' ? 'text-purple-400'
                : 'text-orange-500'
              return (
                <div key={schedule.id} className="flex items-center justify-between px-3 py-2.5 border-b border-gray-800/80 last:border-0 hover:bg-gray-800/30">
                  <div className="min-w-0 flex-1 mr-3">
                    <p className="text-xs font-medium text-gray-200 truncate">{schedule.description}</p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {acc?.apelido || acc?.name || '—'} · prev. {fmtDate(nextDate)}
                    </p>
                  </div>
                  <span className={`text-xs font-bold shrink-0 ${valueColor}`}>{fmt(schedule.amount)}</span>
                </div>
              )
            })}
          </div>

          {/* Total */}
          <div className="flex items-center justify-between px-3 py-2.5 bg-gray-800/60 rounded-lg">
            <span className="text-sm text-gray-400 font-medium">Total</span>
            <span className="text-base font-bold text-gray-100">{fmt(total)}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-gray-800 shrink-0">
          <button className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
          <button
            className="btn-primary flex-1 flex items-center justify-center gap-2"
            onClick={() => onConfirm(date)}
          >
            <CheckCircle size={14} /> Confirmar Registro
          </button>
        </div>
      </div>
    </div>
  )
}

function Toast({ message }) {
  return (
    <div className="fixed bottom-6 right-6 z-[200] flex items-center gap-3 bg-gray-900 border border-emerald-500/30 text-gray-100 text-sm px-4 py-3 rounded-xl shadow-2xl pointer-events-none">
      <CheckCircle size={16} className="text-emerald-400 shrink-0" />
      {message}
    </div>
  )
}

function SchedulesTable({ schedules, categories, accounts, gerencialGroups, addTransaction, markScheduleRegistered, deleteSchedule, registerScheduleOccurrence, skipScheduleOccurrence, getNextOccurrences, onNewSchedule, onEditSchedule }) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const in7 = format(addDays(new Date(), 7), 'yyyy-MM-dd')
  const in30 = format(addDays(new Date(), 30), 'yyyy-MM-dd')

  // Selection state
  const [selectionMode, setSelectionMode] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [showBatchRegister, setShowBatchRegister] = useState(false)
  const [showBatchSkip, setShowBatchSkip] = useState(false)
  const [toast, setToast] = useState(null)

  const rows = useMemo(() => schedules.map(s => ({
    schedule: s,
    nextDate: getNextOccurrences(s, 1)[0] || null,
  })), [schedules, getNextOccurrences])

  const overdue    = rows.filter(r => r.nextDate && r.nextDate < today).sort((a, b) => a.nextDate.localeCompare(b.nextDate))
  const next7      = rows.filter(r => r.nextDate && r.nextDate >= today && r.nextDate <= in7).sort((a, b) => a.nextDate.localeCompare(b.nextDate))
  const next30     = rows.filter(r => r.nextDate && r.nextDate > in7 && r.nextDate <= in30).sort((a, b) => a.nextDate.localeCompare(b.nextDate))
  const future     = rows.filter(r => r.nextDate && r.nextDate > in30).sort((a, b) => a.nextDate.localeCompare(b.nextDate))
  const completed  = rows.filter(r => !r.nextDate).sort((a, b) => (b.schedule.startDate || '').localeCompare(a.schedule.startDate || ''))

  const selectableRows = rows.filter(r => r.nextDate)
  const allSelected = selectableRows.length > 0 && selectableRows.every(r => selected.has(r.schedule.id))
  const selectedRows = rows.filter(r => selected.has(r.schedule.id) && r.nextDate)

  const toggleSelect = (id) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(selectableRows.map(r => r.schedule.id)))
    }
  }

  const cancelSelection = () => {
    setSelectionMode(false)
    setSelected(new Set())
  }

  const showToastMsg = (message) => {
    setToast(message)
    setTimeout(() => setToast(null), 3000)
  }

  const contaPrincipal =
    accounts.find(a => a.type === 'checking' && a.contaCorrentePrincipal) ||
    accounts.find(a => a.isMain && a.type !== 'credit') ||
    accounts.find(a => a.type === 'checking')

  const registerWithGerencial = (schedule, date) => {
    registerScheduleOccurrence(schedule.id, date)
    if (!schedule.grupoGerencial) return
    const grupo = gerencialGroups.find(g => g.id === schedule.grupoGerencial)
    if (!grupo || grupo.number === 'D') return
    if (grupo.number === 1) {
      const contaReserva = accounts.find(a => a.id === grupo.defaultAccountId)
      if (schedule.accountId && contaReserva) {
        addTransaction({ type: 'transfer', accountId: schedule.accountId, toAccountId: contaReserva.id, amount: schedule.amount, date, description: `Reserva ${grupo.name}`, grupoGerencial: grupo.id })
      }
    } else {
      const contaResgate = accounts.find(a => a.id === grupo.defaultAccountId)
      if (contaResgate && contaPrincipal) {
        addTransaction({ type: 'transfer', accountId: contaResgate.id, toAccountId: contaPrincipal.id, amount: schedule.amount, date, description: `Resgate ${grupo.name}`, grupoGerencial: grupo.id })
      }
    }
  }

  const handleBatchRegister = (date) => {
    const count = selectedRows.length
    selectedRows.forEach(({ schedule }) => registerWithGerencial(schedule, date))
    cancelSelection()
    setShowBatchRegister(false)
    showToastMsg(`${count} lançamento${count !== 1 ? 's' : ''} registrado${count !== 1 ? 's' : ''} com sucesso`)
  }

  const handleBatchSkip = () => {
    const count = selectedRows.length
    selectedRows.forEach(({ schedule, nextDate }) => skipScheduleOccurrence(schedule.id, nextDate))
    cancelSelection()
    setShowBatchSkip(false)
    showToastMsg(`${count} agendamento${count !== 1 ? 's' : ''} pulado${count !== 1 ? 's' : ''}`)
  }

  if (schedules.length === 0) {
    return (
      <div className="card text-center py-12">
        <Calendar size={32} className="text-gray-700 mx-auto mb-3" />
        <p className="text-gray-500">Nenhum agendamento encontrado</p>
        <button className="btn-primary mt-4" onClick={onNewSchedule}>Criar primeiro agendamento</button>
      </div>
    )
  }

  const cols = selectionMode ? 10 : 9
  const rowProps = {
    categories, accounts, gerencialGroups, addTransaction, markScheduleRegistered,
    registerScheduleOccurrence, skipScheduleOccurrence,
    deleteSchedule, onEditSchedule,
    selectionMode, onToggleSelect: toggleSelect,
  }

  return (
    <>
      {/* Selection action bar */}
      {selectionMode && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
          <span className="text-sm font-medium text-indigo-300">
            {selected.size} selecionado{selected.size !== 1 ? 's' : ''}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowBatchRegister(true)}
              disabled={selected.size === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <CheckCircle size={12} /> Registrar selecionados
            </button>
            <button
              onClick={() => setShowBatchSkip(true)}
              disabled={selected.size === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <SkipForward size={12} /> Pular selecionados
            </button>
            <button
              onClick={cancelSelection}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 rounded-lg transition-colors"
            >
              <X size={12} /> Cancelar seleção
            </button>
          </div>
        </div>
      )}

      {/* Table card */}
      <div className="card p-0 overflow-hidden">
        {!selectionMode && selectableRows.length > 0 && (
          <div className="flex justify-end px-3 pt-2.5 pb-0">
            <button
              onClick={() => setSelectionMode(true)}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              <MousePointer2 size={11} /> Selecionar
            </button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {selectionMode && (
                  <th className="px-3 py-2.5 w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded accent-[#0F6E56] cursor-pointer"
                      title="Selecionar todos"
                    />
                  </th>
                )}
                <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium whitespace-nowrap">Data</th>
                <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium">Descrição</th>
                <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium whitespace-nowrap">Movimentação</th>
                <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium hidden md:table-cell">Categoria</th>
                <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium hidden lg:table-cell">Favorecido</th>
                <th className="text-right px-3 py-2.5 text-xs text-gray-400 font-medium">Valor</th>
                <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium hidden sm:table-cell whitespace-nowrap">Frequência</th>
                <th className="px-3 py-2.5 text-xs text-gray-400 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {overdue.length > 0 && (
                <>
                  <SectionHeader label="Em atraso" count={overdue.length} variant="overdue" cols={cols} />
                  {overdue.map(({ schedule, nextDate }) => (
                    <ScheduleRow key={schedule.id} schedule={schedule} nextDate={nextDate} {...rowProps} isSelected={selected.has(schedule.id)} />
                  ))}
                </>
              )}
              {next7.length > 0 && (
                <>
                  <SectionHeader label="Próximos 7 dias" count={next7.length} variant="soon" cols={cols} />
                  {next7.map(({ schedule, nextDate }) => (
                    <ScheduleRow key={schedule.id} schedule={schedule} nextDate={nextDate} {...rowProps} isSelected={selected.has(schedule.id)} />
                  ))}
                </>
              )}
              {next30.length > 0 && (
                <>
                  <SectionHeader label="Próximos 30 dias" count={next30.length} variant="month" cols={cols} />
                  {next30.map(({ schedule, nextDate }) => (
                    <ScheduleRow key={schedule.id} schedule={schedule} nextDate={nextDate} {...rowProps} isSelected={selected.has(schedule.id)} />
                  ))}
                </>
              )}
              {future.length > 0 && (
                <>
                  <SectionHeader label="Futuros" count={future.length} variant="default" cols={cols} />
                  {future.map(({ schedule, nextDate }) => (
                    <ScheduleRow key={schedule.id} schedule={schedule} nextDate={nextDate} {...rowProps} isSelected={selected.has(schedule.id)} />
                  ))}
                </>
              )}
              {completed.length > 0 && (
                <>
                  <SectionHeader label="Concluídos" count={completed.length} variant="history" cols={cols} />
                  {completed.map(({ schedule, nextDate }) => (
                    <ScheduleRow key={schedule.id} schedule={schedule} nextDate={nextDate} {...rowProps} isSelected={selected.has(schedule.id)} />
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Batch register modal */}
      {showBatchRegister && (
        <BatchRegisterModal
          selectedRows={selectedRows}
          accounts={accounts}
          onConfirm={handleBatchRegister}
          onClose={() => setShowBatchRegister(false)}
        />
      )}

      {/* Batch skip confirmation */}
      <ConfirmDialog
        open={showBatchSkip}
        onClose={() => setShowBatchSkip(false)}
        onConfirm={handleBatchSkip}
        title="Pular selecionados"
        message={`Pular ${selectedRows.length} agendamento${selectedRows.length !== 1 ? 's' : ''}? Esta ação não pode ser desfeita.`}
      />

      {/* Toast */}
      {toast && <Toast message={toast} />}
    </>
  )
}

const MONTHS_PT_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
function faturaLabel(ym) {
  if (!ym) return '—'
  const [y, m] = ym.split('-').map(Number)
  return `${MONTHS_PT_FULL[m - 1]}/${y}`
}

function ExecutarGerenciaisModal({ provisoes, accounts, onConfirm, onClose }) {
  const [selected, setSelected] = useState(() => new Set(provisoes.map(p => p.id)))
  const toggle = (id) => setSelected(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })
  const total = provisoes.filter(p => selected.has(p.id)).reduce((s, p) => s + p.amount, 0)
  const accName = (id) => { const a = accounts.find(x => x.id === id); return a ? (a.apelido || a.name) : '—' }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
          <div>
            <h3 className="font-semibold text-gray-100">Executar Provisões Gerenciais</h3>
            <p className="text-xs text-gray-500 mt-0.5">Transferência imediata Conta Principal → Ger. para cada parcela marcada</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-300 rounded transition-colors"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {provisoes.map(p => (
            <label key={p.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-800 hover:bg-gray-800/30 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(p.id)}
                onChange={() => toggle(p.id)}
                className="w-4 h-4 rounded accent-[#0F6E56] cursor-pointer shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-gray-200 truncate">{p.description}</p>
                <p className="text-xs text-gray-600 mt-0.5 truncate">
                  Fatura {faturaLabel(p.faturaMonthYear)} · {accName(p.contaOrigemId)} → {accName(p.contaDestinoId)}
                </p>
              </div>
              <span className="text-xs font-bold text-orange-600 shrink-0">{fmt(p.amount)}</span>
            </label>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-gray-800 flex items-center justify-between shrink-0">
          <span className="text-sm text-gray-400">{selected.size} selecionada{selected.size !== 1 ? 's' : ''}</span>
          <span className="text-base font-bold text-gray-100">{fmt(total)}</span>
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-gray-800 shrink-0">
          <button className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
          <button
            className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={selected.size === 0}
            onClick={() => onConfirm([...selected])}
          >
            <CheckCircle size={14} /> Confirmar ({selected.size})
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SchedulePanel() {
  const {
    profileSchedules: schedules, schedules: allSchedules,
    categories, profileAccounts: accounts, accounts: allAccounts,
    payables, updatePayable, deletePayable,
    gerencialGroups, addTransaction,
    deleteSchedule, registerScheduleOccurrence, skipScheduleOccurrence,
    markScheduleRegistered, getNextOccurrences,
    getProvisoesPendentes, executarProvisoesGerenciais,
    activeProfileId,
  } = useApp()

  const provisoesPendentes = useMemo(() => getProvisoesPendentes(), [getProvisoesPendentes])
  const [showExecutarGer, setShowExecutarGer] = useState(false)

  const [activeTab, setActiveTab] = useState('conta')
  const [viewFilter, setViewFilter] = useState('future')
  const [showForm, setShowForm] = useState(false)
  const [editSchedule, setEditSchedule] = useState(null)
  const [confirmDeletePayable, setConfirmDeletePayable] = useState(null)
  const [showZeroed, setShowZeroed] = useState(false)

  // Filtros em tempo real (aba Agendamentos)
  const [fltFrom, setFltFrom] = useState('')
  const [fltTo, setFltTo] = useState('')
  const [fltDesc, setFltDesc] = useState('')
  const [fltPayee, setFltPayee] = useState('')
  const [fltCat, setFltCat] = useState('')
  const [fltMin, setFltMin] = useState('')
  const [fltMax, setFltMax] = useState('')
  const hasActiveFilter = fltFrom || fltTo || fltDesc.trim() || fltPayee.trim() || fltCat || fltMin !== '' || fltMax !== ''
  const clearFilters = () => { setFltFrom(''); setFltTo(''); setFltDesc(''); setFltPayee(''); setFltCat(''); setFltMin(''); setFltMax('') }

  const raAccountIds = useMemo(() => {
    const ids = new Set()
    gerencialGroups.forEach(g => {
      if (typeof g.number === 'number' && g.number !== 1 && g.defaultAccountId) ids.add(g.defaultAccountId)
    })
    return ids
  }, [gerencialGroups])

  const rawPending = useMemo(() => schedules.filter(s => getNextOccurrences(s, 1).length > 0), [schedules, getNextOccurrences])
  const allPending = useMemo(() => showZeroed ? rawPending : rawPending.filter(s => Number(s.amount) !== 0), [rawPending, showZeroed])

  // Pertence ao perfil ativo? Em "Tudo" (activeProfileId nulo) sempre true.
  // Caso contrário, mostra se a conta pertence ao perfil OU não está vinculada a
  // perfil nenhum (untagged) — só esconde o que é explicitamente de OUTRO perfil.
  // Usa allAccounts (não o filtrado) para não excluir cartões indevidamente.
  const accountInProfile = (accId) => {
    if (!activeProfileId) return true
    const acc = allAccounts.find(a => a.id === accId)
    return !acc || !acc.profileId || acc.profileId === activeProfileId
  }

  // CORREÇÃO 1: faturas de TODOS os cartões (não só do primeiro). O filtro de
  // perfil agora compara o profileId real do cartão, sem depender de profileAccounts.
  const invoicePayables   = (payables || []).filter(p => p.origin === 'invoice' && accountInProfile(p.cartaoId))
  const displayInvoice    = showZeroed ? invoicePayables : invoicePayables.filter(p => Number(p.amount) !== 0 && p.status !== 'paid')
  const pendingInvoice    = displayInvoice.filter(p => p.status === 'pending').length

  // CORREÇÃO 3: contas de origem "gerenciais" = subcontas "Ger. ..." (têm grupoGerencial
  // no próprio account) + contas de resgate dos grupos numerados (raAccountIds).
  const gerencialOrigemIds = useMemo(() => {
    const ids = new Set(raAccountIds)
    allAccounts.forEach(a => { if (a.grupoGerencial) ids.add(a.id) })
    return ids
  }, [allAccounts, raAccountIds])

  // Agendamentos de devolução/resgate: transfer de conta gerencial → conta principal.
  // Usa allSchedules porque as subcontas "Ger." não carregam profileId; o perfil é
  // respeitado filtrando pela conta de destino (principal).
  const gerencialResgates = useMemo(
    () => allSchedules.filter(s =>
      s.transactionType === 'transfer' &&
      gerencialOrigemIds.has(s.accountId) &&
      !gerencialOrigemIds.has(s.toAccountId) &&
      accountInProfile(s.toAccountId)
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allSchedules, gerencialOrigemIds, activeProfileId, allAccounts]
  )
  const displayGerencial = showZeroed ? gerencialResgates : gerencialResgates.filter(s => Number(s.amount) !== 0)
  const pendingGerencial = displayGerencial.filter(s => getNextOccurrences(s, 1).length > 0).length

  const filteredSchedules = useMemo(() => {
    const now = new Date()
    const todayStr  = format(now, 'yyyy-MM-dd')
    const in30Str   = format(addDays(now, 30), 'yyyy-MM-dd')
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const lastDay    = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const monthEnd   = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    if (viewFilter === 'all')     return schedules
    if (viewFilter === 'history') return schedules.filter(s => getNextOccurrences(s, 1).length === 0)
    if (viewFilter === 'future')  return schedules.filter(s => getNextOccurrences(s, 1).length > 0)
    if (viewFilter === 'next30')  return schedules.filter(s => {
      const next = getNextOccurrences(s, 1)[0]
      return next && next <= in30Str
    })
    if (viewFilter === 'month')   return schedules.filter(s => {
      const next = getNextOccurrences(s, 1)[0]
      return next && next >= monthStart && next <= monthEnd
    })
    if (viewFilter === 'ra') return schedules.filter(s =>
      s.transactionType === 'transfer' &&
      (raAccountIds.has(s.accountId) || raAccountIds.has(s.toAccountId))
    )
    return schedules
  }, [schedules, viewFilter, getNextOccurrences, raAccountIds])

  const displaySchedules = useMemo(
    () => showZeroed ? filteredSchedules : filteredSchedules.filter(s => Number(s.amount) !== 0),
    [filteredSchedules, showZeroed]
  )

  // Filtros em tempo real (data / descrição / categoria / valor) sobre a lista já filtrada por período
  const searchedSchedules = useMemo(() => {
    const desc = fltDesc.trim().toLowerCase()
    const payee = fltPayee.trim().toLowerCase()
    const min = fltMin !== '' ? parseFloat(fltMin) : null
    const max = fltMax !== '' ? parseFloat(fltMax) : null
    if (!desc && !payee && !fltCat && !fltFrom && !fltTo && min === null && max === null) return displaySchedules
    return displaySchedules.filter(s => {
      if (desc && !(s.description || '').toLowerCase().includes(desc)) return false
      if (payee && !(s.payee || '').toLowerCase().includes(payee)) return false
      if (fltCat && s.categoryId !== fltCat) return false
      const amt = Number(s.amount) || 0
      if (min !== null && amt < min) return false
      if (max !== null && amt > max) return false
      if (fltFrom || fltTo) {
        const d = getNextOccurrences(s, 1)[0] || s.startDate || ''
        if (fltFrom && d < fltFrom) return false
        if (fltTo && d > fltTo) return false
      }
      return true
    })
  }, [displaySchedules, fltDesc, fltPayee, fltCat, fltFrom, fltTo, fltMin, fltMax, getNextOccurrences])

  const handleMarkPaid = id => updatePayable(id, { status: 'paid', paidAt: new Date().toISOString() })
  const handleDeletePayable = id => { deletePayable(id); setConfirmDeletePayable(null) }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-300">Agendamentos & Contas a Pagar</h2>
          <p className="text-xs text-gray-500 mt-0.5">{allPending.length} pendentes · {pendingInvoice} faturas · {pendingGerencial} resgates</p>
        </div>
        <div className="flex items-center gap-2">
          {provisoesPendentes.length > 0 && (
            <button className="btn-secondary flex items-center gap-2" onClick={() => setShowExecutarGer(true)}>
              <BarChart3 size={14} /> Executar Gerenciais ({provisoesPendentes.length})
            </button>
          )}
          {activeTab === 'conta' && (
            <button className="btn-primary flex items-center gap-2" onClick={() => { setEditSchedule(null); setShowForm(true) }}>
              <Plus size={14} /> Novo Agendamento
            </button>
          )}
        </div>
      </div>

      <div className="border-b border-gray-800 flex items-center gap-0 overflow-x-auto">
        <TabButton active={activeTab === 'conta'} onClick={() => setActiveTab('conta')} badge={allPending.length}>
          <Calendar size={14} /> Agendamentos
        </TabButton>
        <TabButton active={activeTab === 'cartao'} onClick={() => setActiveTab('cartao')} badge={pendingInvoice}>
          <CreditCard size={14} /> Cartão de Crédito
        </TabButton>
        <TabButton active={activeTab === 'gerencial'} onClick={() => setActiveTab('gerencial')} badge={pendingGerencial}>
          <BarChart3 size={14} /> Gerencial
        </TabButton>
        <button
          onClick={() => setShowZeroed(v => !v)}
          className={`ml-auto flex items-center gap-1.5 px-3 py-2.5 text-xs whitespace-nowrap transition-colors shrink-0 ${
            showZeroed ? 'text-[#0F6E56]' : 'text-gray-600 hover:text-gray-400'
          }`}
        >
          <Eye size={11} /> {showZeroed ? 'Ocultar zerados' : 'Mostrar zerados'}
        </button>
      </div>

      {activeTab === 'conta' && (
        <>
          {/* Filter chips */}
          <div className="flex flex-wrap gap-2">
            {VIEW_FILTERS.map(f => (
              <button
                key={f.id}
                onClick={() => setViewFilter(f.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                  viewFilter === f.id
                    ? 'bg-[#0F6E56] text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
                }`}
              >
                {f.id === 'history' && <History size={11} />}
                {f.id === 'ra' && <ArrowLeftRight size={11} />}
                {f.label}
                {f.id === 'future' && <span className="text-xs opacity-70">{allPending.length}</span>}
              </button>
            ))}
          </div>

          {/* Barra de filtros (tempo real) */}
          <div className="card grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2 items-end">
            <div>
              <label className="label text-xs">Data de</label>
              <input type="date" className="input py-1.5 text-xs" value={fltFrom} onChange={e => setFltFrom(e.target.value)} />
            </div>
            <div>
              <label className="label text-xs">Data até</label>
              <input type="date" className="input py-1.5 text-xs" value={fltTo} onChange={e => setFltTo(e.target.value)} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="label text-xs">Descrição</label>
              <input type="text" className="input py-1.5 text-xs" value={fltDesc} onChange={e => setFltDesc(e.target.value)} placeholder="Buscar..." />
            </div>
            <div>
              <label className="label text-xs">Favorecido</label>
              <input type="text" className="input py-1.5 text-xs" value={fltPayee} onChange={e => setFltPayee(e.target.value)} placeholder="Buscar..." />
            </div>
            <div>
              <label className="label text-xs">Categoria</label>
              <CategorySelect categories={categories} value={fltCat} onChange={e => setFltCat(e.target.value)} className="input py-1.5 text-xs" />
            </div>
            <div>
              <label className="label text-xs">Valor de</label>
              <input type="number" step="0.01" className="input py-1.5 text-xs" value={fltMin} onChange={e => setFltMin(e.target.value)} placeholder="0,00" />
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="label text-xs">Valor até</label>
                <input type="number" step="0.01" className="input py-1.5 text-xs" value={fltMax} onChange={e => setFltMax(e.target.value)} placeholder="0,00" />
              </div>
              {hasActiveFilter && (
                <button onClick={clearFilters} title="Limpar filtros" className="p-1.5 mb-0.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors shrink-0">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <SchedulesTable
            schedules={searchedSchedules}
            categories={categories}
            accounts={accounts}
            gerencialGroups={gerencialGroups}
            addTransaction={addTransaction}
            markScheduleRegistered={markScheduleRegistered}
            deleteSchedule={deleteSchedule}
            registerScheduleOccurrence={registerScheduleOccurrence}
            skipScheduleOccurrence={skipScheduleOccurrence}
            getNextOccurrences={getNextOccurrences}
            onNewSchedule={() => { setEditSchedule(null); setShowForm(true) }}
            onEditSchedule={s => { setEditSchedule(s); setShowForm(true) }}
          />
        </>
      )}

      {activeTab === 'cartao' && (
        <div className="space-y-3">
          {displayInvoice.length === 0 ? (
            <div className="card text-center py-12">
              <CreditCard size={32} className="text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Nenhuma fatura gerada</p>
              <p className="text-gray-600 text-xs mt-1">As faturas são geradas automaticamente ao importar lançamentos de cartão</p>
            </div>
          ) : (
            displayInvoice.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map(p => (
              <PayableCard key={p.id} payable={p} gerencialGroups={gerencialGroups} accounts={allAccounts} onMarkPaid={handleMarkPaid} onDelete={() => setConfirmDeletePayable(p)} />
            ))
          )}
        </div>
      )}

      {activeTab === 'gerencial' && (
        displayGerencial.length === 0 ? (
          <div className="card text-center py-12">
            <BarChart3 size={32} className="text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Nenhum resgate gerencial agendado</p>
            <p className="text-gray-600 text-xs mt-1">Lançamentos no Grupo Gerencial (1) geram agendamentos de devolução das subcontas "Ger." para a conta principal</p>
          </div>
        ) : (
          <SchedulesTable
            schedules={displayGerencial}
            categories={categories}
            accounts={allAccounts}
            gerencialGroups={gerencialGroups}
            addTransaction={addTransaction}
            markScheduleRegistered={markScheduleRegistered}
            deleteSchedule={deleteSchedule}
            registerScheduleOccurrence={registerScheduleOccurrence}
            skipScheduleOccurrence={skipScheduleOccurrence}
            getNextOccurrences={getNextOccurrences}
            onNewSchedule={() => { setEditSchedule(null); setShowForm(true) }}
            onEditSchedule={s => { setEditSchedule(s); setShowForm(true) }}
          />
        )
      )}

      <Modal open={showForm} onClose={() => { setShowForm(false); setEditSchedule(null) }} title={editSchedule ? 'Editar Agendamento' : 'Novo Agendamento'} size="lg">
        <ScheduleForm initial={editSchedule} onClose={() => { setShowForm(false); setEditSchedule(null) }} />
      </Modal>

      <ConfirmDialog
        open={!!confirmDeletePayable}
        onClose={() => setConfirmDeletePayable(null)}
        onConfirm={() => handleDeletePayable(confirmDeletePayable?.id)}
        title="Excluir Conta a Pagar"
        message={`Excluir "${confirmDeletePayable?.description}"?`}
        danger
      />

      {showExecutarGer && (
        <ExecutarGerenciaisModal
          provisoes={provisoesPendentes}
          accounts={accounts}
          onClose={() => setShowExecutarGer(false)}
          onConfirm={(ids) => { executarProvisoesGerenciais(ids); setShowExecutarGer(false) }}
        />
      )}
    </div>
  )
}
