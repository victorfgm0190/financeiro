import { RefreshCw, BellOff } from 'lucide-react'
import { fmt, fmtDate } from './utils'

const FREQ_LABELS = {
  once: 'Única', daily: 'Diária', weekly: 'Semanal', biweekly: 'Quinzenal',
  monthly: 'Mensal', bimonthly: 'Bimestral', quarterly: 'Trimestral',
  quadrimestral: 'Quadrimestral', semiannual: 'Semestral', annual: 'Anual',
}

export default function ScheduleMatchModal({ schedule, tx, categories, remaining = 0, onRegister, onKeep, onNeverAsk }) {
  const cat = categories.find(c => c.id === schedule.categoryId)
  const diff = Math.abs(schedule.amount - Number(tx.amount))

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative bg-surface border border-gray-700 rounded-2xl shadow-2xl w-full max-w-md">

        {/* Header */}
        <div className="flex items-start gap-3 p-5 border-b border-gray-800">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
            <RefreshCw size={16} className="text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-100">Cobrança recorrente detectada</h3>
            <p className="text-xs text-gray-500 mt-0.5">Este lançamento corresponde a um agendamento ativo</p>
          </div>
          {remaining > 1 && (
            <span className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded-full shrink-0 self-start">
              +{remaining - 1} restante{remaining - 1 > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Body */}
        <div className="p-5 space-y-3">
          {/* Transação do cartão */}
          <div className="bg-gray-800/50 rounded-xl p-3.5">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Lançamento no cartão</p>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm text-gray-200 font-medium truncate">
                  {tx.description || tx.payee || 'Sem descrição'}
                </p>
                {tx.payee && tx.description && (
                  <p className="text-xs text-gray-500 mt-0.5">👤 {tx.payee}</p>
                )}
                <p className="text-xs text-gray-500 mt-0.5">{fmtDate(tx.date)}</p>
              </div>
              <p className="text-base font-bold text-despesa shrink-0">{fmt(tx.amount)}</p>
            </div>
          </div>

          <div className="text-center text-xs text-gray-600 flex items-center gap-2">
            <div className="flex-1 h-px bg-gray-800" />
            corresponde a
            <div className="flex-1 h-px bg-gray-800" />
          </div>

          {/* Agendamento */}
          <div className="bg-emerald-950/30 border border-emerald-800/30 rounded-xl p-3.5">
            <p className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wide mb-2">Agendamento recorrente</p>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm text-gray-200 font-medium truncate">{schedule.description}</p>
                {schedule.payee && (
                  <p className="text-xs text-gray-500 mt-0.5">👤 {schedule.payee}</p>
                )}
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {cat && (
                    <span className="text-[10px] bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded">
                      {cat.icon} {cat.name}
                    </span>
                  )}
                  <span className="text-[10px] text-gray-600">
                    {FREQ_LABELS[schedule.frequency] || schedule.frequency}
                  </span>
                </div>
              </div>
              <p className="text-base font-bold text-despesa shrink-0">{fmt(schedule.amount)}</p>
            </div>
          </div>

          {diff > 0.01 && (
            <p className="text-xs text-amber-500/70 text-center bg-amber-500/5 rounded-lg py-1.5">
              Diferença de {fmt(diff)} em relação ao valor agendado
            </p>
          )}
        </div>

        {/* Ações */}
        <div className="px-5 pb-5 space-y-2">
          <button
            className="btn-primary w-full flex items-center justify-center gap-2"
            onClick={onRegister}
          >
            <RefreshCw size={13} /> Sim, baixar agendamento
          </button>
          <button
            className="btn-secondary w-full"
            onClick={onKeep}
          >
            Não, manter agendamento
          </button>
          <button
            className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-600 hover:text-gray-400 transition-colors py-1.5 rounded-lg hover:bg-gray-800/40"
            onClick={onNeverAsk}
          >
            <BellOff size={11} /> Não perguntar novamente para este favorecido
          </button>
        </div>
      </div>
    </div>
  )
}
