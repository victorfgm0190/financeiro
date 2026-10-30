import { useState } from 'react'
import { HelpCircle, Trash2 } from 'lucide-react'
import { fmt, fmtDate } from '../shared/utils'

// Prévia do Assistente: NÃO há casamento certo, mas há agendamento PARECIDO (nome parecido, mesma
// conta/cartão, ocorrência pendente perto — lib/assistente/agendamentoDoLancamento.agendamentosParecidos).
// Só pergunta: "Sim, dar baixa" → com valor diferente, escolhe se o valor vale só para esta ocorrência
// ou também para as próximas; "Não é" → segue para o lançamento comum. Nada é feito sozinho.
export default function AgendamentoParecido({ candidato, valor, textoOriginal, onBaixa, onNaoE, onDescartar }) {
  const [perguntaValor, setPerguntaValor] = useState(false)
  const nome = candidato.descricao || candidato.favorecido || 'Agendamento'
  const diferente = Number(valor) > 0 && Math.abs(Number(valor) - candidato.valor) >= 0.01
  const sim = () => (diferente ? setPerguntaValor(true) : onBaixa(candidato, { usarNasProximas: false }))

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-lg border border-aviso/40 bg-aviso/10 px-3 py-2 text-xs text-texto-1">
        <HelpCircle size={14} className="mt-0.5 shrink-0 text-aviso" />
        <div className="flex-1 min-w-0 break-words">
          <p className="text-sm">
            Parecido com o agendamento <strong>{nome}</strong> (previsto {fmt(candidato.valor)}, {candidato.atrasado ? 'venceu' : 'vence'} {fmtDate(candidato.data)}). É ele?
          </p>
          {textoOriginal && <p className="mt-1 whitespace-pre-wrap text-texto-3">“{textoOriginal}”</p>}
        </div>
        <button type="button" onClick={onDescartar} className="inline-flex shrink-0 items-center gap-1 rounded px-2 min-h-[32px] text-texto-2 hover:text-perigo" title="Descartar a sugestão (não guarda nada)">
          <Trash2 size={13} /> Descartar
        </button>
      </div>
      {perguntaValor ? (
        <div className="flex flex-col gap-2">
          <button type="button" className="btn-primary min-h-[44px]" onClick={() => onBaixa(candidato, { usarNasProximas: false })}>
            Baixar com {fmt(valor)} só esta ocorrência
          </button>
          <button type="button" className="btn-secondary min-h-[44px]" onClick={() => onBaixa(candidato, { usarNasProximas: true })}>
            Baixar e usar {fmt(valor)} nas próximas
          </button>
          <button type="button" className="text-xs text-texto-2 hover:text-texto-1 min-h-[36px]" onClick={onNaoE}>Não é ele, criar lançamento</button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary flex-1 min-h-[44px]" onClick={sim}>Sim, dar baixa</button>
          <button type="button" className="btn-secondary flex-1 min-h-[44px]" onClick={onNaoE}>Não é</button>
        </div>
      )}
    </div>
  )
}
