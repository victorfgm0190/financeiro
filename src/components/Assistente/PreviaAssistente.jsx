import { useEffect, useRef } from 'react'
import { Sparkles, Trash2 } from 'lucide-react'
import TransactionForm from '../Transactions/TransactionForm'
import ScheduleForm from '../Schedule/ScheduleForm'
import {
  initialDaSugestao, camposParaConferir, apelidosAprendidos, ROTULO_CAMPO, tipoPreLancamento,
} from '../../lib/assistente'
import { guardarPreLancamento, concluirPreLancamento, aprenderApelidos } from '../../lib/assistenteApi'

// PRÉVIA do Assistente IA: o formulário EXISTENTE (TransactionForm / ScheduleForm) pré-preenchido.
//   Confirmar (salvar no formulário) → gravação do próprio formulário (addTransaction/addSchedule do
//     AppContext) + apelidos aprendidos com o que o usuário corrigiu; pré-lançamento → 'efetivado'.
//   Fechar sem confirmar (Cancelar, X, fundo, Esc) → guarda em ia_pre_lancamentos ('pendente').
//     Se já veio de um pré-lançamento, ele continua pendente (não duplica).
//   Descartar → não guarda nada (pré-lançamento existente → 'descartado').
// O "fechar sem confirmar" roda no desmonte: cobre qualquer caminho de fechamento do modal/sheet.
export default function PreviaAssistente({ ferramenta, sugestao, textoOriginal, preId = null, onClose, onToast }) {
  const agendamento = ferramenta === 'criar_agendamento'
  const destaques = camposParaConferir(ferramenta, sugestao)
  const initial = initialDaSugestao(ferramenta, sugestao)

  const desfecho = useRef(null) // null = ainda aberta; 'salvo' | 'descartado'
  const timer = useRef(null)
  const dados = useRef({ ferramenta, sugestao, textoOriginal, preId, onToast })
  useEffect(() => { dados.current = { ferramenta, sugestao, textoOriginal, preId, onToast } })

  useEffect(() => {
    // Desmonte de verdade (o timer não é cancelado por um novo mount): fechou sem confirmar.
    clearTimeout(timer.current)
    return () => {
      timer.current = setTimeout(() => {
        const d = dados.current
        if (desfecho.current || d.preId) return
        guardarPreLancamento(tipoPreLancamento(d.ferramenta), { ...d.sugestao, ferramenta: d.ferramenta }, d.textoOriginal)
          .then(() => d.onToast?.('Guardado em pré-lançamentos para revisar depois.'))
          .catch(err => d.onToast?.(`Não consegui guardar o pré-lançamento: ${err.message}`))
      }, 0)
    }
  }, [])

  const onSalvo = (form, id) => {
    desfecho.current = 'salvo'
    const itens = apelidosAprendidos(sugestao, form)
    if (itens.length) aprenderApelidos(itens).catch(err => console.warn('[assistente] apelidos não salvos:', err.message))
    if (preId) concluirPreLancamento(preId, 'efetivado', id || null).catch(err => onToast?.(`Lançamento salvo, mas o pré-lançamento não foi baixado: ${err.message}`))
  }

  const descartar = () => {
    desfecho.current = 'descartado'
    if (preId) concluirPreLancamento(preId, 'descartado').catch(err => onToast?.(`Não consegui descartar: ${err.message}`))
    onClose()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-texto-1">
        <Sparkles size={14} className="mt-0.5 shrink-0 text-primary-fg" />
        <div className="flex-1 min-w-0">
          <p className="font-medium">Prévia do assistente — {agendamento ? 'agendamento' : 'lançamento'}. Nada foi salvo ainda.</p>
          {destaques.length > 0 && (
            <p className="mt-0.5 text-aviso">Confira: {destaques.map(c => ROTULO_CAMPO[c] || c).join(', ')}.</p>
          )}
          {textoOriginal && <p className="mt-0.5 truncate text-texto-3" title={textoOriginal}>“{textoOriginal}”</p>}
        </div>
        <button type="button" onClick={descartar} className="inline-flex shrink-0 items-center gap-1 rounded px-2 min-h-[32px] text-texto-2 hover:text-perigo" title="Descartar a sugestão (não guarda nada)">
          <Trash2 size={13} /> Descartar
        </button>
      </div>
      {agendamento
        ? <ScheduleForm initial={initial} destaques={destaques} onSalvo={onSalvo} onClose={onClose} onAviso={onToast} />
        : <TransactionForm initial={initial} destaques={destaques} onSalvo={onSalvo} onClose={onClose} onToast={onToast} />}
    </div>
  )
}
