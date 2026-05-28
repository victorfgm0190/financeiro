import { useMemo, useState } from 'react'
import {
  Plus, Calendar, CheckCircle, SkipForward, Trash2, Edit2,
  Clock, CreditCard, BarChart3, ArrowDownCircle, ArrowUpCircle, AlertTriangle,
} from 'lucide-react'
import { addDays, format, differenceInDays, parseISO } from 'date-fns'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'
import Modal from '../shared/Modal'
import ConfirmDialog from '../shared/ConfirmDialog'
import ScheduleForm from './ScheduleForm'

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

function SectionHeader({ label, count, variant = 'default' }) {
  const colors = {
    overdue: 'text-red-400 bg-red-500/10 border-red-500/20',
    soon: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    month: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    default: 'text-gray-400 bg-gray-800/60 border-gray-700/50',
  }
  return (
    <tr>
      <td colSpan={9} className={`px-4 py-2 border-y text-xs font-semibold uppercase tracking-wide ${colors[variant]}`}>
        {label}
        {count > 0 && <span className="ml-2 font-bold">{count}</span>}
      </td>
    </tr>
  )
}

function ScheduleRow({ schedule, nextDate, categories, accounts, gerencialGroups, addTransaction, registerScheduleOccurrence, skipScheduleOccurrence, deleteSchedule, onEditSchedule }) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const cat = categories.find(c => c.id === schedule.categoryId)
  const acc = accounts.find(a => a.id === schedule.accountId)
  const registered = schedule.registered || []
  const skipped = schedule.skipped || []
  const totalDone = registered.length + skipped.length
  const isInstallment = schedule.occurrenceType === 'installment'

  const daysLate = nextDate && nextDate < today
    ? differenceInDays(parseISO(today), parseISO(nextDate))
    : 0

  const contaPrincipal =
    accounts.find(a => a.type === 'checking' && a.contaCorrentePrincipal) ||
    accounts.find(a => a.isMain && a.type !== 'credit') ||
    accounts.find(a => a.type === 'checking')

  const handleRegister = () => {
    if (!nextDate) return
    registerScheduleOccurrence(schedule.id, nextDate)
    if (!schedule.grupoGerencial) return
    const grupo = gerencialGroups.find(g => g.id === schedule.grupoGerencial)
    if (!grupo || grupo.number === 'D') return
    if (grupo.number === 1) {
      const contaReserva = accounts.find(a => a.id === grupo.defaultAccountId)
      if (schedule.accountId && contaReserva) {
        addTransaction({ type: 'transfer', accountId: schedule.accountId, toAccountId: contaReserva.id, amount: schedule.amount, date: nextDate, description: `Reserva ${grupo.name}`, grupoGerencial: grupo.id })
      }
    } else {
      const contaResgate = accounts.find(a => a.id === grupo.defaultAccountId)
      if (contaResgate && contaPrincipal) {
        addTransaction({ type: 'transfer', accountId: contaResgate.id, toAccountId: contaPrincipal.id, amount: schedule.amount, date: nextDate, description: `Resgate ${grupo.name}`, grupoGerencial: grupo.id })
      }
    }
  }

  return (
    <tr className={`border-b border-gray-800/50 hover:bg-gray-800/20 transition-colors group ${daysLate > 0 ? 'bg-red-500/5' : ''}`}>
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
          <span className="text-xs text-gray-600">—</span>
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
        {acc && <p className="text-xs text-gray-600 mt-0.5 truncate">{acc.apelido || acc.name}</p>}
      </td>

      {/* Movimentação */}
      <td className="px-3 py-3 whitespace-nowrap">
        {schedule.transactionType === 'income' ? (
          <span className="inline-flex items-center gap-1 text-xs bg-blue-500/15 text-blue-600 px-2 py-0.5 rounded font-medium">
            <ArrowDownCircle size={11} /> Receita
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
        <span className={`text-sm font-bold ${schedule.transactionType === 'income' ? 'text-blue-600' : 'text-orange-600'}`}>
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
                onClick={handleRegister}
                title="Registrar"
                className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-500/20 text-blue-600 rounded hover:bg-blue-500/30 transition-colors font-medium"
              >
                <CheckCircle size={12} /> Registrar
              </button>
              <button
                onClick={() => skipScheduleOccurrence(schedule.id, nextDate)}
                title="Pular"
                className="flex items-center gap-1 px-2 py-1 text-xs bg-orange-500/15 text-orange-600 rounded hover:bg-orange-500/25 transition-colors font-medium"
              >
                <SkipForward size={12} /> Pular
              </button>
            </>
          )}
          <button onClick={() => onEditSchedule(schedule)} className="p-1.5 text-gray-600 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors">
            <Edit2 size={12} />
          </button>
          <button onClick={() => deleteSchedule(schedule.id)} className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors">
            <Trash2 size={12} />
          </button>
        </div>
      </td>
    </tr>
  )
}

