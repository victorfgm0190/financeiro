import { useEffect, useState } from 'react'
import { Bell, CreditCard, Calendar, AlertTriangle, CheckCircle, Zap } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt } from '../shared/utils'
import { differenceInDays, format, parseISO } from 'date-fns'

function getDueAlerts(accounts) {
  const today = new Date()
  const alerts = []
  accounts
    .filter(a => a.type === 'credit')
    .forEach(account => {
      const dueDay = account.dueDay || 10
      let dueDate = new Date(today.getFullYear(), today.getMonth(), dueDay)
      if (dueDate < today) dueDate = new Date(today.getFullYear(), today.getMonth() + 1, dueDay)
      const daysUntilDue = differenceInDays(dueDate, today)
      if (daysUntilDue <= 5) {
        alerts.push({
          id: `credit_${account.id}`,
          kind: 'credit',
          type: daysUntilDue === 0 ? 'due_today' : daysUntilDue < 0 ? 'overdue' : 'upcoming',
          account,
          dueDate,
          daysUntilDue,
          amount: account.creditMonthBill || 0,
        })
      }
    })
  return alerts
}

function getScheduleAlerts(schedules, getNextOccurrences) {
  const today = new Date()
  const alerts = []
  for (const schedule of schedules) {
    const remindDays = schedule.remindDaysBefore ?? 3
    if (remindDays <= 0) continue
    const nextOccs = getNextOccurrences(schedule, 1)
    if (nextOccs.length === 0) continue
    const dueDate = parseISO(nextOccs[0])
    const daysUntilDue = differenceInDays(dueDate, today)
    if (daysUntilDue < 0 || daysUntilDue > remindDays) continue
    alerts.push({
      id: `sched_${schedule.id}_${nextOccs[0]}`,
      kind: 'schedule',
      type: daysUntilDue === 0 ? 'due_today' : 'upcoming',
      schedule,
      dueDate,
      daysUntilDue,
      amount: schedule.amount,
    })
  }
  return alerts
}

