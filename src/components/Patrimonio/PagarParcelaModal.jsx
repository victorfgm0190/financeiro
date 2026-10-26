import { useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { fmt } from '../shared/utils'
import DataPagamentoField from '../shared/DataPagamentoField'
import { dataPadraoPagamento } from '../../lib/dataPagamento'
import { pagarParcela } from '../../lib/bemApi'
import { fmtData, calcularRateio, round2 } from './bemUtils'
import InputMoeda from '../shared/InputMoeda'

export default function PagarParcelaModal({
  bem, financiamento, parcela, contasCorrentes, contaCentralId = '', avisoContaCentral = null, onCancel, onSuccess, onErro,
}) {
  // Pagamento parcial anterior já abateu parte da parcela — o padrão é quitar o que falta.
  const restante = round2(Math.max(0, (parcela.total_provisioned || 0) - (parcela.total_pago || 0)))
  const [valorPago, setValorPago] = useState(String(restante))
  const [dataPagamento, setDataPagamento] = useState(() => dataPadraoPagamento(parcela.data_vencimento))
  const [contaOrigemId, setContaOrigemId] = useState(
    financiamento?.conta_origem_id
      || contaCentralId
      || '',
  )
  const [loading, setLoading] = useState(false)

  // Preview local do mesmo rateio do backend, recalculado sobre o ACUMULADO da parcela —
  // é assim que o servidor decide principal/juros quando já houve pagamento parcial.
  const rateio = useMemo(() => {
    const valor = Number(valorPago)
    if (!(valor > 0)) return null
    const acumulado = round2((parcela.total_pago || 0) + valor)
    const r = calcularRateio(acumulado, parcela.principal_provisioned, parcela.juros_provisioned)
    return {
      ...r,
      principalNeste: round2(r.principalPago - (parcela.principal_pago || 0)),
      jurosNeste: round2(r.jurosPago - (parcela.juros_pago || 0)),
      totalAcumulado: acumulado,
    }
  }, [valorPago, parcela])

  const podeEnviar = rateio && dataPagamento && !loading

  const enviar = async (e) => {
    e.preventDefault()
    if (!podeEnviar) return
    setLoading(true)
    try {
      const resposta = await pagarParcela(parcela.id, {
        valor_pago: Number(valorPago),
        data_pagamento: dataPagamento,
        conta_origem_id: contaOrigemId || null,
      })
      onSuccess(resposta)
    } catch (err) {
      onErro(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <div className="p-3 bg-surface-2/60 rounded-lg text-xs space-y-1">
        <div className="flex justify-between"><span className="text-texto-3">Bem</span><span className="text-texto-1">{bem.nome}</span></div>
        <div className="flex justify-between"><span className="text-texto-3">Parcela</span><span className="text-texto-1">{parcela.numero}/{financiamento?.num_parcelas}</span></div>
        <div className="flex justify-between"><span className="text-texto-3">Vence</span><span className="text-texto-1">{fmtData(parcela.data_vencimento)}</span></div>
      </div>

      <div className="p-3 bg-surface-2/60 rounded-lg text-xs space-y-1">
        <p className="text-texto-2 font-medium mb-1.5">Provisionado</p>
        <div className="flex justify-between"><span className="text-texto-3">Principal</span><span className="text-texto-1">{fmt(parcela.principal_provisioned)}</span></div>
        <div className="flex justify-between"><span className="text-texto-3">Juros</span><span className="text-texto-1">{fmt(parcela.juros_provisioned)}</span></div>
        <div className="flex justify-between"><span className="text-texto-3">Total</span><span className="text-texto-1 font-medium">{fmt(parcela.total_provisioned)}</span></div>
        {parcela.total_pago > 0 && (
          <div className="flex justify-between pt-1 border-t border-borda-forte/60 mt-1">
            <span className="text-texto-3">Já pago</span>
            <span className="text-texto-2">{fmt(parcela.total_pago)}</span>
          </div>
        )}
      </div>

      <div>
        <label className="label">Quanto você vai pagar? (R$) *</label>
        <InputMoeda
          min="0.01" required autoFocus
          value={valorPago}
          onChange={e => setValorPago(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Data do Pagamento *</label>
          <DataPagamentoField required value={dataPagamento} onChange={e => setDataPagamento(e.target.value)} vencimento={parcela.data_vencimento} />
        </div>
        <div>
          <label className="label">Conta de Origem</label>
          <select className="input" value={contaOrigemId} onChange={e => setContaOrigemId(e.target.value)} required>
            <option value="">{contasCorrentes.length === 0 ? 'Nenhuma conta corrente' : 'Selecione a conta...'}</option>
            {contasCorrentes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {avisoContaCentral && !contaOrigemId && <p className="text-xs text-aviso mt-1">{avisoContaCentral}</p>}
        </div>
      </div>

      {rateio && (
        <div className="p-3 bg-surface-2/60 rounded-lg text-xs space-y-1 border border-borda">
          <p className="text-texto-2 font-medium mb-1.5">Rateio (principal primeiro)</p>
          <div className="flex justify-between"><span className="text-texto-3">Principal neste pagamento</span><span className="text-texto-1">{fmt(rateio.principalNeste)}</span></div>
          <div className="flex justify-between"><span className="text-texto-3">Juros neste pagamento</span><span className="text-texto-1">{fmt(rateio.jurosNeste)}</span></div>
          <div className="flex justify-between"><span className="text-texto-3">Juros em falta</span><span className={rateio.desvioJuros > 0 ? 'text-aviso' : 'text-texto-1'}>{fmt(rateio.desvioJuros)}</span></div>
          <div className="flex justify-between pt-1 border-t border-borda-forte/60 mt-1">
            <span className="text-texto-3">Total pago na parcela</span>
            <span className="text-texto-1 font-medium">{fmt(rateio.totalAcumulado)}</span>
          </div>
          <p className="text-texto-3 pt-1">
            Serão criados até 2 lançamentos: prestação (principal) e taxa de financiamento (juros).
          </p>
        </div>
      )}

      <div className="flex gap-3 pt-1">
        <button type="button" className="btn-secondary flex-1" onClick={onCancel} disabled={loading}>Cancelar</button>
        <button type="submit" className="btn-primary flex-1 flex items-center justify-center gap-2" disabled={!podeEnviar}>
          {loading && <Loader2 size={14} className="animate-spin" />}
          Pagar {Number(valorPago) > 0 ? fmt(Number(valorPago)) : ''}
        </button>
      </div>
    </form>
  )
}
