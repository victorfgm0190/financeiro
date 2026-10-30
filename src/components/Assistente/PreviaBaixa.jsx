import { Sparkles, Trash2 } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { PayModal } from '../Schedule/SchedulePanel'
import { fmt, fmtDate } from '../shared/utils'
import { rotuloParcela } from '../../lib/numeroParcela'
import { valorDaBaixa, payloadDaBaixa } from '../../lib/assistente'
import { concluirPreLancamento } from '../../lib/assistenteApi'
import { usePreLancamentoAoFechar } from './usePreLancamentoAoFechar'

// PRÉVIA DA BAIXA (etapa 1.1): o MESMO modal "Registrar Agendamento" do botão Pagar da tela de
// Agendamentos (PayModal — grava registered/data_ocorrencia e avança a série), pré-preenchido com o
// valor efetivo (o realmente pago/recebido), a data e a conta citados — todos editáveis.
// Fechar sem confirmar → pré-lançamento tipo 'baixa'; Descartar → nada.
// Compra em dólar (prévia do Assistente): `extrasLancamento` vai no lançamento da baixa (estimado, moeda…)
// e `onBaixaSalva(pago)` cria o IOF ligado a ele.
export default function PreviaBaixa({ criterio, candidato, textoOriginal, preId = null, onClose, onToast, extrasLancamento = null, onBaixaSalva = null, guardarAoFechar = true, onConcluido = null }) {
  const { schedules, accounts, categories, gerencialGroups, addTransaction, markScheduleRegistered, getNextOccurrences } = useApp()
  // Só a PRÓXIMA pendente (o que o Pagar baixaria): já baixada/pulada depois → não abre o modal.
  const achado = (schedules || []).find(s => s.id === candidato.schedule_id) || null
  const schedule = achado && getNextOccurrences(achado, 1)[0] === candidato.ocorrencia ? achado : null
  const { marcar } = usePreLancamentoAoFechar({
    tipo: 'baixa', payload: payloadDaBaixa(criterio, candidato), textoOriginal, preId, onToast, ativo: guardarAoFechar,
  })

  const descartar = () => {
    marcar('descartado')
    onConcluido?.('descartado')
    if (preId) concluirPreLancamento(preId, 'descartado').catch(err => onToast?.(`Não consegui descartar: ${err.message}`))
    onClose()
  }
  const onSalvo = (pago) => {
    marcar('salvo')
    onConcluido?.('salvo')
    if (pago?.id) onBaixaSalva?.(pago)
    if (preId) concluirPreLancamento(preId, 'efetivado').catch(err => onToast?.(`Baixa salva, mas o pré-lançamento não foi baixado: ${err.message}`))
  }

  if (!schedule) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-overlay" onClick={descartar} />
        <div className="relative bg-surface border border-borda-forte rounded-xl shadow-2xl w-full max-w-md p-5 space-y-3">
          <p className="text-sm text-texto-1 whitespace-pre-wrap break-words">Esse agendamento não está mais pendente (foi baixado, alterado ou excluído).</p>
          <button type="button" className="btn-secondary w-full" onClick={descartar}>Fechar</button>
        </div>
      </div>
    )
  }

  const valor = valorDaBaixa(criterio, candidato)
  const parcela = rotuloParcela(schedule, candidato.ocorrencia)
  const diferente = valor && Math.abs(valor - candidato.valor) >= 0.01
  const aviso = (
    <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-texto-1">
      <Sparkles size={14} className="mt-0.5 shrink-0 text-primary-fg" />
      <div className="flex-1 min-w-0 break-words">
        <p className="font-medium">Prévia do assistente — baixa. Nada foi salvo ainda.</p>
        <p className="mt-0.5 text-texto-2">
          {schedule.description}{parcela ? ` · parcela ${parcela}` : ''} · vence {fmtDate(candidato.data)} · previsto {fmt(candidato.valor)}
        </p>
        {diferente && <p className="mt-0.5 text-aviso">Baixa pelo valor informado: {fmt(valor)}. Confira antes de confirmar.</p>}
        {textoOriginal && <p className="mt-0.5 whitespace-pre-wrap text-texto-3">“{textoOriginal}”</p>}
      </div>
      <button type="button" onClick={descartar} className="inline-flex shrink-0 items-center gap-1 rounded px-2 min-h-[32px] text-texto-2 hover:text-perigo" title="Descartar a sugestão (não guarda nada)">
        <Trash2 size={13} /> Descartar
      </button>
    </div>
  )

  return (
    <PayModal
      schedule={schedule}
      nextDate={candidato.ocorrencia}
      accounts={accounts}
      categories={categories}
      gerencialGroups={gerencialGroups}
      addTransaction={addTransaction}
      markScheduleRegistered={markScheduleRegistered}
      inicial={{ amount: valor, date: criterio.data_pagamento, accountId: criterio.conta_id }}
      aviso={aviso}
      extrasLancamento={extrasLancamento}
      onSalvo={onSalvo}
      onClose={onClose}
    />
  )
}
