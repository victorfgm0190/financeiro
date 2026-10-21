import { useEffect, useState } from 'react'
import Modal from '../shared/Modal'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'
import { rotuloContrato } from '../../lib/contratos/parcelas'
import ComposicaoBoletoModal from './ComposicaoBoletoModal'

// Perguntas do gancho de efetivação (P5), de QUALQUER tela que pagou a parcela (Agendamentos, Fluxo,
// celular, baixa em lote…): montado uma vez nos overlays do App. Uma pendência por vez.
//   composicao → "Composição do boleto" do condomínio (Pular = estimativa a revisar);
//   reajuste   → parcela projetada paga vale como confirmação: "Aplicar às próximas do ciclo?".
export default function ContratoEfetivacaoHost() {
  const {
    contratosHabilitado, pendenciasContrato, resolverPendenciaContrato, contratoPorId, schedules, transactions,
    confirmarComposicaoContrato, estimarComposicaoContrato, confirmarReajusteContrato, registrarEventoContrato,
  } = useApp()
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const p = contratosHabilitado ? pendenciasContrato?.[0] : null
  const contrato = p ? contratoPorId(p.contratoId) : null
  const parcela = p ? schedules.find(s => s.id === p.parcelaId) : null
  const tx = p ? transactions.find(t => t.id === p.txId) : null
  // Pendência que perdeu o objeto (lançamento estornado, contrato excluído) sai da fila.
  const orfa = !!p && (!contrato || !parcela || !tx)
  useEffect(() => { if (orfa) resolverPendenciaContrato(p.chave) }, [orfa, p, resolverPendenciaContrato])
  if (!p || orfa) return null
  const fechar = () => { setErro(''); setSalvando(false); resolverPendenciaContrato(p.chave) }

  if (p.tipo === 'composicao') {
    return (
      <ComposicaoBoletoModal
        key={p.chave} contrato={contrato} tx={tx} modo="pagamento"
        onConfirmar={async ({ itens, lembrar }) => { await confirmarComposicaoContrato({ contrato, parcela, tx, itens, lembrar }); fechar() }}
        onPular={async () => { await estimarComposicaoContrato({ contrato, parcela, tx }); fechar() }}
        onClose={async () => { await estimarComposicaoContrato({ contrato, parcela, tx }); fechar() }}
      />
    )
  }

  const responder = async (aplicar) => {
    setSalvando(true)
    try {
      if (aplicar) await confirmarReajusteContrato(contrato, parcela.id, p.base, { escopo: 'ciclo' })
      else {
        await registrarEventoContrato(contrato.id, {
          tipo: 'confirmacao_valor', valor_anterior: p.baseProjetada, valor_novo: p.base,
          detalhes: { parcela_id: parcela.id, ciclo: p.ciclo, escopo: 'so_esta', lancamento_id: tx.id },
        })
      }
      fechar()
    } catch (err) {
      setErro(err?.message || 'Falha ao confirmar.')
      setSalvando(false)
    }
  }
  return (
    <Modal open onClose={fechar} title="Reajuste confirmado pelo pagamento" size="sm">
      <div className="space-y-3 text-sm">
        <p className="text-texto-2">
          A parcela de {fmtDate(parcela.startDate)} de <strong className="text-texto-1">{rotuloContrato(contrato)}</strong> estava
          <em> projetada</em> ({fmt(p.baseProjetada)}) e foi paga com {fmt(tx.amount)}: aluguel contratual de
          <strong className="text-texto-1"> {fmt(p.base)}</strong>.
        </p>
        <p className="text-texto-1 font-medium">Aplicar às próximas parcelas do ciclo?</p>
        {erro && <p className="text-xs text-perigo">{erro}</p>}
        <div className="flex flex-col gap-2">
          <button className="btn-primary" disabled={salvando} onClick={() => responder(true)}>Sim — as seguintes do ciclo passam a {fmt(p.base)}</button>
          <button className="btn-secondary" disabled={salvando} onClick={() => responder(false)}>Não — só esta parcela</button>
        </div>
      </div>
    </Modal>
  )
}
