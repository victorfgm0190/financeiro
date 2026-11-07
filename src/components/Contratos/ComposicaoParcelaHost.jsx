import { useState } from 'react'
import Modal from '../shared/Modal'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'
import { ehParcelaGerada } from '../../lib/contratos/parcelas'
import { temComposicaoInformada } from '../../lib/contratos/composicaoAberta'
import ComposicaoBoletoModal from './ComposicaoBoletoModal'
import ComposicaoRepasseModal from './ComposicaoRepasseModal'
import { ehModoRepasse } from '../../lib/contratos/repasse'
import { competenciaDaParcela } from '../../lib/contratos/parcelas'

// "Composição do boleto" de UMA parcela de condomínio, pedida de qualquer lugar (ficha do contrato,
// Agendamentos no desktop e no celular, Assistente) por abrirComposicaoParcela(parcelaId, { txId,
// leitura }). Montado uma vez nos overlays do App: todas as entradas usam o MESMO modal e gravam no
// mesmo lugar (parcela aberta → informarComposicaoAberta; paga → informarComposicao /
// editarComposicaoLancamento).
export default function ComposicaoParcelaHost() {
  const {
    contratosHabilitado, pedidoComposicaoParcela: pedido, fecharComposicaoParcela, contratoPorId, schedules, transactions,
    creditosContratos, informarComposicaoAberta, removerComposicaoAberta, informarComposicao, editarComposicaoLancamento,
    informarReciboAluguel,
  } = useApp()
  const [conflito, setConflito] = useState(null)
  const [aviso, setAviso] = useState('')
  if (!contratosHabilitado || !pedido) return null
  const parcela = schedules.find(s => s.id === pedido.parcelaId)
  const contrato = parcela ? contratoPorId(parcela.contratoId) : null
  const tx = pedido.txId ? transactions.find(t => t.id === pedido.txId) : null
  const fechar = () => { setConflito(null); setAviso(''); fecharComposicaoParcela() }
  if (!parcela || !contrato || (pedido.txId && !tx)) {
    return (
      <Modal open onClose={fechar} title="Composição do boleto" size="sm">
        <p className="text-sm text-texto-2">Parcela ou pagamento não encontrado (talvez ainda carregando).</p>
      </Modal>
    )
  }

  // Contrato a receber por administradora: a composição é a do repasse da competência (a mesma da ficha).
  if (ehModoRepasse(contrato)) {
    return <ComposicaoRepasseModal key={pedido.parcelaId} contrato={contrato} competencia={competenciaDaParcela(parcela)} onClose={fechar} />
  }

  // Resposta { ok: false, conflito } → a tela pergunta; a decisão refaz a mesma gravação.
  const tratar = async (acao) => {
    const r = await acao(null)
    if (r?.ok === false && r.conflito) { setConflito({ ...r.conflito, refazer: acao }); return }
    fechar()
  }

  if (conflito) {
    const credito = (creditosContratos || []).find(c => c.id === conflito.id)
    const decidir = async (decisao) => {
      try {
        await conflito.refazer(decisao)
        fechar()
      } catch (err) { setAviso(err?.message || 'Falha ao gravar.') }
    }
    return (
      <Modal open onClose={fechar} title="Crédito já abatido" size="sm">
        <div className="space-y-3 text-sm">
          <p className="text-texto-2">
            O crédito deste boleto (<strong className="text-texto-1">{fmt(conflito.abatido)}</strong>) já foi abatido no aluguel pago
            {credito?.data_compensacao ? ` em ${fmtDate(credito.data_compensacao)}` : ''}. Com a composição nova ele seria de
            {' '}<strong className="text-texto-1">{fmt(conflito.novo)}</strong>. O aluguel pago não muda de valor.
          </p>
          {aviso && <p className="text-xs text-perigo">{aviso}</p>}
          <div className="flex flex-col gap-2">
            <button className="btn-primary" onClick={() => decidir('manter')}>Gravar e manter o crédito abatido como está</button>
            {conflito.novo > conflito.abatido && (
              <button className="btn-secondary" onClick={() => decidir('complementar')}>
                Gravar e criar crédito de {fmt(conflito.novo - conflito.abatido)} (a diferença) para o próximo aluguel
              </button>
            )}
            <button className="btn-secondary" onClick={fechar}>Cancelar (nada muda)</button>
          </div>
        </div>
      </Modal>
    )
  }

  // Parcela PRINCIPAL (aluguel): composição pelo recibo — pendente (o valor passa ao total do recibo)
  // ou paga (o lançamento não muda). Mesmo modal (papel 'aluguel').
  if ((parcela.contratoPapel || 'aluguel') === 'aluguel') {
    const ocorrencia = tx ? (Object.entries(parcela.registeredMeta || {}).find(([, m]) => m?.lancamento_id === tx.id)?.[0] || tx.dataOcorrencia || tx.date) : parcela.startDate
    const inicial = tx ? (tx.composicao?.informada ? tx.composicao : null) : (parcela.composicao?.informada ? parcela.composicao : null)
    return (
      <ComposicaoBoletoModal
        papel="aluguel" key={`${pedido.parcelaId}:${tx?.id || ''}`} contrato={contrato} parcela={parcela} tx={tx} ocorrencia={ocorrencia}
        composicaoInicial={inicial} leituraInicial={pedido.leitura || null}
        onConfirmar={async (dados) => {
          await informarReciboAluguel(contrato, { parcelaId: parcela.id, tx, ...dados })
          fechar()
        }}
        onClose={fechar} />
    )
  }

  if (tx) {
    const ocorrencia = Object.entries(parcela.registeredMeta || {}).find(([, m]) => m?.lancamento_id === tx.id)?.[0] || tx.dataOcorrencia || tx.date
    const linha = { tx, schedule: parcela, vinculada: !ehParcelaGerada(parcela, contrato.id), ocorrencia }
    const comItens = !!tx.composicao?.itens?.length
    return (
      <ComposicaoBoletoModal
        key={`${pedido.parcelaId}:${tx.id}`} contrato={contrato} tx={tx} modo={comItens ? 'edicao' : 'informar'}
        composicaoInicial={comItens ? tx.composicao : null} leituraInicial={pedido.leitura || null}
        onConfirmar={async ({ itens, lembrar, composicao }) => {
          if (comItens) {
            const r = await editarComposicaoLancamento(tx, composicao)
            if (!r.ok) throw new Error(r.aviso)
          } else {
            await informarComposicao(contrato, linha, { itens, lembrar })
          }
          fechar()
        }}
        onClose={fechar} />
    )
  }

  const informada = temComposicaoInformada(parcela)
  return (
    <ComposicaoBoletoModal
      key={pedido.parcelaId} contrato={contrato} parcela={parcela} modo="aberta"
      composicaoInicial={informada ? parcela.composicao : null} leituraInicial={pedido.leitura || null}
      onConfirmar={({ itens, lembrar }) => tratar(
        (decisao) => informarComposicaoAberta(contrato, parcela.id, { itens, lembrar, decisao }))}
      onRemover={informada ? () => tratar((decisao) => removerComposicaoAberta(contrato, parcela.id, { decisao })) : null}
      onClose={fechar} />
  )
}
