import { useEffect, useMemo, useState } from 'react'
import { Loader2, ExternalLink } from 'lucide-react'
import Modal from '../shared/Modal'
import { fmt } from '../shared/utils'
import { fmtData } from './bemUtils'
import { getFinanciamento } from '../../lib/bemApi'
import { resumoFinanciamento } from '../../lib/financiamento'

function Linha({ rotulo, valor, destaque = false, cor = 'text-texto-1' }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-texto-3 text-sm">{rotulo}</span>
      <span className={`${destaque ? 'text-lg font-bold' : 'text-sm font-medium'} ${cor} text-right`}>{valor}</span>
    </div>
  )
}

// Card "Dívidas e Passivos" › conta de dívida de financiamento: consulta (somente leitura).
// Saldo devedor do PRINCIPAL, total a pagar até o fim (com juros previstos das abertas), o que já
// foi pago e a próxima parcela — tudo de resumoFinanciamento (src/lib/financiamento.js), a mesma
// conta que a conta de dívida guarda em balance.
export default function ConsultaFinanciamentoModal({ conta, onClose, onAbrirParcela }) {
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    getFinanciamento(conta.id)
      .then(r => { if (vivo) setDados(r.financiamento || r) })
      .catch(e => { if (vivo) setErro(e.message) })
    return () => { vivo = false }
  }, [conta.id])

  const resumo = useMemo(() => (dados?.parcelas ? resumoFinanciamento(dados.parcelas) : null), [dados])

  return (
    <Modal open onClose={onClose} title={dados?.bem_nome ? `Financiamento — ${dados.bem_nome}` : conta.name}>
      {erro && <p className="text-sm text-perigo bg-perigo-bg border border-perigo/30 rounded-lg px-3 py-2">{erro}</p>}
      {!erro && !resumo && (
        <p className="flex items-center gap-2 text-sm text-texto-3"><Loader2 size={14} className="animate-spin" /> Carregando…</p>
      )}
      {resumo && (
        <div className="space-y-4">
          <div className="rounded-lg border border-despesa/20 bg-surface-2/40 px-3 py-2">
            <Linha rotulo="Saldo devedor (principal)" valor={fmt(resumo.saldoPrincipal)} destaque cor="text-despesa" />
            <Linha rotulo="Total a pagar até o fim (com juros previstos)" valor={fmt(resumo.totalAPagar)} />
          </div>

          <div>
            <p className="text-xs font-semibold text-texto-2 uppercase tracking-wide mb-1">Já pago</p>
            <div className="rounded-lg border border-borda bg-surface-2/40 px-3 py-2 divide-y divide-borda/60">
              <Linha rotulo="Parcelas quitadas" valor={`${resumo.quitadas} de ${resumo.total}`} />
              <Linha rotulo="Valor pago" valor={fmt(resumo.valorPago)} />
              <Linha rotulo="Principal amortizado" valor={fmt(resumo.principalAmortizado)} />
              <Linha rotulo="Juros pagos" valor={fmt(resumo.jurosPagos)} />
              <Linha rotulo="Desconto por antecipação" valor={fmt(resumo.desconto)} cor={resumo.desconto > 0 ? 'text-receita' : 'text-texto-1'} />
            </div>
          </div>

          {resumo.proxima ? (
            <div>
              <p className="text-xs font-semibold text-texto-2 uppercase tracking-wide mb-1">Próxima parcela</p>
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-borda bg-surface-2/40 px-3 py-2">
                <div className="flex-1 min-w-0 text-sm text-texto-1">
                  Parcela {resumo.proxima.numero}/{resumo.total} · vence {fmtData(resumo.proxima.data_vencimento)}
                  <span className="block text-texto-2">
                    {fmt(Math.max(0, (resumo.proxima.total_provisioned || 0) - (resumo.proxima.total_pago || 0)))}
                  </span>
                </div>
                {onAbrirParcela && dados?.bem_id && (
                  <button type="button" className="btn-secondary inline-flex items-center gap-1.5 min-h-[40px]"
                    onClick={() => onAbrirParcela(dados.bem_id, resumo.proxima.numero)}>
                    <ExternalLink size={14} /> Abrir a parcela
                  </button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-primary-fg">Financiamento quitado.</p>
          )}
        </div>
      )}
    </Modal>
  )
}
