import { Receipt, CalendarPlus, CalendarClock } from 'lucide-react'
import { ACAO } from '../../lib/assistente/prontidao'

const ROTULO_REC = { monthly: 'Mensal', annual: 'Anual', installment: 'Parcelado', weekly: 'Semanal', biweekly: 'Quinzenal' }

// Pergunta padrão depois de identificar uma despesa (lib/assistente/prontidao): Só despesa |
// Despesa + agendamento (| Só agendamento, quando é conta ainda a pagar). A opção mais provável vem
// destacada, com o motivo numa linha discreta. Nada é escolhido sozinho.
export default function EscolhaAcaoDespesa({ prontidao, acao, onEscolher }) {
  const sugerida = prontidao?.acaoSugerida || null
  const opcoes = [
    { id: ACAO.SO_DESPESA, rotulo: 'Só despesa', Icone: Receipt },
    { id: ACAO.DESPESA_AGENDAMENTO, rotulo: 'Despesa + agendamento', Icone: CalendarPlus },
    ...(sugerida === ACAO.SO_AGENDAMENTO ? [{ id: ACAO.SO_AGENDAMENTO, rotulo: 'Só agendamento', Icone: CalendarClock }] : []),
  ]
  const rec = prontidao?.recorrenciaSugerida
  return (
    <div className="rounded-lg border border-borda-forte bg-surface-2 px-3 py-2.5 space-y-2" role="group" aria-label="O que fazer com esta despesa">
      {prontidao?.pergunta && <p className="text-xs text-texto-1">{prontidao.pergunta}</p>}
      <div className="flex flex-wrap gap-2">
        {opcoes.map(({ id, rotulo, Icone }) => {
          const escolhida = acao === id
          const destaque = !acao && sugerida === id
          return (
            <button key={id} type="button" aria-pressed={escolhida} onClick={() => onEscolher(id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 min-h-[40px] text-sm font-medium transition-colors ${
                escolhida ? 'bg-primary text-white'
                  : destaque ? 'bg-primary/15 text-primary-fg ring-2 ring-primary'
                    : 'bg-surface text-texto-2 border border-borda hover:text-texto-1'}`}>
              <Icone size={14} /> {rotulo}
              {destaque && <span className="text-[10px] font-normal opacity-80">(sugerido)</span>}
            </button>
          )
        })}
      </div>
      {(prontidao?.motivo || rec) && (
        <p className="text-[11px] text-texto-3">
          {prontidao?.motivo}{rec ? `${prontidao?.motivo ? ' · ' : ''}recorrência sugerida: ${ROTULO_REC[rec] || rec}` : ''}
        </p>
      )}
    </div>
  )
}
