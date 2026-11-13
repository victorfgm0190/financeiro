import { useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import { baixasDoLancamento } from '../../lib/scheduleBaixa'
import { agendamentoDoMotor } from '../../lib/camposSerie'
import { fmtDate } from './utils'

// Pergunta da exclusão de um lançamento que baixou ocorrência(s) de agendamento: a ocorrência volta
// para pendente (padrão) ou fica baixada sem lançamento. Nada aparece se o lançamento não baixou
// nenhuma (ou só do motor da fatura, que tem regra própria). `manter` / `onChange(bool)`.
export default function EscolhaBaixaExclusao({ tx, manter, onChange }) {
  const { schedules } = useApp()
  const baixas = useMemo(
    () => (tx ? baixasDoLancamento(schedules, tx, { ignorar: s => agendamentoDoMotor(s) && !s.agendamentoVinculadoId }) : []),
    [schedules, tx],
  )
  if (!baixas.length) return null
  const alvo = baixas.length === 1
    ? <>a ocorrência de <span className="text-texto-1">{fmtDate(baixas[0].data)}</span> do agendamento <span className="text-texto-1">{baixas[0].schedule.description}</span></>
    : <>{baixas.length} ocorrências de agendamento ({baixas.map(b => `${b.schedule.description} ${fmtDate(b.data)}`).join('; ')})</>
  const opcao = (valor, titulo, detalhe) => (
    <label className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer text-xs ${manter === valor ? 'border-primary bg-primary/10' : 'border-borda-forte'}`}>
      <input type="radio" name="baixa-exclusao" className="mt-0.5 accent-primary" checked={manter === valor} onChange={() => onChange(valor)} />
      <span>
        <span className="block text-texto-1">{titulo}</span>
        <span className="block text-texto-3 mt-0.5">{detalhe}</span>
      </span>
    </label>
  )
  return (
    <div className="space-y-2" data-testid="escolha-baixa-exclusao">
      <p className="text-xs text-texto-2">Este lançamento pagou {alvo}. O que fazer com ela?</p>
      {opcao(false, 'Voltar para pendente', 'A ocorrência volta a aparecer como a pagar.')}
      {opcao(true, 'Manter baixada sem lançamento', 'Continua marcada como paga, sem registro de dinheiro (aparece na revisão de baixas sem lançamento).')}
    </div>
  )
}
