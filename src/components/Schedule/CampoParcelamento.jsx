import HelpCampo from '../shared/HelpCampo'
import { maxParcelas } from '../../lib/parcelasOcorrencia'

// "Dividir cada ocorrência em [N] parcelas mensais": mesmo campo no Agendamento e na Provisão. O limite
// por frequência e as mensagens vêm de src/lib/parcelasOcorrencia.js.
export default function CampoParcelamento({ frequency, value, onChange, disabled = false, erro = null, bloqueado = false, helpId = 'agendamento.parcelasPorOcorrencia' }) {
  return (
    <div data-guia="agendamento-form.parcelas-por-ocorrencia" data-help-id={helpId} className="sm:col-span-2">
      <label className="label">
        <span className="inline-flex items-center">Parcelamento<HelpCampo campo={helpId} /></span>
      </label>
      <div className="flex flex-wrap items-center gap-2 text-sm text-texto-2">
        <span>{frequency === 'once' ? 'Dividir em' : 'Dividir cada ocorrência em'}</span>
        <input
          className="input text-center w-20"
          type="number"
          min="1"
          max={maxParcelas(frequency)}
          aria-label="Número de parcelas por ocorrência"
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled || bloqueado}
        />
        <span>parcelas mensais</span>
      </div>
      {bloqueado && <p className="text-[11px] text-texto-3 mt-1">Este item já tem ocorrências baixadas e não pode virar parcelado. Crie um novo parcelado a partir da próxima ocorrência.</p>}
      {erro && <p className="text-xs text-perigo mt-1" role="alert">{erro}</p>}
    </div>
  )
}
