import { useMemo, useState } from 'react'
import {
  Plus, Calendar, CheckCircle, SkipForward, Trash2, Edit2,
  Clock, CreditCard, BarChart3, ArrowDownCircle, ArrowUpCircle, AlertTriangle, History, ArrowLeftRight,
  MousePointer2, X, Eye, RotateCcw, Circle, Hourglass, ChevronRight, ChevronDown,
} from 'lucide-react'
import { addDays, format, differenceInDays, parseISO } from 'date-fns'
import { useApp } from '../../context/AppContext'
import { useRegisterFab } from '../../context/FabContext'
import { fmt, fmtDate } from '../shared/utils'
import { prevMonthScheduleDate } from '../../lib/fatura'
import Modal from '../shared/Modal'
import ConfirmDialog from '../shared/ConfirmDialog'
import ScheduleForm from './ScheduleForm'
import ProvisaoForm from './ProvisaoForm'
import AccountOptions from '../shared/AccountOptions'
import CategorySelect from '../shared/CategorySelect'
import ValueFilterDropdown from '../shared/ValueFilterDropdown'
import FavorecidoAutocomplete from '../shared/FavorecidoAutocomplete'
import DateInput from '../shared/DateInput'

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
  { id: 'future',    label: 'Todos os futuros' },
  { id: 'next30',    label: 'Próximos 30 dias' },
  { id: 'month',     label: 'Este mês' },
  { id: 'all',       label: 'Todos' },
  { id: 'provisoes', label: 'Provisões' },
  { id: 'history',   label: 'Histórico' },
  { id: 'ra',        label: 'Resgates Anuais' },
]

// Quantas ocorrências futuras listar ao expandir um agendamento recorrente de valor fixo.
const FUTURE_OCC_COUNT = 12

// Tipos de agendamento de cartão/gerencial que o motor gera UM POR FATURA (frequency 'once',
// id fsch_<card>_<yyyymm>_<slot>). Várias faturas da mesma série devem virar UMA linha.
const SERIES_TIPOS = new Set(['pagamento_fatura', 'resgate_reserva', 'gerencial_devolucao'])

// Chave lógica da série (independente da fatura): agrupa as ocorrências por-fatura de um mesmo
// fluxo. Para o resgate, accountId (conta-origem) entra na chave → origens distintas ficam
// separadas. Devolve null para agendamentos que NÃO são série de fatura.
function seriesKeyOf(s) {
  if (SERIES_TIPOS.has(s.tipo)) {
    return `${s.tipo}|${s.cardId || ''}|${s.accountId || ''}|${s.toAccountId || ''}`
  }
  // Legado "Pagamento Fatura" (sem tipo, _gerencialKey terminando em _payment).
  const k = s.overrides?._gerencialKey || ''
  if (!s.tipo && k.endsWith('_payment')) {
    const card = s.cardId || s.overrides?._gerencial?.cardId || s.toAccountId || ''
    return `pagamento_fatura|${card}|${s.accountId || ''}|${s.toAccountId || ''}`
  }
  return null
}

// Aglutina a lista de agendamentos em "grupos" de exibição (somente visual — não toca dados):
//   • Série de fatura: vira 1 linha; primary = fatura pendente mais próxima; futureItems = as
//     demais faturas pendentes (cada uma com seu amount já calculado pelo reconcileFaturaState).
//   • Recorrente de verdade (frequency != once): 1 linha; futureItems = próximas ocorrências
//     (getNextOccurrences) com o valor fixo do agendamento.
//   • Único 'once' avulso: 1 linha, sem futureItems (inalterado).
function buildScheduleGroups(schedules, getNextOccurrences) {
  const seriesMap = new Map()
  const singles = []
  for (const s of schedules) {
    const key = seriesKeyOf(s)
    if (key) {
      if (!seriesMap.has(key)) seriesMap.set(key, [])
      seriesMap.get(key).push(s)
    } else {
      singles.push(s)
    }
  }

  const groups = []
  for (const members of seriesMap.values()) {
    const withNext = members.map(s => ({ s, next: getNextOccurrences(s, 1)[0] || null }))
    const pending = withNext.filter(m => m.next).sort((a, b) => a.next.localeCompare(b.next))
    if (pending.length === 0) {
      // Série inteiramente concluída: representa pela fatura mais recente (linha "Concluído").
      const rep = members.slice().sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''))[0]
      groups.push({ schedule: rep, nextDate: null, futureItems: [] })
      continue
    }
    const primary = pending[0]
    const futureItems = pending.slice(1).map(m => ({ date: m.next, amount: Number(m.s.amount) || 0 }))
    groups.push({ schedule: primary.s, nextDate: primary.next, futureItems })
  }

  for (const s of singles) {
    const nextDate = getNextOccurrences(s, 1)[0] || null
    const recurring = (s.frequency || 'once') !== 'once'
    let futureItems = []
    if (recurring && nextDate) {
      futureItems = getNextOccurrences(s, FUTURE_OCC_COUNT + 1)
        .slice(1)
        .map(d => ({ date: d, amount: Number(s.amount) || 0 }))
    }
    groups.push({ schedule: s, nextDate, futureItems })
  }
  return groups
}

