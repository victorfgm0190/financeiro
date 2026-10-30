import { useEffect, useMemo, useState } from 'react'
import { Sparkles, Trash2 } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import TransactionForm from '../Transactions/TransactionForm'
import AvisoParecidos from '../Transactions/AvisoParecidos'
import EscolherConta from './EscolherConta'
import EscolherCartaoParcelado from './EscolherCartaoParcelado'
import { parecidosNaCriacao } from '../../lib/casamentoFatura'
import { finaisDoCartao } from '../../lib/cartaoFinais'
import ScheduleForm from '../Schedule/ScheduleForm'
import {
  initialDaSugestao, camposParaConferir, apelidosAprendidos, ROTULO_CAMPO, tipoPreLancamento,
  cartoesParaParcelado, agendamentoParceladoDaSugestao,
} from '../../lib/assistente'
import { papelDaContaApp } from '../../lib/assistente/contas'
import { concluirPreLancamento, aprenderApelidos, listarPreLancamentos } from '../../lib/assistenteApi'
import { usePreLancamentoAoFechar } from './usePreLancamentoAoFechar'
import { agendamentosDoLancamento, criterioDoLancamento } from '../../lib/assistente/agendamentoDoLancamento'
import AgendamentoQueBate from './AgendamentoQueBate'
import PreviaBaixa from './PreviaBaixa'

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
//   Agendamento pendente que bate (lib/assistente/agendamentoDoLancamento: valor, nome, ±7 dias,
//     conta) → antes do formulário: "Dar baixa" abre a PreviaBaixa (fluxo normal do Pagar, com a
//     conta, a data e o valor do lançamento); "É outro" segue para criar o lançamento.
export default function PreviaAssistente({ ferramenta, sugestao, textoOriginal, preId = null, onClose, onToast }) {
  const { transactions, accounts, activeProfileId, updateAccount, pode, schedules, getNextOccurrences } = useApp()
  // Compra parcelada sem conta citada: "Em qual cartão?" antes do formulário. "Não foi no cartão" →
  // pergunta a conta e abre a prévia de AGENDAMENTO parcelado (N × valor/N, centavos na última).
  const [semCartao, setSemCartao] = useState(false)
  const perguntaCartao = !!sugestao.pergunta_cartao
  const agendamento = ferramenta === 'criar_agendamento' || semCartao
  const destaques = camposParaConferir(ferramenta, sugestao)
  // Sem conta na sugestão → "Em qual conta?" (EscolherConta) antes do formulário.
  const [contaEscolhida, setContaEscolhida] = useState(null)
  const initial = semCartao && contaEscolhida
    ? agendamentoParceladoDaSugestao(sugestao, contaEscolhida)
    : { ...initialDaSugestao(ferramenta, sugestao), ...(contaEscolhida ? { accountId: contaEscolhida } : {}) }
  const cartoes = perguntaCartao ? cartoesParaParcelado(accounts, activeProfileId, transactions) : []
  // "Não foi no cartão": só as contas sugeríveis que não são cartão.
  const contasSemCartao = semCartao
    ? accounts.filter(a => a.type !== 'credit' && papelDaContaApp(a, activeProfileId) === 'sugerivel').map(a => a.id)
    : null
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
  }, [agendamento, sugestao, contaEscolhida, transactions, accounts, pres, preId])

  // Agendamento pendente que este lançamento paga (compra parcelada não entra: vira N parcelas).
  const [agendDispensado, setAgendDispensado] = useState(false)
  const [baixa, setBaixa] = useState(null)
  const lancAgend = { ...initial, amount: Number(initial.amount) }
  const agendamentosQueBatem = useMemo(() => {
    if (agendamento || perguntaCartao || Number(initial.installments) > 1) return []
    return agendamentosDoLancamento(lancAgend, { schedules, accounts, transactions, getNextOccurrences })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agendamento, perguntaCartao, sugestao, contaEscolhida, schedules, accounts, transactions, getNextOccurrences])
  const darBaixa = (candidato) => { marcar('baixa'); setBaixa(candidato) }

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

  // "final 4541" sem cartão cadastrado e o usuário escolheu um cartão → oferece salvar o final nele.
  const cartaoEscolhido = contaEscolhida ? accounts.find(a => a.id === contaEscolhida && a.type === 'credit') : null
  const finalNovo = sugestao.final_sem_cartao && cartaoEscolhido && !finaisDoCartao(cartaoEscolhido).includes(sugestao.final_sem_cartao)
    && pode('contas', 'editar') ? sugestao.final_sem_cartao : null
  const salvarFinal = () => {
    updateAccount(cartaoEscolhido.id, { cartaoFinais: [...finaisDoCartao(cartaoEscolhido), finalNovo] })
    onToast?.(`Final ${finalNovo} salvo no cartão ${cartaoEscolhido.apelido || cartaoEscolhido.name}.`)
  }

  if (existente) return <TransactionForm initial={existente} onClose={onClose} onToast={onToast} />
  if (baixa) {
    return <PreviaBaixa criterio={criterioDoLancamento(lancAgend)} candidato={baixa} textoOriginal={textoOriginal} preId={preId} onClose={onClose} onToast={onToast} />
  }
  if (!agendDispensado && agendamentosQueBatem.length > 0) {
    return (
      <AgendamentoQueBate candidatos={agendamentosQueBatem} textoOriginal={textoOriginal}
        onBaixa={darBaixa} onOutro={() => setAgendDispensado(true)} onDescartar={descartar} />
    )
  }

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
          {sugestao.aviso_parcelas && <p className="mt-0.5 text-aviso">Parcelado: {sugestao.aviso_parcelas} (valor total).</p>}
          {sugestao.linha_digitavel && (
            <p className="mt-0.5 text-aviso break-all">
              Confira a linha digitável com o boleto: <span className="font-mono">{sugestao.linha_digitavel}</span>{' '}
              <button type="button" className="underline text-primary-fg" onClick={() => navigator.clipboard?.writeText(sugestao.linha_digitavel)}>copiar</button>
            </p>
          )}
          {textoOriginal && <p className="mt-0.5 whitespace-pre-wrap break-words text-texto-3">“{textoOriginal}”</p>}
        </div>
        <button type="button" onClick={descartar} className="inline-flex shrink-0 items-center gap-1 rounded px-2 min-h-[32px] text-texto-2 hover:text-perigo" title="Descartar a sugestão (não guarda nada)">
          <Trash2 size={13} /> Descartar
        </button>
      </div>
      {finalNovo && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-borda-forte bg-surface-2 px-3 py-2 text-xs text-texto-2">
          <span className="flex-1 min-w-0">O final {finalNovo} não está cadastrado em {cartaoEscolhido.apelido || cartaoEscolhido.name}.</span>
          <button type="button" className="btn-secondary text-xs min-h-[36px]" onClick={salvarFinal}>
            Salvar {finalNovo} como final deste cartão
          </button>
        </div>
      )}
      {perguntaCartao && !contaEscolhida && !semCartao
        ? <EscolherCartaoParcelado valor={sugestao.valor} parcelas={sugestao.parcelas} cartoes={cartoes}
            onCartao={setContaEscolhida} onSemCartao={() => setSemCartao(true)} />
        : !initial.accountId
        ? <EscolherConta accounts={accounts} activeProfileId={activeProfileId} onEscolher={setContaEscolhida}
            opcoes={semCartao ? contasSemCartao : (sugestao.contas_opcoes || null)} finalSemCartao={sugestao.final_sem_cartao || null}
            titulo={semCartao ? `Em qual conta? Vira um agendamento de ${sugestao.parcelas} parcelas mensais.` : null} />
        : agendamento
        ? <ScheduleForm initial={initial} destaques={destaques} onSalvo={onSalvo} onClose={onClose} onAviso={onToast} />
        : <TransactionForm initial={initial} destaques={destaques} onSalvo={onSalvo} onClose={onClose} onToast={onToast}
            preLancamentos={pres || []} parecidosAceitos={[...(aceitos || []), ...(preId ? [preId] : [])]} onMesmo={ehOMesmo} />}
    </div>
  )
}
