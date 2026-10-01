import { useState } from 'react'
import { Loader2, CheckCircle } from 'lucide-react'
import { aceitarSaldoPendencia } from '../../lib/db'
import Modal from '../shared/Modal'
import { fmt } from '../shared/utils'

// "Aceitar saldo atual como correto" (GER_SALDO_SUBCONTA). Grava um marco de saldo da subconta e
// resolve a pendência (resolvida_por = 'marco'). NÃO cria lançamento e NÃO altera saldo: a diferença
// passa a ser a aceita, e só uma diferença NOVA volta a gerar pendência.
export default function AceitarSaldoModal({ pendencia, onClose, onConcluido }) {
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [feito, setFeito] = useState(null)

  const esp = pendencia.esperado || {}
  const enc = pendencia.encontrado || {}
  const faturas = esp.por_fatura || []

  const confirmar = async () => {
    if (!motivo.trim()) { setErro('Informe o motivo.'); return }
    setSalvando(true)
    setErro('')
    try {
      const r = await aceitarSaldoPendencia(pendencia.id, motivo.trim())
      setFeito(r?.marco || {})
      onConcluido?.()
    } catch (e) {
      setErro(e.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal open onClose={salvando ? () => {} : onClose} title="Aceitar saldo atual como correto">
      {feito ? (
        <div className="space-y-3">
          <p className="flex items-start gap-2 text-sm text-gray-300">
            <CheckCircle size={16} className="text-emerald-400 shrink-0 mt-0.5" />
            Marco gravado em {feito.data || 'hoje'} com saldo {fmt(Number(feito.saldo ?? enc.saldo))}. Pendência resolvida.
          </p>
          <div className="flex justify-end"><button className="btn-primary" onClick={onClose}>Fechar</button></div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            {enc.subconta || 'Subconta'}: o saldo atual passa a ser o ponto de partida. Nenhum lançamento é criado e nenhum saldo é alterado.
          </p>
          <table className="text-sm w-full">
            <tbody>
              <tr><td className="text-gray-500 py-0.5">Saldo atual</td><td className="text-right text-gray-200">{fmt(enc.saldo ?? 0)}</td></tr>
              <tr><td className="text-gray-500 py-0.5">Esperado</td><td className="text-right text-gray-200">{fmt(esp.saldo ?? 0)}</td></tr>
              <tr><td className="text-gray-500 py-0.5">Diferença</td><td className="text-right text-amber-300">{fmt(enc.diferenca ?? 0)}</td></tr>
            </tbody>
          </table>
          <div>
            <p className="text-xs text-gray-500 mb-1">Faturas envolvidas no esperado</p>
            {faturas.length ? (
              <ul className="text-xs text-gray-300 space-y-0.5">
                {faturas.map(f => (
                  <li key={f.fatura} className="flex justify-between"><span>Fatura {f.fatura}</span><span>{fmt(f.valor)}</span></li>
                ))}
              </ul>
            ) : <p className="text-xs text-gray-500">Nenhuma fatura aberta com gasto G pendente de devolução.</p>}
            {esp.marco && (
              <p className="text-xs text-gray-500 mt-2">
                Marco anterior: {esp.marco.data} (diferença aceita {fmt(esp.marco.diferenca_aceita ?? 0)})
              </p>
            )}
          </div>
          <label className="block">
            <span className="text-xs text-gray-400">Motivo (obrigatório)</span>
            <textarea className="input w-full mt-1 text-sm" rows={3} value={motivo}
              onChange={e => setMotivo(e.target.value)} placeholder="Ex.: histórico antigo já conferido com o extrato" />
          </label>
          {erro && <p className="text-sm text-red-400">{erro}</p>}
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={onClose} disabled={salvando}>Cancelar</button>
            <button className="btn-primary flex items-center gap-2" onClick={confirmar} disabled={salvando || !motivo.trim()}>
              {salvando && <Loader2 size={14} className="animate-spin" />}
              Confirmar
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
