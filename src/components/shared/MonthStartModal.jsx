import { useState, useMemo, useEffect } from 'react'
import { format } from 'date-fns'
import { X, CheckCircle } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { executarTransferenciasInicioMes } from '../../lib/autoRegistro'
import { occEfetiva, proximaEfetiva } from '../../lib/fluxoCaixa'
import { fmt, fmtDate } from './utils'

const SESSION_KEY = 'monthStartModalDismissed'

export default function MonthStartModal() {
  const {
    schedules, accounts, settings,
    getNextOccurrences, registerScheduleOccurrence,
  } = useApp()

  const [dismissed, setDismissed] = useState(() => !!sessionStorage.getItem(SESSION_KEY))
  const [selected, setSelected] = useState(null)

  const today        = new Date()
  const financialStartDay = settings?.financialMonthStartDay || 1
  const currentMonth = format(today, 'yyyy-MM')
  const isAfterStart = today.getDate() >= financialStartDay

  const pendingSchedules = useMemo(() => {
    if (!isAfterStart) return []
    return schedules.filter(s => {
      if (s.transactionType !== 'transfer') return false
      if (!s.overrides?._gerencialKey && !s.overrides?._originTxId) return false
      const toAcc = accounts.find(a => a.id === s.toAccountId)
      if (toAcc?.type === 'credit') return false
      // Mês pela data EFETIVA da próxima ocorrência (override de data).
      const nextDate = proximaEfetiva(s, getNextOccurrences)?.date
      return nextDate && nextDate.startsWith(currentMonth)
    })
  }, [schedules, accounts, getNextOccurrences, isAfterStart, currentMonth])

  // Initialize all checked when modal first becomes relevant
  useEffect(() => {
    if (pendingSchedules.length > 0 && selected === null) {
      setSelected(new Set(pendingSchedules.map(s => s.id)))
    }
  }, [pendingSchedules, selected])

  if (dismissed || !isAfterStart || pendingSchedules.length === 0) return null

  const selectedSet = selected ?? new Set(pendingSchedules.map(s => s.id))

  const handleDismiss = () => {
    sessionStorage.setItem(SESSION_KEY, '1')
    setDismissed(true)
  }

  const executeSchedules = (list) => {
    executarTransferenciasInicioMes(list, { getNextOccurrences, registerScheduleOccurrence })
    handleDismiss()
  }

  const handleExecuteAll      = () => executeSchedules(pendingSchedules)
  const handleExecuteSelected = () => executeSchedules(pendingSchedules.filter(s => selectedSet.has(s.id)))

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev ?? pendingSchedules.map(s => s.id))
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const monthLabel  = today.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })
  const selectedTotal = pendingSchedules
    .filter(s => selectedSet.has(s.id))
    .reduce((sum, s) => {
      const d = getNextOccurrences(s, 1)[0]
      return sum + (Number(d ? occEfetiva(s, d).amount : s.amount) || 0)
    }, 0)

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-overlay" onClick={handleDismiss} />
      <div className="relative bg-surface border border-borda-forte rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-borda shrink-0">
          <div>
            <h3 className="font-semibold text-texto-1">Transferências do início do mês</h3>
            <p className="text-xs text-texto-3 mt-0.5 capitalize">{monthLabel}</p>
          </div>
          <button onClick={handleDismiss} className="p-1 text-texto-3 hover:text-texto-2 rounded transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {pendingSchedules.map(sch => {
            const fromAcc  = accounts.find(a => a.id === sch.accountId)
            const toAcc    = accounts.find(a => a.id === sch.toAccountId)
            const prox = proximaEfetiva(sch, getNextOccurrences)
            const nextDate = prox?.date
            const isSelected = selectedSet.has(sch.id)
            return (
              <div
                key={sch.id}
                onClick={() => toggleSelect(sch.id)}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-primary/10 border-primary/20'
                    : 'bg-surface-2/40 border-borda-forte/50 opacity-50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(sch.id)}
                  onClick={e => e.stopPropagation()}
                  className="w-4 h-4 rounded accent-primary shrink-0 cursor-pointer"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-texto-2 font-medium truncate">{sch.description}</p>
                  <p className="text-xs text-texto-3 mt-0.5">
                    {fromAcc?.apelido || fromAcc?.name || '?'}
                    {' → '}
                    {toAcc?.apelido || toAcc?.name || '?'}
                    {nextDate && <span className="ml-2 text-texto-3">· {fmtDate(nextDate)}</span>}
                  </p>
                </div>
                <span className="text-sm font-bold text-transferencia shrink-0">{fmt(prox ? prox.amount : sch.amount)}</span>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-borda space-y-3 shrink-0">
          {selectedSet.size > 0 && selectedSet.size < pendingSchedules.length && (
            <p className="text-xs text-texto-3 text-center">
              {selectedSet.size} de {pendingSchedules.length} selecionadas · {fmt(selectedTotal)}
            </p>
          )}
          <div className="flex gap-2">
            <button className="btn-secondary shrink-0 px-4" onClick={handleDismiss}>
              Agora não
            </button>
            <button
              className="flex-1 py-2 px-3 text-sm font-medium bg-surface-hover text-texto-1 rounded-lg hover:bg-surface-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              onClick={handleExecuteSelected}
              disabled={selectedSet.size === 0}
            >
              Executar selecionadas
            </button>
            <button
              className="btn-primary flex-1 text-sm flex items-center justify-center gap-2"
              onClick={handleExecuteAll}
            >
              <CheckCircle size={14} /> Executar todas
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
