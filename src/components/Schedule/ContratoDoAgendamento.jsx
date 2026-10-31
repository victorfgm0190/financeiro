import { useMemo, useState } from 'react'
import { FileSignature, Link2 } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import VinculoModal from '../Contratos/VinculoModal'
import { PAPEIS } from '../../lib/contratos/parcelas'
import { contratoPorNumero } from '../../lib/contratos/numero'
import { computeOccurrences } from '../../lib/occurrences'
import { mostrarNumeroContrato } from '../../lib/tiposDocumento'

const rotulo = (c) => [c.numero ? `nº ${c.numero}` : null, c.objeto || c.favorecido].filter(Boolean).join(' · ') || 'Contrato'

// Nº do contrato do agendamento (campo próprio) + vínculo MANUAL a um contrato cadastrado. O vínculo
// reaproveita o do módulo Contratos (VinculoModal → vincularEGerarContrato): mesma prévia das parcelas,
// mesmo evento na linha do tempo do contrato. Só em agendamento já salvo e com permissão de contratos.
export default function ContratoDoAgendamento({ numero, onNumero, schedule = null, confira = false, tipoDocumentoId = null }) {
  const { contratos = [], contratosHabilitado, contratoPorId, abrirFichaContrato, pode, tiposDocumento = [] } = useApp()
  // Nº do contrato: só com tipo de documento que costuma tê-lo, já preenchido ou pedido (mesma regra do lançamento).
  const [pedido, setPedido] = useState(false)
  const mostrar = mostrarNumeroContrato({ tipoDocumentoId, numeroContrato: numero, tipos: tiposDocumento, pedido })
  const tipo = schedule?.transactionType === 'income' ? 'receber' : 'pagar'
  const opcoes = useMemo(() => (contratos || []).filter(c => !c.tipo || c.tipo === tipo), [contratos, tipo])
  const sugerido = contratoPorNumero(numero, opcoes, { tipoMov: schedule?.transactionType })
  const [escolhido, setEscolhido] = useState('')
  const [papel, setPapel] = useState('aluguel')
  const [modal, setModal] = useState(null)
  const vinculado = schedule?.contratoId ? contratoPorId?.(schedule.contratoId) : null
  const podeVincular = !!(contratosHabilitado && pode?.('contratos', 'editar') && schedule?.id && !schedule.contratoId && opcoes.length > 0)
  const alvoId = escolhido || sugerido?.id || ''

  const abrir = () => {
    const contrato = opcoes.find(c => c.id === alvoId)
    if (!contrato || !schedule) return
    const recorrente = (schedule.frequency || 'once') !== 'once'
    const pagas = (schedule.registered || []).length
    setModal({
      contrato,
      candidatos: [{
        schedule, score: 100, motivos: ['escolhido no agendamento'], papel, pagas,
        pendentes: recorrente ? null : (pagas ? 0 : 1),
        proxima: computeOccurrences(schedule, 1)[0] || null,
      }],
    })
  }

  return (
    <div className="space-y-2">
      {mostrar ? (
        <div>
          <label className="label" htmlFor="ag-numero-contrato">
            Nº do contrato{confira && <span className="ml-1 text-[10px] font-semibold text-aviso">confira</span>}
          </label>
          <input id="ag-numero-contrato" className="input" value={numero || ''} maxLength={40}
            onChange={e => onNumero(e.target.value)} placeholder="Número do contrato do documento (opcional)" />
        </div>
      ) : (
        <button type="button" className="text-xs text-primary-fg hover:underline min-h-[32px]" onClick={() => setPedido(true)}>
          + Nº do contrato
        </button>
      )}
      {vinculado && (
        <p className="text-xs text-texto-2 flex flex-wrap items-center gap-1.5">
          <FileSignature size={13} className="text-primary-fg" /> Vinculado ao contrato
          <button type="button" className="text-primary-fg hover:underline" onClick={() => abrirFichaContrato?.(vinculado.id)}>{rotulo(vinculado)}</button>
        </p>
      )}
      {podeVincular && (
        <div className="rounded-lg border border-borda p-2 space-y-2">
          <p className="text-xs text-texto-2">
            {sugerido ? <>O nº confere com o contrato <strong>{rotulo(sugerido)}</strong>.</> : 'Vincular a um contrato cadastrado:'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
            <select className="input" aria-label="Contrato" value={alvoId} onChange={e => setEscolhido(e.target.value)}>
              <option value="">Escolha o contrato…</option>
              {opcoes.map(c => <option key={c.id} value={c.id}>{rotulo(c)}</option>)}
            </select>
            <select className="input" aria-label="Papel no contrato" value={papel} onChange={e => setPapel(e.target.value)}>
              {Object.entries(PAPEIS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button type="button" className="btn-secondary flex items-center justify-center gap-1.5 min-h-[40px]" disabled={!alvoId} onClick={abrir}>
              <Link2 size={14} /> Vincular ao contrato
            </button>
          </div>
        </div>
      )}
      {modal && (
        <VinculoModal contrato={modal.contrato} candidatos={modal.candidatos} onClose={() => setModal(null)} onConcluido={() => setModal(null)} />
      )}
    </div>
  )
}
