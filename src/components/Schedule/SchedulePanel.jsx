import { useState } from 'react'
import { Plus, Calendar, CheckCircle, SkipForward, Trash2, Edit2, ChevronDown, ChevronUp, Clock, CreditCard, BarChart3 } from 'lucide-react'
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
  semiannual: 'Semestral',
  annual: 'Anual',
}

function GerBadge({ grupoId, gerencialGroups }) {
  if (!grupoId) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-blue-500/20 text-blue-400">
        G
      </span>
    )
  }
  const grupo = gerencialGroups.find(g => g.id === grupoId)
  if (!grupo) return null
  let cls = 'inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold'
  if (grupo.number === 1) cls += ' bg-emerald-500/20 text-emerald-400'
  else if (grupo.number === 'D') cls += ' bg-gray-700/50 text-gray-500'
  else cls += ' bg-orange-500/20 text-orange-400'
  const label = grupo.number === 1 ? '1' : grupo.alias
  return <span className={cls}>{label}</span>
}

function TabButton({ active, onClick, children, badge }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
        active
          ? 'border-[#0F6E56] text-[#0F6E56]'
          : 'border-transparent text-gray-500 hover:text-gray-300'
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
            {payable.status === 'paid' && (
              <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-medium">Pago</span>
            )}
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
              <button
                onClick={() => onMarkPaid(payable.id)}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-emerald-600/20 text-emerald-400 rounded-lg hover:bg-emerald-600/30 transition-colors"
              >
                <CheckCircle size={11} /> Marcar Pago
              </button>
            )}
            <button
              onClick={() => onDelete(payable.id)}
              className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SchedulesTab({ schedules, categories, accounts, gerencialGroups, addTransaction, deleteSchedule, registerScheduleOccurrence, skipScheduleOccurrence, getNextOccurrences, onNewSchedule, onEditSchedule }) {
  const [expanded, setExpanded] = useState({})
  const toggleExpanded = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  const getCategory = (id) => categories.find(c => c.id === id)
  const getAccount = (id) => accounts.find(a => a.id === id)

  const contaPrincipal =
    accounts.find(a => a.type === 'checking' && a.contaCorrentePrincipal) ||
    accounts.find(a => a.isMain && a.type !== 'credit') ||
    accounts.find(a => a.type === 'checking')

  const handleRegister = (schedule, date) => {
    registerScheduleOccurrence(schedule.id, date)
    if (!schedule.grupoGerencial) return
    const grupo = gerencialGroups.find(g => g.id === schedule.grupoGerencial)
    if (!grupo || grupo.number === 'D') return

    if (grupo.number === 1) {
      // Reserva: transfere da conta do agendamento para a conta de reserva do grupo
      const contaReserva = accounts.find(a => a.id === grupo.defaultAccountId)
      if (schedule.accountId && contaReserva) {
        addTransaction({
          type: 'transfer',
          accountId: schedule.accountId,
          toAccountId: contaReserva.id,
          amount: schedule.amount,
          date,
          description: `Reserva ${grupo.name}`,
          grupoGerencial: grupo.id,
        })
      }
      return
    }

    // Grupos 2..N: resgate automático da conta do grupo para a conta principal
    const contaResgate = accounts.find(a => a.id === grupo.defaultAccountId)
    if (contaResgate && contaPrincipal) {
      addTransaction({
        type: 'transfer',
        accountId: contaResgate.id,
        toAccountId: contaPrincipal.id,
        amount: schedule.amount,
        date,
        description: `Resgate ${grupo.name}`,
        grupoGerencial: grupo.id,
      })
    }
  }

  if (schedules.length === 0) {
    return (
      <div className="card text-center py-12">
        <Calendar size={32} className="text-gray-700 mx-auto mb-3" />
        <p className="text-gray-500">Nenhum agendamento cadastrado</p>
        <button className="btn-primary mt-4" onClick={onNewSchedule}>Criar primeiro agendamento</button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {schedules.map(schedule => {
        const nextOccurrences = getNextOccurrences(schedule, 12)
        const nextDate = nextOccurrences[0]
        const cat = getCategory(schedule.categoryId)
        const acc = getAccount(schedule.accountId)
        const isExpanded = expanded[schedule.id]
        const registered = schedule.registered || []
        const skipped = schedule.skipped || []
        const totalDone = registered.length + skipped.length
        const progress = schedule.occurrenceType === 'installment'
          ? Math.round((totalDone / schedule.installments) * 100)
          : null

        return (
          <div key={schedule.id} className="card">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`badge ${schedule.transactionType === 'income' ? 'bg-blue-500/20 text-blue-600' : 'bg-orange-500/20 text-orange-600'}`}>
                    {schedule.transactionType === 'income' ? 'Receita' : 'Despesa'}
                  </span>
                  <span className="badge bg-gray-800 text-gray-300">{FREQ_LABELS[schedule.frequency]}</span>
                  {schedule.occurrenceType === 'installment' && (
                    <span className="badge bg-blue-500/20 text-blue-400">{totalDone}/{schedule.installments}x</span>
                  )}
                  {schedule.transactionType === 'expense' && (
                    <GerBadge grupoId={schedule.grupoGerencial} gerencialGroups={gerencialGroups} />
                  )}
                </div>
                <h3 className="font-semibold text-gray-100 mt-1">{schedule.description}</h3>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                  {cat && <span>{cat.icon} {cat.name}</span>}
                  {acc && <span>📍 {acc.name}</span>}
                  {schedule.payee && <span>👤 {schedule.payee}</span>}
                </div>
                {nextDate && (
                  <div className="flex items-center gap-1 mt-2 text-xs text-amber-400">
                    <Clock size={11} />
                    <span>Próximo: {fmtDate(nextDate)}</span>
                  </div>
                )}
                {progress !== null && (
                  <div className="mt-2">
                    <div className="h-1 bg-gray-800 rounded-full">
                      <div className="h-1 rounded-full" style={{ width: `${progress}%`, backgroundColor: '#0F6E56' }} />
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{progress}% concluído</p>
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                <p className={`text-lg font-bold ${schedule.transactionType === 'income' ? 'text-blue-600' : 'text-orange-600'}`}>
                  {fmt(schedule.amount)}
                </p>
                {nextDate && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleRegister(schedule, nextDate)}
                      className="flex items-center gap-1 px-2 py-1 text-xs bg-emerald-600/20 text-emerald-400 rounded-lg hover:bg-emerald-600/30 transition-colors"
                    >
                      <CheckCircle size={11} /> Registrar
                    </button>
                    <button
                      onClick={() => skipScheduleOccurrence(schedule.id, nextDate)}
                      className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-800 text-gray-400 rounded-lg hover:bg-gray-700 transition-colors"
                    >
                      <SkipForward size={11} /> Pular
                    </button>
                  </div>
                )}
                <div className="flex gap-1">
                  <button onClick={() => onEditSchedule(schedule)} className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors">
                    <Edit2 size={12} />
                  </button>
                  <button onClick={() => deleteSchedule(schedule.id)} className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>

            {nextOccurrences.length > 0 && (
              <button
                onClick={() => toggleExpanded(schedule.id)}
                className="mt-3 text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors"
              >
                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                Próximas {nextOccurrences.length} ocorrências
              </button>
            )}
            {isExpanded && (
              <div className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                {nextOccurrences.map((date, i) => (
                  <div key={date} className={`text-center p-2 rounded-lg text-xs ${i === 0 ? 'bg-amber-500/20 text-amber-400 font-medium' : 'bg-gray-800 text-gray-400'}`}>
                    {fmtDate(date)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
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

  const handleMarkPaid = (id) => {
    updatePayable(id, { status: 'paid', paidAt: new Date().toISOString() })
  }

  const handleDeletePayable = (id) => {
    deletePayable(id)
    setConfirmDeletePayable(null)
  }

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

      {/* Tabs */}
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

      {/* Tab Content */}
      {activeTab === 'conta' && (
        <SchedulesTab
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
          onEditSchedule={(s) => { setEditSchedule(s); setShowForm(true) }}
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
              <PayableCard
                key={p.id}
                payable={p}
                gerencialGroups={gerencialGroups}
                accounts={accounts}
                onMarkPaid={handleMarkPaid}
                onDelete={() => setConfirmDeletePayable(p)}
              />
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
              <PayableCard
                key={p.id}
                payable={p}
                gerencialGroups={gerencialGroups}
                accounts={accounts}
                onMarkPaid={handleMarkPaid}
                onDelete={() => setConfirmDeletePayable(p)}
              />
            ))
          )}
        </div>
      )}

      <Modal
        open={showForm}
        onClose={() => { setShowForm(false); setEditSchedule(null) }}
        title={editSchedule ? 'Editar Agendamento' : 'Novo Agendamento'}
        size="lg"
      >
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
