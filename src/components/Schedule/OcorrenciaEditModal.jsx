import { useState } from 'react'
import { X } from 'lucide-react'
import DateInput from '../shared/DateInput'
import InputMoeda from '../shared/InputMoeda'
import { mensagemConflitoPulo } from '../../lib/conflitoPeriodo'

// Editar UMA ocorrência (ou parcela) pela prévia: pular, data e valor. Usado pelo Editar Agendamento e
// pela Provisão de Despesa; quem chama decide o que fazer com { skip, date, amount }.
export default function OcorrenciaEditModal({ originalDate, override, isSkipped, defaultAmount, baixaNoMes = null, titulo = null, onSave, onClose }) {
  const [date, setDate] = useState(override?.date || originalDate)
  const [amount, setAmount] = useState(String(override?.amount ?? defaultAmount))
  const [skip, setSkip] = useState(isSkipped || false)
  // Marcar "Pular" num mês que já tem baixa gravada com outra data (src/lib/conflitoPeriodo.js)
  // pede confirmação antes; Cancelar é o padrão.
  const [confirmandoPulo, setConfirmandoPulo] = useState(false)
  const alternarPulo = (marcar) => {
    if (marcar && baixaNoMes && !isSkipped) { setConfirmandoPulo(true); return }
    setSkip(marcar)
  }
  const fmtD = (d) => d.split('-').reverse().join('/')
  const stopEnter = (e) => { if (e.key === 'Enter') e.preventDefault() }

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-overlay" onClick={onClose} />
      <div className="relative bg-surface border border-borda-forte rounded-xl shadow-2xl w-64 p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-texto-1">{titulo || `Ocorrência de ${fmtD(originalDate)}`}</p>
          <button type="button" onClick={onClose} className="text-texto-3 hover:text-texto-2 p-0.5 rounded transition-colors">
            <X size={14} />
          </button>
        </div>

        <label className="flex items-center gap-2.5 mb-3.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={skip}
            onChange={e => alternarPulo(e.target.checked)}
            className="w-4 h-4 rounded accent-primary cursor-pointer"
          />
          <span className="text-sm text-texto-2">Pular esta ocorrência</span>
        </label>

        {confirmandoPulo && (
          <div role="alert" className="mb-3.5 rounded-lg border border-aviso/40 bg-aviso/10 px-3 py-2.5 text-xs space-y-2">
            <p className="text-texto-1">⚠ {mensagemConflitoPulo(baixaNoMes)}</p>
            <div className="flex gap-2">
              <button type="button" className="btn-secondary flex-1 text-xs py-1.5" onClick={() => setConfirmandoPulo(false)}>Cancelar</button>
              <button type="button" className="btn-danger flex-1 text-xs py-1.5" onClick={() => { setSkip(true); setConfirmandoPulo(false) }}>Pular mesmo assim</button>
            </div>
          </div>
        )}

        {!skip && (
          <div className="space-y-2.5">
            <div>
              <label className="label">Nova data</label>
              <DateInput
                className="input"
                value={date}
                onChange={e => setDate(e.target.value)}
                onKeyDown={stopEnter}
                hoje
              />
            </div>
            <div>
              <label className="label">Valor (R$)</label>
              <InputMoeda
                min="0"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                onKeyDown={stopEnter}
              />
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <button type="button" className="btn-secondary flex-1 text-xs py-1.5" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary flex-1 text-xs py-1.5"
            onClick={() => onSave({
              skip,
              date: skip ? originalDate : date,
              amount: skip ? defaultAmount : Number(amount),
            })}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}
