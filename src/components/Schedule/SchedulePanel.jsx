import { useState } from 'react'
import { Plus, Calendar, CheckCircle, SkipForward, Trash2, Edit2, ChevronDown, ChevronUp, Clock } from 'lucide-react'
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

export default function SchedulePanel() {
  const { schedules, categories, accounts, deleteSchedule, registerScheduleOccurrence, skipScheduleOccurrence, getNextOccurrences } = useApp()
  const [showForm, setShowForm] = useState(false)
  const [editSchedule, setEditSchedule] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [expanded, setExpanded] = useState({})

  const toggleExpanded = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }))

  const getCategory = (id) => categories.find(c => c.id === id)
  const getAccount = (id) => accounts.find(a => a.id === id)

  const upcoming = schedules.filter(s => {
    const next = getNextOccurrences(s, 1)
    return next.length > 0
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-300">Agendamentos ({schedules.length})</h2>
          <p className="text-xs text-gray-500 mt-0.5">{upcoming.length} com próxima ocorrência</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => { setEditSchedule(null); setShowForm(true) }}>
          <Plus size={14} /> Novo Agendamento
        </button>
      </div>

      {schedules.length === 0 ? (
        <div className="card text-center py-12">
          <Calendar size={32} className="text-gray-700 mx-auto mb-3" />
          <p className="text-gray-500">Nenhum agendamento cadastrado</p>
          <button className="btn-primary mt-4" onClick={() => setShowForm(true)}>Criar primeiro agendamento</button>
        </div>
      ) : (
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
                      <span className={`badge ${schedule.transactionType === 'income' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                        {schedule.transactionType === 'income' ? 'Receita' : 'Despesa'}
                      </span>
                      <span className="badge bg-gray-800 text-gray-300">{FREQ_LABELS[schedule.frequency]}</span>
                      {schedule.occurrenceType === 'installment' && (
                        <span className="badge bg-blue-500/20 text-blue-400">{totalDone}/{schedule.installments}x</span>
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
                          <div className="h-1 bg-indigo-500 rounded-full" style={{ width: `${progress}%` }} />
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{progress}% concluído</p>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <p className={`text-lg font-bold ${schedule.transactionType === 'income' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {fmt(schedule.amount)}
                    </p>
                    {nextDate && (
                      <div className="flex gap-1">
                        <button
                          onClick={() => registerScheduleOccurrence(schedule.id, nextDate)}
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
                      <button onClick={() => { setEditSchedule(schedule); setShowForm(true) }} className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors">
                        <Edit2 size={12} />
                      </button>
                      <button onClick={() => setConfirmDelete(schedule)} className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors">
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
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => deleteSchedule(confirmDelete.id)}
        title="Excluir Agendamento"
        message={`Excluir o agendamento "${confirmDelete?.description}"?`}
        danger
      />
    </div>
  )
}
