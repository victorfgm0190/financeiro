import { FileSignature } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { parcelaPaga, rotuloContrato } from '../../lib/contratos/parcelas'

// Selos "Contrato n/N" e "Projetado" de uma parcela/agendamento/lançamento de contrato (Fluxo,
// Agendamentos, Lançamentos). Clique abre a ficha do contrato. Sem contrato ou módulo desligado: nada.
export default function SeloContrato({ schedule = null, contratoId = null, comProjetado = true }) {
  const { contratosHabilitado, contratoPorId, abrirFichaContrato } = useApp()
  const id = contratoId || schedule?.contratoId
  if (!id || !contratosHabilitado) return null
  const c = contratoPorId(id)
  const n = schedule?.composicao?.numero
  const t = schedule?.composicao?.total_parcelas
  const rotulo = n ? `Contrato ${n}${t ? `/${t}` : ''}` : 'Contrato'
  const abrir = (e) => { e.stopPropagation(); abrirFichaContrato(id) }
  const projetado = comProjetado && schedule?.valorStatus === 'projetado' && !parcelaPaga(schedule)
  return (
    <>
      <button
        type="button"
        onClick={abrir}
        title={`${c ? rotuloContrato(c) : 'Contrato'} — abrir a ficha`}
        className="inline-flex items-center gap-1 text-xs bg-primary/15 text-primary-fg px-1.5 py-0.5 rounded whitespace-nowrap font-medium hover:bg-primary/25 transition-colors shrink-0"
      >
        <FileSignature size={10} /> {rotulo}
      </button>
      {projetado && (
        <button
          type="button"
          onClick={abrir}
          title="Valor projetado pelo índice de reajuste — confirme na ficha do contrato"
          className="inline-flex items-center text-xs bg-surface-2 text-aviso outline-dashed outline-1 -outline-offset-1 outline-borda-forte px-1.5 py-0.5 rounded whitespace-nowrap font-medium hover:bg-surface-hover transition-colors shrink-0"
        >
          Projetado
        </button>
      )}
    </>
  )
}