function GerBadge({ grupoId, gerencialGroups }) {
  if (!grupoId) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-blue-500/20 text-blue-400">G</span>
    )
  }
  const grupo = gerencialGroups.find(g => g.id === grupoId)
  if (!grupo) return null
  let cls = 'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold'
  if (grupo.number === 1) cls += ' bg-reserva/20 text-reserva'
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
  const { payees, transactions, addPayee, rateiosByLancamento, saveRateiosFor, registerScheduleOccurrence, scheduleReservaFuncoes, reserveFunctions, accountGroups } = useApp()
  // Detalhamento por função do resgate (Etapa B). Quando presente, a transferência é
  // registrada por função (registerScheduleOccurrence) e o valor total não é editável.
  const reservaDetalhe = useMemo(() => {
    const funcName = new Map((reserveFunctions || []).map(f => [f.id, f.name]))
    return (scheduleReservaFuncoes || [])
      .filter(srf => srf.scheduleId === schedule.id)
      .map(srf => ({ name: funcName.get(srf.reservaFuncaoId) || 'Função', valor: Number(srf.valor) || 0 }))
      .sort((a, b) => b.valor - a.valor)
  }, [scheduleReservaFuncoes, reserveFunctions, schedule.id])
  const hasDetalhe = reservaDetalhe.length > 0
  const detalheTotal = useMemo(() => Math.round(reservaDetalhe.reduce((s, d) => s + d.valor, 0) * 100) / 100, [reservaDetalhe])
  const scheduleRateios = useMemo(
    () => (rateiosByLancamento?.get(schedule.id) || []).map(r => ({ categoriaId: r.categoriaId, valor: r.valor, descricao: r.descricao })),
    [rateiosByLancamento, schedule.id],
  )
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
      const txId = addTransaction({
        type: 'expense', accountId: payAccountId, payee: payPayee,
        amount, date: payDate, categoryId: payCategoryId,
        grupoGerencial: payGrupo || undefined,
        description: schedule.description, notes: payNotes,
      })
      markScheduleRegistered(schedule.id, regDate)
      if (txId && scheduleRateios.length > 0) saveRateiosFor(txId, scheduleRateios)
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
      const txId = addTransaction({
        type: 'income', accountId: recAccountId, payee: recPayee,
        amount: parseFloat(recAmount) || 0, date: recDate,
        categoryId: recCategoryId, description: schedule.description, notes: recNotes,
      })
      markScheduleRegistered(schedule.id, regDate)
      if (txId && scheduleRateios.length > 0) saveRateiosFor(txId, scheduleRateios)
    } else if (hasDetalhe) {
      // Resgate detalhado: gera uma transferência por função (via registerScheduleOccurrence)
      // e marca a ocorrência. Não usa o valor/contas do formulário (fixos pelo detalhamento).
      registerScheduleOccurrence(schedule.id, trfDate)
    } else {
      // Resgate/depósito sem detalhamento: se a conta de reserva envolvida (origem ou
      // destino) tem função ÚNICA, preenche reserva_funcao_id automaticamente — mesma
      // regra do formulário de transferência (TransactionForm).
      const resvAcc = accounts.find(a => a.id === trfFromId && a.isReserva)
        || accounts.find(a => a.id === trfToId && a.isReserva)
      const resvFuncs = resvAcc ? (reserveFunctions || []).filter(f => f.accountId === resvAcc.id) : []
      const autoFuncId = resvFuncs.length === 1 ? resvFuncs[0].id : null
      addTransaction({
        type: 'transfer', accountId: trfFromId, toAccountId: trfToId,
        amount: parseFloat(trfAmount) || 0, date: trfDate,
        description: schedule.description, notes: trfNotes,
        reservaFuncaoId: autoFuncId,
      })
      markScheduleRegistered(schedule.id, regDate)
    }
    onClose()
  }

  const TAB_LABELS = { pagamento: 'Pagamento', recebimento: 'Recebimento', transferencia: 'Transferência' }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-surface border border-gray-700 rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
          <div>
            <h3 className="font-semibold text-gray-100">Registrar Agendamento</h3>
            <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[280px]">{schedule.description}</p>
            {(schedule.faturaRef || schedule.overrides?._gerencial?.faturaRef) && (
              <p className="text-xs text-indigo-400 mt-0.5">Fatura: {schedule.faturaRef || schedule.overrides._gerencial.faturaRef}</p>
            )}
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
                  <AccountOptions accounts={accounts} accountGroups={accountGroups} />
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
                <DateInput className="input" value={payDate} onChange={e => setPayDate(e.target.value)} />
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
                  <AccountOptions accounts={accounts} accountGroups={accountGroups} />
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
                <DateInput className="input" value={recDate} onChange={e => setRecDate(e.target.value)} />
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
              {hasDetalhe && (
                <div className="rounded-lg border border-gray-700 bg-gray-800/40 px-3 py-2.5">
                  <p className="text-xs text-gray-400 mb-1.5">Detalhamento por função</p>
                  <ul className="space-y-0.5">
                    {reservaDetalhe.map((det, i) => (
                      <li key={i} className="text-xs text-gray-300 flex items-center gap-1.5">
                        <span className="text-gray-600">{i === reservaDetalhe.length - 1 ? '└' : '├'}</span>
                        <span className="flex-1 truncate">{det.name}</span>
                        <span className="font-medium text-gray-200">{fmt(det.valor)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center justify-between border-t border-gray-700 mt-1.5 pt-1.5">
                    <span className="text-xs font-semibold text-gray-300">Total</span>
                    <span className="text-xs font-bold text-gray-100">{fmt(detalheTotal)}</span>
                  </div>
                </div>
              )}
              <div>
                <label className="label">Banco de</label>
                <select className="input" value={trfFromId} onChange={e => setTrfFromId(e.target.value)} disabled={hasDetalhe}>
                  <AccountOptions accounts={accounts} accountGroups={accountGroups} />
                </select>
              </div>
              <div>
                <label className="label">Banco para</label>
                <select className="input" value={trfToId} onChange={e => setTrfToId(e.target.value)} disabled={hasDetalhe}>
                  <AccountOptions accounts={accounts} accountGroups={accountGroups} />
                </select>
              </div>
              <div>
                <label className="label">Valor{hasDetalhe ? ' (soma das funções)' : ''}</label>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  value={hasDetalhe ? detalheTotal : trfAmount}
                  onChange={e => setTrfAmount(e.target.value)}
                  disabled={hasDetalhe}
                  readOnly={hasDetalhe}
                />
              </div>
              <div>
                <label className="label">Data</label>
                <DateInput className="input" value={trfDate} onChange={e => setTrfDate(e.target.value)} />
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
      <div className="relative bg-surface border border-gray-700 rounded-xl shadow-2xl w-full max-w-sm">
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
      <div className="relative bg-surface border border-gray-700 rounded-xl shadow-2xl w-full max-w-sm">
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
  schedule, nextDate, futureItems = [], cols = 9, categories, accounts, gerencialGroups,
  addTransaction, markScheduleRegistered, registerScheduleOccurrence, skipScheduleOccurrence,
  deleteSchedule, updateSchedule, getNextOccurrences, onToast,
  onEditSchedule, efetivarProvisao, getProximaProvisaoOccurrence,
  selectionMode, isSelected, onToggleSelect,
  srfBySchedule, onToggleConfirmado,
}) {
  // Provisão de despesa exibe badge "Provisão". O botão "Efetivar" aparece enquanto houver uma
  // próxima ocorrência a efetivar: para "Uma vez", até provisao_efetivada virar true; para
  // recorrente, sempre que existir ocorrência após provisao_efetivada_until.
  const isProvisao = !!schedule.isProvisao
  const proximaProvisao = isProvisao && !schedule.provisaoEfetivada
    ? ((schedule.frequency || 'once') === 'once' ? schedule.startDate : getProximaProvisaoOccurrence?.(schedule))
    : null
  const isProvisaoPendente = isProvisao && !schedule.provisaoEfetivada && !!proximaProvisao
  // Flag "Confirmado / A Confirmar" aplica-se a tudo, exceto automação pura
  // (gerencial_devolucao / resgate_reserva). Em pagamento_fatura é só visual.
  const canConfirm = schedule.tipo !== 'gerencial_devolucao' && schedule.tipo !== 'resgate_reserva'
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
  const [showEfetivar, setShowEfetivar] = useState(false)
  const [showPularUnico, setShowPularUnico] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const hasFuture = futureItems.length > 0
  const toggleExpand = () => setExpanded(v => !v)

  // Pular a próxima ocorrência pendente:
  //  • único (frequency 'once'): confirma e cancela (deleteSchedule);
  //  • recorrente: avança a data adicionando a ocorrência atual aos "skipped" via
  //    updateSchedule (sem criar lançamento nem registrar ocorrência).
  const isRecorrente = (schedule.frequency || 'once') !== 'once'
  const handlePular = () => {
    if (!nextDate) return
    if (!isRecorrente) { setShowPularUnico(true); return }
    const proximo = getNextOccurrences?.(schedule, 2)[1] || null
    updateSchedule(schedule.id, { skipped: [...(schedule.skipped || []), nextDate] })
    onToast?.(proximo
      ? `Agendamento pulado. Próximo vencimento: ${fmtDate(proximo)}`
      : 'Agendamento pulado.')
  }

  const displayDate = nextDate || (registered.length > 0 ? registered[registered.length - 1] : schedule.startDate)

  // Detalhamento por função do resgate (schedule_reserva_funcoes).
  const reservaDetalhe = srfBySchedule?.get(schedule.id) || null

  return (
    <>
      <tr className={`border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors group ${daysLate > 0 ? 'bg-red-500/5' : ''} ${!nextDate ? 'opacity-60' : ''} ${isSelected ? 'bg-indigo-500/5' : ''} ${canConfirm && nextDate && schedule.confirmado ? 'border-l-2 border-l-blue-500 bg-blue-500/[0.03]' : ''}`}>
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

        {/* Descrição — toda a célula expande/colapsa quando há ocorrências futuras */}
        <td
          className={`px-3 py-3 max-w-[200px] ${hasFuture ? 'cursor-pointer' : ''}`}
          onClick={hasFuture ? toggleExpand : undefined}
        >
          <div className="flex items-center gap-1.5 flex-wrap">
            {hasFuture && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); toggleExpand() }}
                title={expanded ? 'Recolher' : `Ver ${futureItems.length} ocorrência(s) seguinte(s)`}
                className="inline-flex items-center gap-0.5 -ml-1 p-0.5 text-gray-500 hover:text-gray-200 transition-colors shrink-0"
              >
                {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <span className="text-[10px] font-semibold">{futureItems.length}</span>
              </button>
            )}
            <p className="text-xs text-gray-200 font-medium truncate">{schedule.description}</p>
            {isProvisao && !schedule.provisaoEfetivada && (
              <span className="inline-flex items-center gap-1 text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded whitespace-nowrap font-medium" title={schedule.frequency === 'once' ? 'Despesa provisionada — valor/data estimados' : 'Provisão recorrente — valor/data estimados por ocorrência'}>
                <Hourglass size={9} /> Provisão{schedule.frequency !== 'once' ? ' recorrente' : ''}
              </span>
            )}
            {schedule.transactionType === 'expense' && (
              <GerBadge grupoId={schedule.grupoGerencial} gerencialGroups={gerencialGroups} />
            )}
            {(schedule.faturaRef || schedule.overrides?._gerencial?.faturaRef) && (
              <span className="text-xs bg-indigo-500/20 text-indigo-400 px-1.5 py-0.5 rounded whitespace-nowrap font-medium" title="Fatura de referência">
                {schedule.faturaRef || schedule.overrides._gerencial.faturaRef}
              </span>
            )}
            {isInstallment && (
              <span className="text-xs bg-gray-700/60 text-gray-400 px-1 py-0.5 rounded whitespace-nowrap">
                {totalDone}/{schedule.installments}x
              </span>
            )}
            {canConfirm && nextDate && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onToggleConfirmado(schedule.id) }}
                title={schedule.confirmado
                  ? 'Valor confirmado para o próximo vencimento — clique para desmarcar'
                  : 'Marcar valor como confirmado para o próximo vencimento'}
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium whitespace-nowrap transition-colors ${
                  schedule.confirmado
                    ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                    : 'bg-gray-700/60 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {schedule.confirmado ? <CheckCircle size={10} /> : <Circle size={10} />}
                {schedule.confirmado ? 'Confirmado' : 'A confirmar'}
              </button>
            )}
          </div>
          {reservaDetalhe && reservaDetalhe.length > 0 && (
            <ul className="mt-1 space-y-0.5" title="Detalhamento por função de reserva">
              {reservaDetalhe.map((det, i) => (
                <li key={i} className="text-[10px] text-gray-500 flex items-center gap-1 whitespace-nowrap">
                  <span className="text-gray-600">{i === reservaDetalhe.length - 1 ? '└' : '├'}</span>
                  <span className="truncate">{det.name}:</span>
                  <span className="text-gray-400 font-medium">{fmt(det.valor)}</span>
                </li>
              ))}
            </ul>
          )}
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
            <span className="inline-flex items-center gap-1 text-xs bg-reserva/15 text-reserva px-2 py-0.5 rounded font-medium">
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
          <span className={`text-sm font-bold ${schedule.transactionType === 'income' ? 'text-receita' : isDepositoReserva ? 'text-reserva' : isResgateReserva ? 'text-despesa' : schedule.transactionType === 'transfer' ? 'text-purple-400' : 'text-despesa'}`}>
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
            {isProvisaoPendente && (
              <button
                onClick={() => setShowEfetivar(true)}
                title="Efetivar Provisão — informar valor e data reais"
                className="flex items-center gap-1 px-2 py-1 text-xs bg-amber-500/20 text-amber-400 rounded hover:bg-amber-500/30 transition-colors font-medium"
              >
                <Hourglass size={12} /> Efetivar Provisão
              </button>
            )}
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
                <button
                  onClick={handlePular}
                  title={isRecorrente ? 'Pular esta ocorrência (avança para a próxima)' : 'Pular (cancela o agendamento único)'}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-500/15 text-gray-300 rounded hover:bg-gray-500/25 transition-colors font-medium"
                >
                  <SkipForward size={12} /> Pular
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

      {/* Painel inline: ocorrências futuras seguintes (faturas futuras com valor dinâmico,
          ou próximas ocorrências de recorrente com valor fixo). Somente visual. */}
      {expanded && hasFuture && (
        <tr className="bg-gray-900/40 border-b border-gray-800/50">
          <td colSpan={cols} className="px-3 py-2">
            <div className="pl-6">
              <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Próximas ocorrências</p>
              <ul className="space-y-0.5 max-w-md">
                {futureItems.map((it, i) => (
                  <li key={i} className="flex items-center justify-between gap-4 text-xs py-0.5 border-b border-gray-800/30 last:border-0">
                    <span className="text-gray-400">{fmtDate(it.date)}</span>
                    <span className="text-gray-300 font-medium">{fmt(it.amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </td>
        </tr>
      )}

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

      <ConfirmDialog
        open={showPularUnico}
        onClose={() => setShowPularUnico(false)}
        onConfirm={() => deleteSchedule(schedule.id)}
        title="Pular Agendamento"
        message="Este agendamento é único e não terá próxima ocorrência. Pular irá cancelá-lo permanentemente. Confirmar?"
        confirmLabel="Confirmar"
        danger
      />

      {showEfetivar && (
        <EfetivarProvisaoModal
          schedule={schedule}
          accounts={accounts}
          onClose={() => setShowEfetivar(false)}
          onConfirm={(payload) => { efetivarProvisao(schedule.id, payload); setShowEfetivar(false) }}
        />
      )}
    </>
  )
}

// Modal de "Efetivar Provisão": edita valor e data REAIS.
//   • Provisão "Uma vez": ao confirmar, grava valor/data no registro e o marca como efetivado.
//   • Provisão recorrente: efetiva apenas a próxima ocorrência (override) e avança a série; o
//     botão volta a ficar disponível para a ocorrência seguinte.
// Havendo função de reserva, gera o resgate real (transferência reserva → conta principal).
function EfetivarProvisaoModal({ schedule, accounts, onClose, onConfirm }) {
  const { reserveFunctions, getProximaProvisaoOccurrence } = useApp()
  const isOnce = (schedule.frequency || 'once') === 'once'
  // Ocorrência alvo (recorrente): primeira ainda não efetivada.
  const occDate = isOnce ? null : getProximaProvisaoOccurrence(schedule)
  const ov = !isOnce && occDate ? schedule.overrides?.[occDate] : null

  const [amount, setAmount] = useState(String(ov?.amount ?? schedule.amount ?? ''))
  const [date, setDate] = useState(ov?.date || (isOnce ? schedule.startDate : occDate) || format(new Date(), 'yyyy-MM-dd'))

  const func = schedule.reservaFuncaoId
    ? (reserveFunctions || []).find(f => f.id === schedule.reservaFuncaoId)
    : null
  const contaReserva = func?.accountId ? accounts.find(a => a.id === func.accountId) : null
  const valido = Number(amount) > 0 && !!date

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h3 className="font-semibold text-gray-100 flex items-center gap-2">
            <Hourglass size={15} className="text-amber-400" /> Efetivar Provisão
          </h3>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-300 rounded transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <p className="text-xs text-gray-500">Provisão</p>
            <p className="text-sm text-gray-200 font-medium">{schedule.description}</p>
            {!isOnce && occDate && (
              <p className="text-xs text-amber-400/90 mt-1">
                Ocorrência de {fmtDate(occDate)} · {FREQ_LABELS[schedule.frequency] || schedule.frequency}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Valor real (R$) *</label>
              <input
                type="number" step="0.01" min="0.01" className="input"
                value={amount} onChange={e => setAmount(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }}
              />
            </div>
            <div>
              <label className="label">Data real *</label>
              <input
                type="date" className="input"
                value={date} onChange={e => setDate(e.target.value)}
              />
            </div>
          </div>

          {func ? (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-300/90 leading-snug">
              Será criado um resgate (transferência) de{' '}
              <span className="font-semibold">{contaReserva?.apelido || contaReserva?.name || 'conta da reserva'}</span>{' '}
              → conta principal, vinculado à função <span className="font-semibold">{func.name}</span>.
            </div>
          ) : (
            <p className="text-xs text-gray-500 leading-snug">
              Sem reserva vinculada — apenas o valor e a data serão atualizados.
            </p>
          )}

          {!isOnce && (
            <p className="text-xs text-gray-500 leading-snug">
              A série continua: as próximas ocorrências permanecem como provisão e poderão ser
              efetivadas depois.
            </p>
          )}
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-gray-800">
          <button className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
          <button
            className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-40"
            disabled={!valido}
            onClick={() => valido && onConfirm({ amount: Number(amount), date, occurrenceDate: occDate })}
          >
            <CheckCircle size={14} /> Efetivar
          </button>
        </div>
      </div>
    </div>
  )
}

function BatchRegisterModal({ selectedRows, accounts, onConfirm, onClose }) {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const total = selectedRows.reduce((sum, r) => sum + (r.schedule.amount || 0), 0)

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-surface border border-gray-700 rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
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
            <DateInput
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
    <div className="fixed bottom-6 right-6 z-[200] flex items-center gap-3 bg-surface border border-emerald-500/30 text-gray-100 text-sm px-4 py-3 rounded-xl shadow-2xl pointer-events-none">
      <CheckCircle size={16} className="text-emerald-400 shrink-0" />
      {message}
    </div>
  )
}

// Totalizador da seleção múltipla: metadados de exibição por grupo de movimentação.
const SELECTION_GROUP_META = {
  aplicacao: { glyph: '↑', label: 'Aplicação', cls: 'text-reserva' },
  resgate:   { glyph: '↓', label: 'Resgate',   cls: 'text-orange-500' },
  despesa:   { glyph: '↓', label: 'Despesas',  cls: 'text-orange-500' },
  receita:   { glyph: '↑', label: 'Receitas',  cls: 'text-blue-400' },
  fatura:    { glyph: '🧾', label: 'Fatura',    cls: 'text-indigo-400' },
}
const SELECTION_GROUP_ORDER = ['aplicacao', 'resgate', 'despesa', 'receita', 'fatura']

function SchedulesTable({ schedules, categories, accounts, gerencialGroups, addTransaction, markScheduleRegistered, deleteSchedule, registerScheduleOccurrence, skipScheduleOccurrence, getNextOccurrences, efetivarProvisao, onNewSchedule, onEditSchedule }) {
  const { scheduleReservaFuncoes, reserveFunctions, toggleScheduleConfirmado, getProximaProvisaoOccurrence, updateSchedule } = useApp()
  // Detalhamento por função (resgate_reserva): scheduleId → [{ name, valor }] (maior 1º).
  const srfBySchedule = useMemo(() => {
    const funcName = new Map((reserveFunctions || []).map(f => [f.id, f.name]))
    const m = new Map()
    for (const srf of (scheduleReservaFuncoes || [])) {
      if (!m.has(srf.scheduleId)) m.set(srf.scheduleId, [])
      m.get(srf.scheduleId).push({ name: funcName.get(srf.reservaFuncaoId) || 'Função', valor: Number(srf.valor) || 0 })
    }
    for (const arr of m.values()) arr.sort((a, b) => b.valor - a.valor)
    return m
  }, [scheduleReservaFuncoes, reserveFunctions])

  const today = format(new Date(), 'yyyy-MM-dd')
  const in7 = format(addDays(new Date(), 7), 'yyyy-MM-dd')
  const in30 = format(addDays(new Date(), 30), 'yyyy-MM-dd')

  // Selection state
  const [selectionMode, setSelectionMode] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [showBatchRegister, setShowBatchRegister] = useState(false)
  const [showBatchSkip, setShowBatchSkip] = useState(false)
  const [toast, setToast] = useState(null)

  // Linhas aglutinadas: 1 por agendamento lógico (séries de fatura colapsadas; recorrentes
  // com ocorrências futuras em futureItems). Particionamento/seleção seguem usando nextDate.
  const rows = useMemo(() => buildScheduleGroups(schedules, getNextOccurrences), [schedules, getNextOccurrences])

  const overdue    = rows.filter(r => r.nextDate && r.nextDate < today).sort((a, b) => a.nextDate.localeCompare(b.nextDate))
  const next7      = rows.filter(r => r.nextDate && r.nextDate >= today && r.nextDate <= in7).sort((a, b) => a.nextDate.localeCompare(b.nextDate))
  const next30     = rows.filter(r => r.nextDate && r.nextDate > in7 && r.nextDate <= in30).sort((a, b) => a.nextDate.localeCompare(b.nextDate))
  const future     = rows.filter(r => r.nextDate && r.nextDate > in30).sort((a, b) => a.nextDate.localeCompare(b.nextDate))
  const completed  = rows.filter(r => !r.nextDate).sort((a, b) => (b.schedule.startDate || '').localeCompare(a.schedule.startDate || ''))

  const selectableRows = rows.filter(r => r.nextDate)
  const allSelected = selectableRows.length > 0 && selectableRows.every(r => selected.has(r.schedule.id))
  const selectedRows = rows.filter(r => selected.has(r.schedule.id) && r.nextDate)

  // Totalizador dinâmico da seleção: agrupa por tipo de movimentação e calcula o saldo
  // líquido de caixa (receita + resgate − despesa − aplicação). Fatura é grupo à parte,
  // fora do saldo. Atualiza em tempo real conforme a seleção muda.
  const selectionTotals = useMemo(() => {
    const r2 = (n) => Math.round(n * 100) / 100
    const g = {
      aplicacao: { items: [], total: 0 },
      resgate:   { items: [], total: 0 },
      despesa:   { items: [], total: 0 },
      receita:   { items: [], total: 0 },
      fatura:    { items: [], total: 0 },
    }
    for (const { schedule: s } of selectedRows) {
      const amt = Number(s.amount) || 0
      let key = null
      if (s.tipo === 'pagamento_fatura') key = 'fatura'
      else if (s.transactionType === 'transfer') {
        if (accounts.find(a => a.id === s.toAccountId)?.isReserva) key = 'aplicacao'
        else if (accounts.find(a => a.id === s.accountId)?.isReserva) key = 'resgate'
      } else if (s.transactionType === 'expense') key = 'despesa'
      else if (s.transactionType === 'income') key = 'receita'
      if (!key) continue
      g[key].items.push({ description: s.description || '—', amount: amt })
      g[key].total = r2(g[key].total + amt)
    }
    const hasInflow = g.receita.items.length > 0 || g.resgate.items.length > 0
    const hasOutflow = g.despesa.items.length > 0 || g.aplicacao.items.length > 0
    const saldo = r2(g.receita.total - g.despesa.total + g.resgate.total - g.aplicacao.total)
    return { g, saldo, showSaldo: hasInflow && hasOutflow }
  }, [selectedRows, accounts])

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

  // occurrenceDate = ocorrência a baixar (nextDate); txDate = data dos lançamentos criados.
  // Registrar a ocorrência em nextDate (e não em txDate) é o que faz o agendamento avançar —
  // mesmo comportamento do pagamento individual (PayModal usa regDate = nextDate).
  const registerWithGerencial = (schedule, occurrenceDate, txDate) => {
    registerScheduleOccurrence(schedule.id, txDate, occurrenceDate)
    if (!schedule.grupoGerencial) return
    const grupo = gerencialGroups.find(g => g.id === schedule.grupoGerencial)
    if (!grupo || grupo.number === 'D') return
    if (grupo.number === 1) {
      const contaReserva = accounts.find(a => a.id === grupo.defaultAccountId)
      if (schedule.accountId && contaReserva) {
        addTransaction({ type: 'transfer', accountId: schedule.accountId, toAccountId: contaReserva.id, amount: schedule.amount, date: txDate, description: `Reserva ${grupo.name}`, grupoGerencial: grupo.id })
      }
    } else {
      const contaResgate = accounts.find(a => a.id === grupo.defaultAccountId)
      if (contaResgate && contaPrincipal) {
        addTransaction({ type: 'transfer', accountId: contaResgate.id, toAccountId: contaPrincipal.id, amount: schedule.amount, date: txDate, description: `Resgate ${grupo.name}`, grupoGerencial: grupo.id })
      }
    }
  }

  const handleBatchRegister = (date) => {
    const count = selectedRows.length
    selectedRows.forEach(({ schedule, nextDate }) => registerWithGerencial(schedule, nextDate || date, date))
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
    deleteSchedule, updateSchedule, getNextOccurrences, onToast: showToastMsg,
    onEditSchedule, efetivarProvisao, getProximaProvisaoOccurrence,
    selectionMode, onToggleSelect: toggleSelect,
    srfBySchedule, onToggleConfirmado: toggleScheduleConfirmado,
    cols,
  }

  return (
    <>
      {/* Selection action bar */}
      {selectionMode && (
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-indigo-300">
              {selected.size} selecionado{selected.size !== 1 ? 's' : ''}
            </span>
            {/* Totalizador por movimentação (apenas grupos com itens selecionados) */}
            {selected.size > 0 && (
              <div className="flex flex-col gap-0.5 text-xs">
                {SELECTION_GROUP_ORDER.map(key => {
                  const grp = selectionTotals.g[key]
                  if (!grp.items.length) return null
                  const meta = SELECTION_GROUP_META[key]
                  return (
                    <div key={key}>
                      <div className="flex items-center gap-1.5">
                        <span className={meta.cls}>{meta.glyph}</span>
                        <span className="text-gray-300 font-medium">{meta.label}:</span>
                        <span className={`font-semibold ${meta.cls}`}>{fmt(grp.total)}</span>
                      </div>
                      {grp.items.length > 1 && (
                        <div className="ml-4 mt-0.5 flex flex-col gap-0.5">
                          {grp.items.map((it, i) => (
                            <div key={i} className="flex items-center justify-between gap-3 text-gray-500">
                              <span className="truncate max-w-[180px]">{it.description}</span>
                              <span className="shrink-0">{fmt(it.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
                {selectionTotals.showSaldo && (
                  <div className="flex items-center gap-1.5 pt-1 mt-0.5 border-t border-indigo-500/20">
                    <span className="text-gray-400">=</span>
                    <span className="text-gray-300 font-medium">Saldo:</span>
                    <span className={`font-bold ${selectionTotals.saldo < 0 ? 'text-despesa' : 'text-receita'}`}>{fmt(selectionTotals.saldo)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
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
                  {overdue.map(({ schedule, nextDate, futureItems }) => (
                    <ScheduleRow key={schedule.id} schedule={schedule} nextDate={nextDate} futureItems={futureItems} {...rowProps} isSelected={selected.has(schedule.id)} />
                  ))}
                </>
              )}
              {next7.length > 0 && (
                <>
                  <SectionHeader label="Próximos 7 dias" count={next7.length} variant="soon" cols={cols} />
                  {next7.map(({ schedule, nextDate, futureItems }) => (
                    <ScheduleRow key={schedule.id} schedule={schedule} nextDate={nextDate} futureItems={futureItems} {...rowProps} isSelected={selected.has(schedule.id)} />
                  ))}
                </>
              )}
              {next30.length > 0 && (
                <>
                  <SectionHeader label="Próximos 30 dias" count={next30.length} variant="month" cols={cols} />
                  {next30.map(({ schedule, nextDate, futureItems }) => (
                    <ScheduleRow key={schedule.id} schedule={schedule} nextDate={nextDate} futureItems={futureItems} {...rowProps} isSelected={selected.has(schedule.id)} />
                  ))}
                </>
              )}
              {future.length > 0 && (
                <>
                  <SectionHeader label="Futuros" count={future.length} variant="default" cols={cols} />
                  {future.map(({ schedule, nextDate, futureItems }) => (
                    <ScheduleRow key={schedule.id} schedule={schedule} nextDate={nextDate} futureItems={futureItems} {...rowProps} isSelected={selected.has(schedule.id)} />
                  ))}
                </>
              )}
              {completed.length > 0 && (
                <>
                  <SectionHeader label="Concluídos" count={completed.length} variant="history" cols={cols} />
                  {completed.map(({ schedule, nextDate, futureItems }) => (
                    <ScheduleRow key={schedule.id} schedule={schedule} nextDate={nextDate} futureItems={futureItems} {...rowProps} isSelected={selected.has(schedule.id)} />
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

// Data real da transferência gerencial de cada parcela (espelha executarProvisoesGerenciais):
//  • parcela 1 (ou sem padrão X/N): data original do gasto
//  • parcelas 2..N: dia financeiro do mês ANTERIOR ao da fatura (prevMonthScheduleDate)
function dataLancamentoProvisao(p, financialMonthStartDay) {
  const matches = [...(p.description || '').matchAll(/(\d{1,2})\s*\/\s*\d{1,2}/g)]
  const instNum = matches.length ? Number(matches[matches.length - 1][1]) : 1
  if (instNum >= 2 && p.faturaMonthYear) {
    const [fy, fm] = p.faturaMonthYear.split('-')
    return prevMonthScheduleDate(`${fm}/${fy}`, financialMonthStartDay)
  }
  return p.date
}

function ExecutarGerenciaisModal({ provisoes, accounts, financialMonthStartDay = 1, onConfirm, onClose }) {
  const [selected, setSelected] = useState(() => new Set(provisoes.map(p => p.id)))
  const [faturaFiltro, setFaturaFiltro] = useState('')
  const [cartaoFiltro, setCartaoFiltro] = useState('')
  const toggle = (id) => setSelected(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })
  const accName = (id) => { const a = accounts.find(x => x.id === id); return a ? (a.apelido || a.name) : '—' }

  // Opções de filtro derivadas dos itens da lista (distinct), em tempo real.
  const faturaOptions = useMemo(
    () => [...new Set(provisoes.map(p => p.faturaMonthYear).filter(Boolean))].sort(), // YYYY-MM ordena cronologicamente
    [provisoes]
  )
  const cartaoOptions = useMemo(() => {
    const ids = [...new Set(provisoes.map(p => p.cardId).filter(Boolean))]
    return ids
      .map(id => ({ id, name: accName(id) }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [provisoes]) // eslint-disable-line react-hooks/exhaustive-deps

  const matchFiltros = (p, fat, cart) =>
    (!fat || p.faturaMonthYear === fat) && (!cart || p.cardId === cart)

  // Lista visível conforme filtros (aplicados em tempo real).
  const visibleProvisoes = useMemo(
    () => provisoes.filter(p => matchFiltros(p, faturaFiltro, cartaoFiltro)),
    [provisoes, faturaFiltro, cartaoFiltro]
  )

  // Ao mudar um filtro, manter checados apenas os que continuam visíveis (nunca re-seleciona).
  // Prune feito no próprio handler (ação do usuário) com os filtros já atualizados.
  const pruneSelected = (fat, cart) => {
    const visibleIds = new Set(provisoes.filter(p => matchFiltros(p, fat, cart)).map(p => p.id))
    setSelected(prev => new Set([...prev].filter(id => visibleIds.has(id))))
  }
  const handleFaturaFiltro = (val) => { setFaturaFiltro(val); pruneSelected(val, cartaoFiltro) }
  const handleCartaoFiltro = (val) => { setCartaoFiltro(val); pruneSelected(faturaFiltro, val) }

  // Contador, total e confirmação consideram só itens visíveis E marcados.
  const selectedVisible = visibleProvisoes.filter(p => selected.has(p.id))
  const selCount = selectedVisible.length
  const total = selectedVisible.reduce((s, p) => s + p.amount, 0)

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-surface border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
          <div>
            <h3 className="font-semibold text-gray-100">Executar Provisões Gerenciais</h3>
            <p className="text-xs text-gray-500 mt-0.5">Transferência imediata Conta Principal → Ger. para cada parcela marcada</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-300 rounded transition-colors"><X size={16} /></button>
        </div>

        {/* Filtros (fatura + cartão) — aplicados em tempo real na lista */}
        <div className="grid grid-cols-2 gap-3 px-5 py-3 border-b border-gray-800 shrink-0">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Fatura</label>
            <select
              className="input text-sm py-1.5"
              value={faturaFiltro}
              onChange={e => handleFaturaFiltro(e.target.value)}
            >
              <option value="">Todas as faturas</option>
              {faturaOptions.map(ym => (
                <option key={ym} value={ym}>{faturaLabel(ym)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Cartão</label>
            <select
              className="input text-sm py-1.5"
              value={cartaoFiltro}
              onChange={e => handleCartaoFiltro(e.target.value)}
            >
              <option value="">Todos os cartões</option>
              {cartaoOptions.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {visibleProvisoes.length === 0 ? (
            <p className="text-center text-xs text-gray-600 py-8">Nenhuma provisão para os filtros selecionados</p>
          ) : visibleProvisoes.map(p => (
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
                <p className="text-xs text-gray-600 mt-0.5">
                  Data do lançamento: {fmtDate(dataLancamentoProvisao(p, financialMonthStartDay))}
                </p>
              </div>
              <span className="text-xs font-bold text-orange-600 shrink-0">{fmt(p.amount)}</span>
            </label>
          ))}
        </div>

        <div className="px-5 py-3 border-t border-gray-800 flex items-center justify-between shrink-0">
          <span className="text-sm text-gray-400">{selCount} selecionada{selCount !== 1 ? 's' : ''}</span>
          <span className="text-base font-bold text-gray-100">{fmt(total)}</span>
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-gray-800 shrink-0">
          <button className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
          <button
            className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={selCount === 0}
            onClick={() => onConfirm(selectedVisible.map(p => p.id))}
          >
            <CheckCircle size={14} /> Confirmar ({selCount})
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
    getProvisoesPendentes, executarProvisoesGerenciais, efetivarProvisao,
    activeProfileId, settings,
  } = useApp()

  const provisoesPendentes = useMemo(() => getProvisoesPendentes(), [getProvisoesPendentes])
  const [showExecutarGer, setShowExecutarGer] = useState(false)

  const [activeTab, setActiveTab] = useState('conta')
  const [viewFilter, setViewFilter] = useState('future')
  const [showForm, setShowForm] = useState(false)
  const [showProvisaoForm, setShowProvisaoForm] = useState(false)
  const [editSchedule, setEditSchedule] = useState(null)
  const [editProvisao, setEditProvisao] = useState(null)
  const [confirmDeletePayable, setConfirmDeletePayable] = useState(null)
  const [showZeroed, setShowZeroed] = useState(false)

  // Edição de agendamento: provisões abrem no ProvisaoForm (campos próprios:
  // valor/data estimados, "será pago com reserva" + função); os demais no ScheduleForm.
  const openEditSchedule = (s) => {
    if (s?.isProvisao) { setEditProvisao(s); setShowProvisaoForm(true) }
    else { setEditSchedule(s); setShowForm(true) }
  }

  // FAB mobile: abre o formulário de novo agendamento.
  useRegisterFab(() => { setEditSchedule(null); setShowForm(true) }, [])

  // Filtros em tempo real (aba Agendamentos)
  const [fltFrom, setFltFrom] = useState('')
  const [fltTo, setFltTo] = useState('')
  const [fltDesc, setFltDesc] = useState('')
  const [fltPayee, setFltPayee] = useState('')
  const [fltCat, setFltCat] = useState('')
  const [fltMin, setFltMin] = useState('')
  const [fltMax, setFltMax] = useState('')
  // Filtro de valor (multiselect) — valores reais dos agendamentos visíveis.
  const [selValores, setSelValores] = useState(() => new Set())
  const hasActiveFilter = fltFrom || fltTo || fltDesc.trim() || fltPayee.trim() || fltCat || fltMin !== '' || fltMax !== '' || selValores.size > 0
  const clearFilters = () => { setFltFrom(''); setFltTo(''); setFltDesc(''); setFltPayee(''); setFltCat(''); setFltMin(''); setFltMax(''); setSelValores(new Set()) }

  // Filtro por cartão na aba "Cartão de Crédito" ('' = todos os cartões)
  const [cartaoFiltroId, setCartaoFiltroId] = useState('')

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

  // Agendamentos "Pagamento Fatura X" (transfer Conta Principal → Cartão, _gerencialKey
  // terminando em _payment). São gerados pela automação gerencial tanto na importação
  // quanto no lançamento MANUAL — mas o lançamento manual não gera contas_a_pagar, então
  // o cartão (ex.: BBCCRED) ficava invisível na aba. Mostramos aqui os que ainda NÃO têm
  // um contas_a_pagar (invoice) correspondente, para não duplicar quem veio da importação.
  const invoiceFaturaKeys = useMemo(
    () => new Set(invoicePayables.map(p => `${p.cartaoId}|${p.mesAno}`)),
    [invoicePayables]
  )
  const faturaPaymentSchedules = useMemo(
    () => allSchedules.filter(s => {
      // Reconhece AMBOS: novo (tipo='pagamento_fatura') e legado (_gerencialKey terminando _payment).
      const key = s.overrides?._gerencialKey
      const isNew = s.tipo === 'pagamento_fatura'
      const isLegacyPayment = !!key && key.endsWith('_payment')
      if (!isNew && !isLegacyPayment) return false
      if (s.transactionType !== 'transfer') return false
      const g = s.overrides?._gerencial || {}
      const cardId = s.cardId || g.cardId || s.toAccountId
      if (!accountInProfile(cardId)) return false
      // Os novos (tipo) são a fonte de verdade e sempre aparecem. O dedupe contra
      // contas_a_pagar legadas aplica-se apenas aos agendamentos LEGADOS (_payment).
      if (isNew) return true
      const faturaRef = g.faturaRef || s.faturaRef
      if (faturaRef && faturaRef.includes('/')) {
        const [mm, yyyy] = faturaRef.split('/')
        if (invoiceFaturaKeys.has(`${cardId}|${yyyy}-${mm}`)) return false
      }
      return true
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allSchedules, invoiceFaturaKeys, activeProfileId, allAccounts]
  )
  const displayFaturaPayments = showZeroed ? faturaPaymentSchedules : faturaPaymentSchedules.filter(s => Number(s.amount) !== 0)
  const pendingFaturaPayments = displayFaturaPayments.filter(s => getNextOccurrences(s, 1).length > 0).length

  // Cartões de crédito ativos (do perfil) para o seletor da aba Cartão.
  const cartoesDisponiveis = useMemo(
    () => allAccounts
      .filter(a => a.type === 'credit' && a.active !== false &&
        (!activeProfileId || !a.profileId || a.profileId === activeProfileId))
      .sort((a, b) => (a.apelido || a.name).localeCompare(b.apelido || b.name)),
    [allAccounts, activeProfileId]
  )
  // Cartão de um agendamento de pagamento de fatura.
  const faturaPaymentCardId = (s) => s.cardId || s.overrides?._gerencial?.cardId || s.toAccountId
  // Listas exibidas na aba Cartão, aplicando o filtro por cartão selecionado.
  const viewInvoice = cartaoFiltroId ? displayInvoice.filter(p => p.cartaoId === cartaoFiltroId) : displayInvoice
  const viewFaturaPayments = cartaoFiltroId ? displayFaturaPayments.filter(s => faturaPaymentCardId(s) === cartaoFiltroId) : displayFaturaPayments

  // CORREÇÃO 3: contas de origem "gerenciais" = subcontas "Ger. ..." (têm grupoGerencial
  // no próprio account) + contas de resgate dos grupos numerados (raAccountIds).
  const gerencialOrigemIds = useMemo(() => {
    const ids = new Set(raAccountIds)
    allAccounts.forEach(a => { if (a.grupoGerencial) ids.add(a.id) })
    return ids
  }, [allAccounts, raAccountIds])

  // Agendamentos LEGADOS obsoletos (provisão / resgate / resgate parcelado / resgate numerado)
  // foram substituídos pelos tipos 'gerencial_devolucao' e 'resgate_reserva'. Escondemos os que
  // ainda não têm 'tipo' (dados antigos cujo recálculo ainda não rodou); os novos carregam tipo.
  const isObsoleteLegacy = (s) => {
    if (s.tipo) return false
    const k = s.overrides?._gerencialKey || ''
    return k.endsWith('_provision') || k.endsWith('_resgate') || k.endsWith('_resgate_parc') || k.startsWith('ger_num_')
  }

  // Agendamentos de devolução/resgate: novos (tipo gerencial_devolucao/resgate_reserva) ou, por
  // compatibilidade, transfers de conta gerencial → conta principal. Usa allSchedules porque as
  // subcontas "Ger." não carregam profileId; o perfil é respeitado pela conta de destino (principal).
  const gerencialResgates = useMemo(
    () => allSchedules.filter(s => {
      if (isObsoleteLegacy(s)) return false
      const isNewGer = s.tipo === 'gerencial_devolucao' || s.tipo === 'resgate_reserva'
      const structural =
        s.transactionType === 'transfer' &&
        gerencialOrigemIds.has(s.accountId) &&
        !gerencialOrigemIds.has(s.toAccountId)
      if (!isNewGer && !structural) return false
      return accountInProfile(s.toAccountId)
    }),
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
    if (viewFilter === 'provisoes') return schedules.filter(s => s.isProvisao)
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

  // Valores reais (distintos) dos agendamentos visíveis (já filtrados por data/etc.), maior → menor.
  const valorOptions = useMemo(() => {
    const set = new Set()
    for (const s of searchedSchedules) set.add(Math.round((Number(s.amount) || 0) * 100) / 100)
    return [...set].sort((a, b) => b - a)
  }, [searchedSchedules])
  // Lista final após o filtro de valor (multiselect).
  const finalSchedules = useMemo(
    () => selValores.size === 0
      ? searchedSchedules
      : searchedSchedules.filter(s => selValores.has(Math.round((Number(s.amount) || 0) * 100) / 100)),
    [searchedSchedules, selValores]
  )

  const handleMarkPaid = id => updatePayable(id, { status: 'paid', paidAt: new Date().toISOString() })
  const handleDeletePayable = id => { deletePayable(id); setConfirmDeletePayable(null) }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-300">Agendamentos & Contas a Pagar</h2>
          <p className="text-xs text-gray-500 mt-0.5">{allPending.length} pendentes · {pendingInvoice + pendingFaturaPayments} faturas · {pendingGerencial} resgates</p>
        </div>
        <div className="flex items-center gap-2">
          {provisoesPendentes.length > 0 && (
            <button className="btn-secondary flex items-center gap-2" onClick={() => setShowExecutarGer(true)}>
              <BarChart3 size={14} /> Executar Gerenciais ({provisoesPendentes.length})
            </button>
          )}
          {activeTab === 'conta' && (
            <>
              <button className="btn-secondary hidden md:flex items-center gap-2" onClick={() => { setEditProvisao(null); setShowProvisaoForm(true) }}>
                <Hourglass size={14} /> Lançar Provisão
              </button>
              <button className="btn-primary hidden md:flex items-center gap-2" onClick={() => { setEditSchedule(null); setShowForm(true) }}>
                <Plus size={14} /> Novo Agendamento
              </button>
            </>
          )}
        </div>
      </div>

      <div className="border-b border-gray-800 flex items-center gap-0 overflow-x-auto">
        <TabButton active={activeTab === 'conta'} onClick={() => setActiveTab('conta')} badge={allPending.length}>
          <Calendar size={14} /> Agendamentos
        </TabButton>
        <TabButton active={activeTab === 'cartao'} onClick={() => setActiveTab('cartao')} badge={pendingInvoice + pendingFaturaPayments}>
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
                {f.id === 'provisoes' && <Hourglass size={11} />}
                {f.label}
                {f.id === 'future' && <span className="text-xs opacity-70">{allPending.length}</span>}
              </button>
            ))}
          </div>

          {/* Barra de filtros (tempo real) — fixa no topo ao rolar apenas no desktop (md+) */}
          <div className="card grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2 items-end md:sticky md:top-0 md:z-20">
            <div>
              <label className="label text-xs">Data de</label>
              <DateInput className="input py-1.5 text-xs" value={fltFrom} onChange={e => setFltFrom(e.target.value)} />
            </div>
            <div>
              <label className="label text-xs">Data até</label>
              <DateInput className="input py-1.5 text-xs" value={fltTo} onChange={e => setFltTo(e.target.value)} />
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
              <div className="mb-0.5">
                <ValueFilterDropdown label="Valor" values={valorOptions} selected={selValores} onChange={setSelValores} />
              </div>
              {hasActiveFilter && (
                <button onClick={clearFilters} title="Limpar filtros" className="p-1.5 mb-0.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors shrink-0">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <SchedulesTable
            schedules={finalSchedules}
            categories={categories}
            accounts={accounts}
            gerencialGroups={gerencialGroups}
            addTransaction={addTransaction}
            markScheduleRegistered={markScheduleRegistered}
            deleteSchedule={deleteSchedule}
            registerScheduleOccurrence={registerScheduleOccurrence}
            skipScheduleOccurrence={skipScheduleOccurrence}
            getNextOccurrences={getNextOccurrences}
            efetivarProvisao={efetivarProvisao}
            onNewSchedule={() => { setEditSchedule(null); setShowForm(true) }}
            onEditSchedule={openEditSchedule}
          />
        </>
      )}

      {activeTab === 'cartao' && (
        <div className="space-y-3">
          {(displayInvoice.length > 0 || displayFaturaPayments.length > 0) && cartoesDisponiveis.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 shrink-0">Cartão:</label>
              <select
                className="input py-1.5 text-xs max-w-xs"
                value={cartaoFiltroId}
                onChange={e => setCartaoFiltroId(e.target.value)}
              >
                <option value="">Todos os cartões</option>
                {cartoesDisponiveis.map(c => (
                  <option key={c.id} value={c.id}>{c.apelido || c.name}</option>
                ))}
              </select>
            </div>
          )}

          {viewInvoice.length === 0 && viewFaturaPayments.length === 0 ? (
            <div className="card text-center py-12">
              <CreditCard size={32} className="text-gray-700 mx-auto mb-3" />
              {(displayInvoice.length > 0 || displayFaturaPayments.length > 0) ? (
                <p className="text-gray-500 text-sm">Nenhuma fatura para o cartão selecionado</p>
              ) : (
                <>
                  <p className="text-gray-500 text-sm">Nenhuma fatura gerada</p>
                  <p className="text-gray-600 text-xs mt-1">As faturas aparecem ao importar lançamentos de cartão ou ao lançar despesas gerenciais</p>
                </>
              )}
            </div>
          ) : (
            <>
              {[...viewInvoice].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map(p => (
                <PayableCard key={p.id} payable={p} gerencialGroups={gerencialGroups} accounts={allAccounts} onMarkPaid={handleMarkPaid} onDelete={() => setConfirmDeletePayable(p)} />
              ))}
              {viewFaturaPayments.length > 0 && (
                <SchedulesTable
                  schedules={viewFaturaPayments}
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
                  onEditSchedule={openEditSchedule}
                />
              )}
            </>
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
            onEditSchedule={openEditSchedule}
          />
        )
      )}

      <Modal open={showForm} onClose={() => { setShowForm(false); setEditSchedule(null) }} title={editSchedule ? 'Editar Agendamento' : 'Novo Agendamento'} size="lg">
        <ScheduleForm initial={editSchedule} onClose={() => { setShowForm(false); setEditSchedule(null) }} />
      </Modal>

      <Modal open={showProvisaoForm} onClose={() => { setShowProvisaoForm(false); setEditProvisao(null) }} title={editProvisao ? 'Editar Provisão de Despesa' : 'Lançar Provisão de Despesa'}>
        <ProvisaoForm initial={editProvisao} onClose={() => { setShowProvisaoForm(false); setEditProvisao(null) }} />
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
          financialMonthStartDay={settings?.financialMonthStartDay || 1}
          onClose={() => setShowExecutarGer(false)}
          onConfirm={(ids) => { executarProvisoesGerenciais(ids); setShowExecutarGer(false) }}
        />
      )}
    </div>
  )
}