export default function AlertsPanel() {
  const { profileAccounts: accounts, profileSchedules: schedules, getNextOccurrences } = useApp()
  const [notificationsEnabled, setNotificationsEnabled] = useState(Notification?.permission === 'granted')
  const [dismissed, setDismissed] = useState([])

  const creditAlerts = getDueAlerts(accounts).filter(a => !dismissed.includes(a.id))
  const scheduleAlerts = getScheduleAlerts(schedules, getNextOccurrences).filter(a => !dismissed.includes(a.id))
  const alerts = [...scheduleAlerts, ...creditAlerts]

  const requestNotifications = async () => {
    if (!('Notification' in window)) return
    const result = await Notification.requestPermission()
    setNotificationsEnabled(result === 'granted')
  }

  useEffect(() => {
    if (!notificationsEnabled) return
    alerts.forEach(alert => {
      if (alert.type === 'due_today') {
        const name = alert.kind === 'schedule' ? alert.schedule.description : alert.account.name
        new Notification(`Vence hoje! — ${name}`, {
          body: `Valor: ${fmt(alert.amount)}`,
          icon: '/favicon.svg',
        })
      }
    })
  }, [notificationsEnabled]) // eslint-disable-line react-hooks/exhaustive-deps

  const alertColor = (type) => {
    if (type === 'overdue') return 'border-red-500/50 bg-red-500/5'
    if (type === 'due_today') return 'border-amber-500/50 bg-amber-500/5'
    return 'border-violet-500/30 bg-violet-500/5'
  }

  const alertBadgeColor = (type) => {
    if (type === 'overdue') return 'bg-red-500/20 text-red-400'
    if (type === 'due_today') return 'bg-amber-500/20 text-amber-400'
    return 'bg-violet-500/20 text-violet-600'
  }

  const alertIcon = (alert) => {
    if (alert.type === 'overdue') return <AlertTriangle size={18} className="text-red-400" />
    if (alert.type === 'due_today') return <AlertTriangle size={18} className="text-amber-400" />
    if (alert.kind === 'schedule') return <Calendar size={18} className="text-violet-600" />
    return <Bell size={18} className="text-violet-600" />
  }

  const alertLabel = (a) => {
    if (a.daysUntilDue < 0) return `Atrasada há ${Math.abs(a.daysUntilDue)} dias!`
    if (a.daysUntilDue === 0) return 'Vence HOJE!'
    return `Vence em ${a.daysUntilDue} ${a.daysUntilDue === 1 ? 'dia' : 'dias'}`
  }

  return (
    <div className="space-y-4">
      <div className="card flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-300">Notificações do Navegador</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {notificationsEnabled ? 'Ativadas — você receberá alertas de vencimento' : 'Desativadas — ative para receber alertas'}
          </p>
        </div>
        {notificationsEnabled ? (
          <div className="flex items-center gap-2 text-emerald-400 text-sm">
            <CheckCircle size={16} /> Ativo
          </div>
        ) : (
          <button className="btn-primary flex items-center gap-2" onClick={requestNotifications}>
            <Bell size={14} /> Ativar Notificações
          </button>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-300 mb-3">
          Alertas ({alerts.length})
        </h2>

        {alerts.length === 0 ? (
          <div className="card text-center py-12">
            <CheckCircle size={32} className="text-emerald-600 mx-auto mb-3" />
            <p className="text-gray-400">Nenhum alerta no momento</p>
            <p className="text-xs text-gray-600 mt-1">Alertas aparecem conforme configurado em cada agendamento e cartão</p>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map(alert => (
              <div key={alert.id} className={`card border ${alertColor(alert.type)} flex items-start justify-between gap-4`}>
                <div className="flex items-start gap-3">
                  {alertIcon(alert)}
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-100">
                        {alert.kind === 'schedule' ? alert.schedule.description : alert.account.name}
                      </p>
                      <span className={`badge ${alertBadgeColor(alert.type)}`}>{alertLabel(alert)}</span>
                      {alert.kind === 'schedule' && (
                        <span className="badge bg-violet-500/20 text-violet-600">Agendamento</span>
                      )}
                      {alert.kind === 'credit' && (
                        <span className="badge bg-gray-700/60 text-gray-400">Cartão</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {alert.kind === 'schedule' ? (
                        <>
                          {alert.schedule.transactionType === 'income' ? 'Receita' : 'Despesa'}
                          {': '}
                          <span className="text-gray-300 font-medium">{fmt(alert.amount)}</span>
                          {' · '}Próximo: {format(alert.dueDate, 'dd/MM/yyyy')}
                          {alert.schedule.payee ? ` · ${alert.schedule.payee}` : ''}
                        </>
                      ) : (
                        <>
                          Fatura: <span className="text-gray-300 font-medium">{fmt(alert.amount)}</span>
                          {' · '}Vencimento: {format(alert.dueDate, 'dd/MM/yyyy')}
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setDismissed(prev => [...prev, alert.id])}
                  className="text-xs text-gray-600 hover:text-gray-400 transition-colors shrink-0"
                >
                  Dispensar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Calendário de Vencimentos — Cartões</h3>
        <div className="space-y-2">
          {accounts.filter(a => a.type === 'credit').map(acc => {
            const today = new Date()
            let dueDate = new Date(today.getFullYear(), today.getMonth(), acc.dueDay || 10)
            if (dueDate < today) dueDate = new Date(today.getFullYear(), today.getMonth() + 1, acc.dueDay || 10)
            const days = differenceInDays(dueDate, today)
            return (
              <div key={acc.id} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <CreditCard size={14} className="text-violet-600" />
                  <span className="text-sm text-gray-300">{acc.name}</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-gray-500">{format(dueDate, 'dd/MM/yyyy')}</span>
                  <span className={`font-medium ${days <= 0 ? 'text-red-400' : days <= 5 ? 'text-amber-400' : 'text-gray-400'}`}>
                    {days === 0 ? 'Hoje' : days < 0 ? `${Math.abs(days)}d atrasado` : `${days}d`}
                  </span>
                  <span className="text-gray-400 font-medium">{fmt(acc.creditMonthBill || 0)}</span>
                </div>
              </div>
            )
          })}
          {accounts.filter(a => a.type === 'credit').length === 0 && (
            <p className="text-xs text-gray-500 text-center py-4">Nenhum cartão de crédito cadastrado</p>
          )}
        </div>
      </div>

      <div className="card">
        <div className="flex items-center gap-2 mb-3">
          <Zap size={14} className="text-emerald-400" />
          <h3 className="text-sm font-semibold text-gray-300">Registro Automático</h3>
        </div>
        <p className="text-xs text-gray-500">
          Agendamentos com <span className="text-gray-300">Registrar Automático</span> ativado são baixados automaticamente
          na data de vencimento ao abrir o app. Agendamentos com <span className="text-gray-300">Lembrar com Antecedência</span> geram alertas
          acima X dias antes da próxima ocorrência.
        </p>
      </div>
    </div>
  )
}
