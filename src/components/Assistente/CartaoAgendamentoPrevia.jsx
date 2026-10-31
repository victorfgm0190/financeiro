import { CalendarPlus } from 'lucide-react'
import FimRepeticao from '../shared/FimRepeticao'
import { primeiraOcorrencia } from '../../lib/assistente/prontidao'
import { fmt, fmtDate } from '../shared/utils'

const FREQS = [['monthly', 'Mensal'], ['weekly', 'Semanal'], ['biweekly', 'Quinzenal'], ['bimonthly', 'Bimestral'], ['quarterly', 'Trimestral'], ['semiannual', 'Semestral'], ['annual', 'Anual']]

// Cartão do AGENDAMENTO na prévia "Despesa + agendamento": marcar/desmarcar, recorrência, até quando,
// 1ª ocorrência (a despesa é a deste período) e o rateio herdado. Os valores vão para a repetição do
// formulário da despesa; "Confirmar tudo" grava só o que estiver marcado.
//   cfg: { ativo, repeatFrequency, repeatOccurrenceType, repeatInstallments, repeatStartDate }
export default function CartaoAgendamentoPrevia({ cfg, onChange, rateio = [], categories = [], motivo = null }) {
  const primeira = cfg.repeatStartDate ? primeiraOcorrencia({ data: cfg.repeatStartDate, recorrencia: cfg.repeatFrequency }) : null
  const nome = (id) => categories.find(c => c.id === id)?.name || 'Categoria'
  return (
    <section className={`rounded-xl border-2 ${cfg.ativo ? 'border-primary/50' : 'border-borda opacity-70'} bg-surface p-3 space-y-3`} aria-label="Cartão do agendamento">
      <label className="flex items-center gap-2.5 cursor-pointer min-h-[40px]">
        <input type="checkbox" className="accent-primary w-5 h-5" checked={cfg.ativo} onChange={e => onChange({ ...cfg, ativo: e.target.checked })} />
        <CalendarPlus size={16} className="text-primary-fg" />
        <span className="text-sm font-semibold text-texto-1">Agendamento</span>
        {motivo && <span className="text-[11px] text-texto-3 truncate">· {motivo}</span>}
      </label>
      {cfg.ativo && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="prev-freq">Recorrência</label>
              <select id="prev-freq" className="input" value={cfg.repeatFrequency} onChange={e => onChange({ ...cfg, repeatFrequency: e.target.value })}>
                {FREQS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="text-xs text-texto-2 self-end pb-2">
              {primeira && <>1ª ocorrência: <strong>{fmtDate(primeira)}</strong> (a despesa conta como a de {fmtDate(cfg.repeatStartDate)})</>}
            </div>
          </div>
          <div>
            <label className="label">Até quando</label>
            <FimRepeticao
              inicio={cfg.repeatStartDate}
              recorrencia={cfg.repeatFrequency}
              occurrenceType={cfg.repeatOccurrenceType}
              installments={cfg.repeatInstallments}
              onChange={({ occurrenceType, installments }) => onChange({ ...cfg, repeatOccurrenceType: occurrenceType, repeatInstallments: installments || cfg.repeatInstallments })}
            />
          </div>
          {rateio.length > 0 && (
            <p className="text-xs text-texto-2">Rateio herdado: {rateio.map(r => `${nome(r.categoriaId)} ${fmt(r.valor)}`).join(' + ')}</p>
          )}
        </>
      )}
    </section>
  )
}
