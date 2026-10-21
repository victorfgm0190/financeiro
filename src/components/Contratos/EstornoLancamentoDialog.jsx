import { useMemo, useState } from 'react'
import Modal from '../shared/Modal'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'
import { analisarEstorno } from '../../lib/contratos/estorno'
import { ocorrenciasDoLancamento } from '../../lib/scheduleBaixa'
import { rotuloContrato, STATUS_CONTRATO } from '../../lib/contratos/parcelas'

// Confirmação de estorno de lançamento (Lançamentos e Extrato). Parcela de contrato rescindido ou
// encerrado: pergunta "Reabrir esta parcela no contrato rescindido?" — Sim = volta a pendente;
// Não = fica cancelada. Os dois casos entram na linha do tempo do contrato.
export default function EstornoLancamentoDialog({ tx, onClose, onFeito }) {
  const { schedules, reverseTransaction, contratoPorId, contratosHabilitado, estornarLancamentoContrato } = useApp()
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const analise = useMemo(() => (tx && contratosHabilitado ? analisarEstorno(tx, schedules, contratoPorId) : null), [tx, schedules, contratoPorId, contratosHabilitado])
  if (!tx) return null

  const agendamento = tx.scheduleId ? schedules.find(s => s.id === tx.scheduleId) : null
  const ocorrencia = analise?.ocorrencia || (agendamento && ocorrenciasDoLancamento(agendamento, tx)[0]) || null

  const estornar = async (reabrir) => {
    setSalvando(true)
    try {
      if (analise) {
        await estornarLancamentoContrato(tx, { reabrir })
        onFeito?.(reabrir
          ? `Lançamento estornado. Parcela de ${fmtDate(analise.ocorrencia || tx.date)} voltou a pendente${analise.perguntar ? ' no contrato ' + STATUS_CONTRATO[analise.contrato.status].toLowerCase() : ''}.`
          : `Lançamento estornado. Parcela de ${fmtDate(analise.ocorrencia || tx.date)} cancelada no contrato.`)
      } else {
        reverseTransaction(tx.id)
        onFeito?.(ocorrencia ? `Lançamento estornado. Agendamento restaurado para ${fmtDate(ocorrencia)}.` : 'Lançamento estornado.')
      }
      onClose()
    } catch (err) {
      setErro(err?.message || 'Falha ao estornar.')
      setSalvando(false)
    }
  }

  if (analise?.perguntar) {
    const status = STATUS_CONTRATO[analise.contrato.status].toLowerCase()
    return (
      <Modal open onClose={onClose} title="Estornar Lançamento" size="sm">
        <div className="space-y-3 text-sm">
          <p className="text-texto-2">
            Este lançamento pagou a parcela de <strong className="text-texto-1">{fmtDate(analise.ocorrencia)}</strong> ({fmt(tx.amount)}) do
            contrato <strong className="text-texto-1">{rotuloContrato(analise.contrato)}</strong>, que está <strong className="text-texto-1">{status}</strong>.
          </p>
          <p className="text-texto-1 font-medium">Reabrir esta parcela no contrato {status}?</p>
          <ul className="text-xs text-texto-3 list-disc pl-4 space-y-0.5">
            <li><strong>Sim</strong>: a parcela volta a pendente e a ficha do contrato avisa.</li>
            <li><strong>Não</strong>: a parcela fica cancelada (não vira pendência).</li>
          </ul>
          {erro && <p className="text-xs text-perigo">{erro}</p>}
          <div className="flex flex-col gap-2">
            <button className="btn-secondary" disabled={salvando} onClick={() => estornar(true)}>Sim, reabrir a parcela</button>
            <button className="btn-danger" disabled={salvando} onClick={() => estornar(false)}>Não, estornar e cancelar a parcela</button>
            <button className="btn-secondary" disabled={salvando} onClick={onClose}>Cancelar</button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open onClose={onClose} title="Estornar Lançamento" size="sm">
      <p className="text-texto-2 mb-6 text-sm">
        {ocorrencia
          ? `Estornar este lançamento? O agendamento voltará para pendente na data ${fmtDate(ocorrencia)}.`
          : 'Estornar este lançamento? Esta ação não pode ser desfeita.'}
      </p>
      {erro && <p className="text-xs text-perigo mb-3">{erro}</p>}
      <div className="flex gap-3 justify-end">
        <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn-danger" disabled={salvando} onClick={() => estornar(true)}>Confirmar Estorno</button>
      </div>
    </Modal>
  )
}
