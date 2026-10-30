import { CalendarCheck, ChevronRight, Trash2 } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'
import { rotuloParcela } from '../../lib/numeroParcela'

// Prévia do Assistente: o lançamento bate com agendamento(s) PENDENTE(S)
// (lib/assistente/agendamentoDoLancamento). 1 → "Dar baixa nele?"; vários → lista para escolher.
// "É outro" segue para criar o lançamento como sempre.
export default function AgendamentoQueBate({ candidatos, textoOriginal, onBaixa, onOutro, onDescartar }) {
  const { schedules, accounts } = useApp()
  const porId = new Map((schedules || []).map(s => [s.id, s]))
  const nomeConta = (id) => { const a = accounts.find(x => x.id === id); return a ? (a.apelido || a.name) : null }
  const linha = (c) => {
    const s = porId.get(c.schedule_id)
    const parcela = s ? rotuloParcela(s, c.ocorrencia) : null
    return {
      titulo: `${c.descricao || c.favorecido || 'Agendamento'}${parcela ? ` · ${parcela}` : ''}`,
      detalhe: `${c.atrasado ? 'venceu' : 'vence'} ${fmtDate(c.data)} · ${fmt(c.valor)}${nomeConta(c.conta_id) ? ` · ${nomeConta(c.conta_id)}` : ''}`,
    }
  }
  const um = candidatos.length === 1 ? linha(candidatos[0]) : null

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-texto-1">
        <CalendarCheck size={14} className="mt-0.5 shrink-0 text-primary-fg" />
        <div className="flex-1 min-w-0 break-words">
          {um ? (
            <p className="text-sm">Encontrei o agendamento <strong>{um.titulo}</strong> ({um.detalhe}). Dar baixa nele com este lançamento?</p>
          ) : (
            <p className="text-sm">Encontrei {candidatos.length} agendamentos pendentes que batem com este lançamento. Em qual dar baixa?</p>
          )}
          {textoOriginal && <p className="mt-1 whitespace-pre-wrap text-texto-3">“{textoOriginal}”</p>}
        </div>
        <button type="button" onClick={onDescartar} className="inline-flex shrink-0 items-center gap-1 rounded px-2 min-h-[32px] text-texto-2 hover:text-perigo" title="Descartar a sugestão (não guarda nada)">
          <Trash2 size={13} /> Descartar
        </button>
      </div>
      {!um && (
        <ul className="divide-y divide-borda rounded-lg border border-borda">
          {candidatos.map(c => {
            const l = linha(c)
            return (
              <li key={`${c.schedule_id}@${c.ocorrencia}`}>
                <button type="button" onClick={() => onBaixa(c)} className="w-full flex items-center gap-2 px-3 py-2 min-h-[52px] text-left">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-texto-1 break-words">{l.titulo}</p>
                    <p className={`text-[11px] break-words ${c.atrasado ? 'text-aviso' : 'text-texto-3'}`}>{l.detalhe}</p>
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-texto-3" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        {um && <button type="button" className="btn-primary flex-1 min-h-[44px]" onClick={() => onBaixa(candidatos[0])}>Dar baixa</button>}
        <button type="button" className="btn-secondary flex-1 min-h-[44px]" onClick={onOutro}>É outro, criar lançamento</button>
      </div>
    </div>
  )
}
