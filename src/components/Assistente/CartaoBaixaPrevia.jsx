import { CalendarCheck, FileSignature } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'
import { rotuloParcela } from '../../lib/numeroParcela'
import { chaveCandidato } from '../../lib/assistente/agendamentoDoLancamento'

// Cartão da BAIXA SUGERIDA na prévia do Assistente (em vez da etapa antes do formulário): o lançamento
// paga um agendamento pendente. Marcado, "Confirmar tudo" cria o lançamento e o liga à ocorrência
// (vínculo — a ocorrência fica baixada por ele, sem segundo lançamento). Desmarcado = lançamento avulso.
//   candidatos: de agendamentosDoLancamento (fortes) ou agendamentosParecidos (fraco, vem desmarcado).
export default function CartaoBaixaPrevia({ candidatos, marcado, alvo, parecido = false, onMarcar, onEscolher, onAbrirCompleta }) {
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
  const um = candidatos.length === 1
  const l = linha(alvo)
  return (
    <section className={`rounded-xl border-2 ${marcado ? 'border-primary/50' : 'border-borda'} bg-surface p-3 space-y-2`} aria-label="Cartão da baixa">
      <label className="flex items-center gap-2.5 cursor-pointer min-h-[40px]">
        <input type="checkbox" className="accent-primary w-5 h-5" checked={marcado} onChange={e => onMarcar(e.target.checked)} />
        <CalendarCheck size={16} className="text-primary-fg" />
        <span className="text-sm font-semibold text-texto-1">Dar baixa no agendamento</span>
        {parecido && <span className="text-[11px] text-aviso">parecido — confira</span>}
      </label>
      {um ? (
        <p className="text-xs text-texto-2 break-words"><strong className="text-texto-1">{l.titulo}</strong> — <span className={alvo.atrasado ? 'text-aviso' : ''}>{l.detalhe}</span></p>
      ) : (
        <div className="space-y-1" role="radiogroup" aria-label="Qual agendamento">
          {candidatos.map(c => {
            const x = linha(c)
            return (
              <label key={chaveCandidato(c)} className="flex items-start gap-2 cursor-pointer min-h-[40px] text-xs">
                <input type="radio" className="accent-primary mt-1" name="baixa-alvo" checked={chaveCandidato(c) === chaveCandidato(alvo)} onChange={() => onEscolher(c)} />
                <span className="break-words"><strong className="text-texto-1">{x.titulo}</strong> — <span className={c.atrasado ? 'text-aviso' : 'text-texto-2'}>{x.detalhe}</span></span>
              </label>
            )
          })}
        </div>
      )}
      {marcado && (
        <p className="text-[11px] text-texto-3">
          O lançamento abaixo fica como o pagamento desta ocorrência.{' '}
          {onAbrirCompleta && <button type="button" className="underline text-primary-fg" onClick={() => onAbrirCompleta(alvo)}>Abrir a baixa completa</button>}
        </p>
      )}
    </section>
  )
}

// Cartão "Vincular ao contrato X": o nº lido no documento é o de um contrato cadastrado.
export function CartaoContratoPrevia({ contrato, marcado, onMarcar }) {
  return (
    <section className={`rounded-xl border-2 ${marcado ? 'border-primary/50' : 'border-borda'} bg-surface p-3`} aria-label="Cartão do contrato">
      <label className="flex items-center gap-2.5 cursor-pointer min-h-[40px]">
        <input type="checkbox" className="accent-primary w-5 h-5" checked={marcado} onChange={e => onMarcar(e.target.checked)} />
        <FileSignature size={16} className="text-primary-fg" />
        <span className="text-sm font-semibold text-texto-1">Vincular ao contrato {contrato.nome}</span>
        <span className="text-[11px] text-texto-3">nº {contrato.numero}</span>
      </label>
    </section>
  )
}
