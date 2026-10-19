import { useState } from 'react'
import { RefreshCw, BellOff } from 'lucide-react'
import { fmt, fmtDate } from './utils'

const FREQ_LABELS = {
  once: 'Única', daily: 'Diária', weekly: 'Semanal', biweekly: 'Quinzenal',
  monthly: 'Mensal', bimonthly: 'Bimestral', quarterly: 'Trimestral',
  quadrimestral: 'Quadrimestral', semiannual: 'Semestral', annual: 'Anual',
}

// "Sim, baixar agendamento" baixa SEMPRE pelo valor do lançamento (o do cartão), ligado a ele.
// onRegister({ atualizarFuturas }) — atualizarFuturas: as próximas ocorrências passam a esse valor.
export default function ScheduleMatchModal({ schedule, tx, categories, remaining = 0, onRegister, onKeep, onNeverAsk }) {
  const cat = categories.find(c => c.id === schedule.categoryId)
  const diff = Math.abs(schedule.amount - Number(tx.amount))
  const [atualizarFuturas, setAtualizarFuturas] = useState(false)

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-overlay" />
      <div data-modal-painel="" role="dialog" aria-modal="true" className="relative bg-surface border border-borda-forte rounded-2xl shadow-2xl w-full max-w-md">

        {/* Header */}
        <div className="flex items-start gap-3 p-5 border-b border-borda">
          <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
            <RefreshCw size={16} className="text-primary-fg" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-texto-1">Cobrança recorrente detectada</h3>
            <p className="text-xs text-texto-3 mt-0.5">Este lançamento corresponde a um agendamento ativo</p>
          </div>
          {remaining > 1 && (
            <span className="text-xs bg-surface-2 text-texto-2 px-2 py-1 rounded-full shrink-0 self-start">
              +{remaining - 1} restante{remaining - 1 > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Body */}
        <div className="p-5 space-y-3">
          {/* Transação do cartão */}
          <div className="bg-surface-2/50 rounded-xl p-3.5">
            <p className="text-[10px] font-semibold text-texto-3 uppercase tracking-wide mb-2">Lançamento no cartão</p>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm text-texto-1 font-medium truncate">
                  {tx.description || tx.payee || 'Sem descrição'}
                </p>
                {tx.payee && tx.description && (
                  <p className="text-xs text-texto-3 mt-0.5">👤 {tx.payee}</p>
                )}
                <p className="text-xs text-texto-3 mt-0.5">{fmtDate(tx.date)}</p>
              </div>
              <p className="text-base font-bold text-despesa shrink-0">{fmt(tx.amount)}</p>
            </div>
          </div>

          <div className="text-center text-xs text-texto-3 flex items-center gap-2">
            <div className="flex-1 h-px bg-surface-2" />
            corresponde a
            <div className="flex-1 h-px bg-surface-2" />
          </div>

          {/* Agendamento */}
          <div className="bg-primary/10 border border-primary/20 rounded-xl p-3.5">
            <p className="text-[10px] font-semibold text-primary-fg uppercase tracking-wide mb-2">Agendamento recorrente</p>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm text-texto-1 font-medium truncate">{schedule.description}</p>
                {schedule.payee && (
                  <p className="text-xs text-texto-3 mt-0.5">👤 {schedule.payee}</p>
                )}
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {cat && (
                    <span className="text-[10px] bg-surface-2 text-texto-2 px-1.5 py-0.5 rounded">
                      {cat.icon} {cat.name}
                    </span>
                  )}
                  <span className="text-[10px] text-texto-3">
                    {FREQ_LABELS[schedule.frequency] || schedule.frequency}
                  </span>
                </div>
              </div>
              <p className="text-base font-bold text-despesa shrink-0">{fmt(schedule.amount)}</p>
            </div>
          </div>

          {diff > 0.01 && (
            <p className="text-xs text-aviso text-center bg-aviso/5 rounded-lg py-1.5">
              Diferença de {fmt(diff)} em relação ao valor agendado
            </p>
          )}
          <p className="text-xs text-texto-1 text-center">
            Será baixado por <span className="font-semibold">{fmt(tx.amount)}</span> (valor do cartão)
          </p>
          {diff > 0.01 && (
            <label className="flex items-start gap-2 text-xs text-texto-2 cursor-pointer">
              <input type="checkbox" className="accent-primary mt-0.5" checked={atualizarFuturas} onChange={e => setAtualizarFuturas(e.target.checked)} />
              <span>Atualizar também as próximas ocorrências para {fmt(tx.amount)}</span>
            </label>
          )}
        </div>

        {/* Ações */}
        <div className="px-5 pb-5 space-y-2">
          <button
            className="btn-primary w-full flex items-center justify-center gap-2"
            onClick={() => onRegister({ atualizarFuturas })}
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
            className="w-full flex items-center justify-center gap-1.5 text-xs text-texto-3 hover:text-texto-2 transition-colors py-1.5 rounded-lg hover:bg-surface-hover/40"
            onClick={onNeverAsk}
          >
            <BellOff size={11} /> Não perguntar novamente para este favorecido
          </button>
        </div>
      </div>
    </div>
  )
}