function SchedulesTable({ schedules, categories, accounts, gerencialGroups, addTransaction, deleteSchedule, registerScheduleOccurrence, skipScheduleOccurrence, getNextOccurrences, onNewSchedule, onEditSchedule }) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const in7 = format(addDays(new Date(), 7), 'yyyy-MM-dd')
  const in30 = format(addDays(new Date(), 30), 'yyyy-MM-dd')

  const rows = useMemo(() => schedules.map(s => ({
    schedule: s,
    nextDate: getNextOccurrences(s, 1)[0] || null,
  })), [schedules, getNextOccurrences])

  const overdue = rows.filter(r => r.nextDate && r.nextDate < today).sort((a, b) => a.nextDate.localeCompare(b.nextDate))
  const next7 = rows.filter(r => r.nextDate && r.nextDate >= today && r.nextDate <= in7).sort((a, b) => a.nextDate.localeCompare(b.nextDate))
  const next30 = rows.filter(r => r.nextDate && r.nextDate > in7 && r.nextDate <= in30).sort((a, b) => a.nextDate.localeCompare(b.nextDate))
  const future = rows.filter(r => !r.nextDate || r.nextDate > in30).sort((a, b) => (a.nextDate || '9999').localeCompare(b.nextDate || '9999'))

  if (schedules.length === 0) {
    return (
      <div className="card text-center py-12">
        <Calendar size={32} className="text-gray-700 mx-auto mb-3" />
        <p className="text-gray-500">Nenhum agendamento cadastrado</p>
        <button className="btn-primary mt-4" onClick={onNewSchedule}>Criar primeiro agendamento</button>
      </div>
    )
  }

  const rowProps = { categories, accounts, gerencialGroups, addTransaction, registerScheduleOccurrence, skipScheduleOccurrence, deleteSchedule, onEditSchedule }

  return (
    <div className="card p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left px-3 py-2.5 text-xs text-gray-400 font-medium whitespace-nowrap">Próxima Data</th>
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
                <SectionHeader label="Em atraso" count={overdue.length} variant="overdue" />
                {overdue.map(({ schedule, nextDate }) => (
                  <ScheduleRow key={schedule.id} schedule={schedule} nextDate={nextDate} {...rowProps} />
                ))}
              </>
            )}
            {next7.length > 0 && (
              <>
                <SectionHeader label="Próximos 7 dias" count={next7.length} variant="soon" />
                {next7.map(({ schedule, nextDate }) => (
                  <ScheduleRow key={schedule.id} schedule={schedule} nextDate={nextDate} {...rowProps} />
                ))}
              </>
            )}
            {next30.length > 0 && (
              <>
                <SectionHeader label="Próximos 30 dias" count={next30.length} variant="month" />
                {next30.map(({ schedule, nextDate }) => (
                  <ScheduleRow key={schedule.id} schedule={schedule} nextDate={nextDate} {...rowProps} />
                ))}
              </>
            )}
            {future.length > 0 && (
              <>
                <SectionHeader label="Futuros" count={future.length} variant="default" />
                {future.map(({ schedule, nextDate }) => (
                  <ScheduleRow key={schedule.id} schedule={schedule} nextDate={nextDate} {...rowProps} />
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function SchedulePanel() {
  const {
    schedules, categories, accounts,
    payables, updatePayable, deletePayable,
    gerencialGroups, addTransaction,
    deleteSchedule, registerScheduleOccurrence, skipScheduleOccurrence, getNextOccurrences,
  } = useApp()

  const [activeTab, setActiveTab] = useState('conta')
  const [showForm, setShowForm] = useState(false)
  const [editSchedule, setEditSchedule] = useState(null)
  const [confirmDeletePayable, setConfirmDeletePayable] = useState(null)

  const pendingSchedules = schedules.filter(s => getNextOccurrences(s, 1).length > 0)
  const invoicePayables = (payables || []).filter(p => p.origin === 'invoice')
  const gerencialPayables = (payables || []).filter(p => p.origin === 'gerencial')
  const pendingInvoice = invoicePayables.filter(p => p.status === 'pending').length
  const pendingGerencial = gerencialPayables.filter(p => p.status === 'pending').length

  const handleMarkPaid = id => updatePayable(id, { status: 'paid', paidAt: new Date().toISOString() })
  const handleDeletePayable = id => { deletePayable(id); setConfirmDeletePayable(null) }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-300">Agendamentos & Contas a Pagar</h2>
          <p className="text-xs text-gray-500 mt-0.5">{pendingSchedules.length} agendamentos · {pendingInvoice + pendingGerencial} faturas pendentes</p>
        </div>
        {activeTab === 'conta' && (
          <button className="btn-primary flex items-center gap-2" onClick={() => { setEditSchedule(null); setShowForm(true) }}>
            <Plus size={14} /> Novo Agendamento
          </button>
        )}
      </div>

      <div className="border-b border-gray-800 flex gap-0 overflow-x-auto">
        <TabButton active={activeTab === 'conta'} onClick={() => setActiveTab('conta')} badge={pendingSchedules.length}>
          <Calendar size={14} /> Conta Corrente
        </TabButton>
        <TabButton active={activeTab === 'cartao'} onClick={() => setActiveTab('cartao')} badge={pendingInvoice}>
          <CreditCard size={14} /> Cartão de Crédito
        </TabButton>
        <TabButton active={activeTab === 'gerencial'} onClick={() => setActiveTab('gerencial')} badge={pendingGerencial}>
          <BarChart3 size={14} /> Gerencial
        </TabButton>
      </div>

      {activeTab === 'conta' && (
        <SchedulesTable
          schedules={schedules}
          categories={categories}
          accounts={accounts}
          gerencialGroups={gerencialGroups}
          addTransaction={addTransaction}
          deleteSchedule={deleteSchedule}
          registerScheduleOccurrence={registerScheduleOccurrence}
          skipScheduleOccurrence={skipScheduleOccurrence}
          getNextOccurrences={getNextOccurrences}
          onNewSchedule={() => { setEditSchedule(null); setShowForm(true) }}
          onEditSchedule={s => { setEditSchedule(s); setShowForm(true) }}
        />
      )}

      {activeTab === 'cartao' && (
        <div className="space-y-3">
          {invoicePayables.length === 0 ? (
            <div className="card text-center py-12">
              <CreditCard size={32} className="text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Nenhuma fatura gerada</p>
              <p className="text-gray-600 text-xs mt-1">As faturas são geradas automaticamente ao importar lançamentos de cartão</p>
            </div>
          ) : (
            invoicePayables.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map(p => (
              <PayableCard key={p.id} payable={p} gerencialGroups={gerencialGroups} accounts={accounts} onMarkPaid={handleMarkPaid} onDelete={() => setConfirmDeletePayable(p)} />
            ))
          )}
        </div>
      )}

      {activeTab === 'gerencial' && (
        <div className="space-y-3">
          {gerencialPayables.length === 0 ? (
            <div className="card text-center py-12">
              <BarChart3 size={32} className="text-gray-700 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Nenhuma conta gerencial gerada</p>
              <p className="text-gray-600 text-xs mt-1">Lançamentos no Grupo Gerencial (G) geram contas a pagar aqui</p>
            </div>
          ) : (
            gerencialPayables.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map(p => (
              <PayableCard key={p.id} payable={p} gerencialGroups={gerencialGroups} accounts={accounts} onMarkPaid={handleMarkPaid} onDelete={() => setConfirmDeletePayable(p)} />
            ))
          )}
        </div>
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
    </div>
  )
}
