import { useState } from 'react'
import { Trash2, Ban } from 'lucide-react'
import Modal from '../shared/Modal'
import { useApp } from '../../context/AppContext'
import { fmt, fmtDate } from '../shared/utils'
import { ehParcelaGerada, rotuloContrato } from '../../lib/contratos/parcelas'

// Exclusão de um agendamento que pertence a um contrato: nunca apaga a série em silêncio.
// "Excluir só esta parcela" (não volta na regeneração) | "Rescindir o contrato" (abre a ficha) | Cancelar.
export default function ExcluirParcelaContratoModal({ schedule, onClose, onExcluido }) {
  const { contratoPorId, excluirParcelaContrato, abrirFichaContrato } = useApp()
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  if (!schedule) return null
  const contrato = contratoPorId(schedule.contratoId)
  const gerada = contrato && ehParcelaGerada(schedule, contrato.id)
  const excluir = async () => {
    setSalvando(true)
    try {
      await excluirParcelaContrato(contrato, schedule)
      onExcluido?.()
      onClose()
    } catch (err) {
      setErro(err?.message || 'Falha ao excluir.')
      setSalvando(false)
    }
  }
  return (
    <Modal open onClose={onClose} title="Agendamento de contrato" size="sm">
      <div className="space-y-3">
        <p className="text-sm text-texto-2">
          Este agendamento pertence ao contrato <strong className="text-texto-1">{contrato ? rotuloContrato(contrato) : '(contrato não carregado)'}</strong>.
        </p>
        <div className="bg-surface-2/60 rounded-lg p-3 space-y-1.5 text-xs">
          <div className="flex justify-between"><span className="text-texto-3">Descrição</span><span className="text-texto-1">{schedule.description}</span></div>
          <div className="flex justify-between"><span className="text-texto-3">Vencimento</span><span className="text-texto-1">{fmtDate(schedule.startDate)}</span></div>
          <div className="flex justify-between"><span className="text-texto-3">Valor</span><span className="text-texto-1 font-bold">{fmt(schedule.amount)}</span></div>
        </div>
        {erro && <p className="text-xs text-perigo">{erro}</p>}
        <div className="flex flex-col gap-2">
          <button className="btn-danger flex items-center justify-center gap-2" disabled={salvando} onClick={excluir}>
            <Trash2 size={14} /> {gerada ? 'Excluir só esta parcela' : 'Excluir este agendamento'}
          </button>
          {contrato?.status === 'ativo' && (
            <button className="btn-secondary flex items-center justify-center gap-2" disabled={salvando}
              onClick={() => { onClose(); abrirFichaContrato(contrato.id, 'rescindir') }}>
              <Ban size={14} /> Rescindir o contrato
            </button>
          )}
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </Modal>
  )
}
