import { useEffect, useMemo, useState } from 'react'
import { Sparkles, Trash2 } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import TransactionForm from '../Transactions/TransactionForm'
import AvisoParecidos from '../Transactions/AvisoParecidos'
import { parecidosNaCriacao } from '../../lib/casamentoFatura'
import ScheduleForm from '../Schedule/ScheduleForm'
import {
  initialDaSugestao, camposParaConferir, apelidosAprendidos, ROTULO_CAMPO, tipoPreLancamento,
} from '../../lib/assistente'
import { concluirPreLancamento, aprenderApelidos, listarPreLancamentos } from '../../lib/assistenteApi'
import { usePreLancamentoAoFechar } from './usePreLancamentoAoFechar'

// PRÉVIA do Assistente IA: o formulário EXISTENTE (TransactionForm / ScheduleForm) pré-preenchido.
//   Confirmar (salvar no formulário) → gravação do próprio formulário (addTransaction/addSchedule do
//     AppContext) + apelidos aprendidos com o que o usuário corrigiu; pré-lançamento → 'efetivado'.
//   Fechar sem confirmar (Cancelar, X, fundo, Esc) → guarda em ia_pre_lancamentos ('pendente').
//     Se já veio de um pré-lançamento, ele continua pendente (não duplica).
//   Descartar → não guarda nada (pré-lançamento existente → 'descartado').
//   Duplicidade (lançamento): já existe lançamento/pré-lançamento parecido (mesma conta, valor
//     ±R$ 0,01, data ±3 dias) → aviso no topo. "É o mesmo" não cria nada nem guarda pré-lançamento
//     (o que estava sendo efetivado sai da lista); "É outro" libera o salvar. O formulário repete
//     a checagem ao salvar (valores editados), ignorando o que já foi aceito aqui.
export default function PreviaAssistente({ ferramenta, sugestao, textoOriginal, preId = null, onClose, onToast }) {
  const { transactions, accounts } = useApp()
  const agendamento = ferramenta === 'criar_agendamento'
  const destaques = camposParaConferir(ferramenta, sugestao)
  const initial = initialDaSugestao(ferramenta, sugestao)
  const { marcar } = usePreLancamentoAoFechar({
    tipo: tipoPreLancamento(ferramenta), payload: { ...sugestao, ferramenta }, textoOriginal, preId, onToast,
  })

  const [pres, setPres] = useState(null)
  const [aceitos, setAceitos] = useState(null)
  const [existente, setExistente] = useState(null)
  useEffect(() => {
    if (agendamento) return
    let vivo = true
    listarPreLancamentos().then(l => { if (vivo) setPres(l) }).catch(() => { if (vivo) setPres([]) })
    return () => { vivo = false }
  }, [agendamento])
  const parecidos = useMemo(() => {
    if (agendamento) return []
    const conta = accounts.find(a => a.id === initial.accountId)
    return parecidosNaCriacao({ ...initial, amount: Number(initial.amount) }, {
      transactions, preLancamentos: pres || [], closingDay: conta?.closingDay || 14, ignorarIds: preId ? [preId] : [],
    })
  // initial é recriado a cada render a partir da sugestão (estável): depende dela.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agendamento, sugestao, transactions, accounts, pres, preId])

  // "É o mesmo": nada é criado; o pré-lançamento que estava sendo efetivado é baixado contra o
  // existente (ou descartado, se o parecido é outro pré-lançamento).
  const ehOMesmo = (tx) => {
    marcar('mesmo')
    if (preId) {
      const req = tx && !tx._pre ? concluirPreLancamento(preId, 'efetivado', tx.id) : concluirPreLancamento(preId, 'descartado')
      req.catch(err => onToast?.(`Não consegui baixar o pré-lançamento: ${err.message}`))
    }
  }

  const onSalvo = (form, id) => {
    marcar('salvo')
    const itens = apelidosAprendidos(sugestao, form)
    if (itens.length) aprenderApelidos(itens).catch(err => console.warn('[assistente] apelidos não salvos:', err.message))
    if (preId) concluirPreLancamento(preId, 'efetivado', id || null).catch(err => onToast?.(`Lançamento salvo, mas o pré-lançamento não foi baixado: ${err.message}`))
  }

  const descartar = () => {
    marcar('descartado')
    if (preId) concluirPreLancamento(preId, 'descartado').catch(err => onToast?.(`Não consegui descartar: ${err.message}`))
    onClose()
  }

  if (existente) return <TransactionForm initial={existente} onClose={onClose} onToast={onToast} />

  return (
    <div className="space-y-3">
      {!aceitos && parecidos.length > 0 && (
        <AvisoParecidos
          parecidos={parecidos}
          accounts={accounts}
          onMesmo={() => { ehOMesmo(parecidos[0]); onToast?.('Nada foi salvo: já estava lançado.'); onClose() }}
          onAbrir={(tx) => { ehOMesmo(tx); setExistente(tx) }}
          onOutro={() => setAceitos(parecidos.map(t => (t._pre ? t.preId : t.id)))}
        />
      )}
      <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-texto-1">
        <Sparkles size={14} className="mt-0.5 shrink-0 text-primary-fg" />
        <div className="flex-1 min-w-0">
          <p className="font-medium">Prévia do assistente — {agendamento ? 'agendamento' : 'lançamento'}. Nada foi salvo ainda.</p>
          {destaques.length > 0 && (
            <p className="mt-0.5 text-aviso">Confira: {destaques.map(c => ROTULO_CAMPO[c] || c).join(', ')}.</p>
          )}
          {textoOriginal && <p className="mt-0.5 whitespace-pre-wrap break-words text-texto-3">“{textoOriginal}”</p>}
        </div>
        <button type="button" onClick={descartar} className="inline-flex shrink-0 items-center gap-1 rounded px-2 min-h-[32px] text-texto-2 hover:text-perigo" title="Descartar a sugestão (não guarda nada)">
          <Trash2 size={13} /> Descartar
        </button>
      </div>
      {agendamento
        ? <ScheduleForm initial={initial} destaques={destaques} onSalvo={onSalvo} onClose={onClose} onAviso={onToast} />
        : <TransactionForm initial={initial} destaques={destaques} onSalvo={onSalvo} onClose={onClose} onToast={onToast}
            preLancamentos={pres || []} parecidosAceitos={[...(aceitos || []), ...(preId ? [preId] : [])]} onMesmo={ehOMesmo} />}
    </div>
  )
}
