import { Link2 } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { fmtDate } from './utils'

// Ícone de vínculo (corrente) do lançamento que baixou uma ocorrência de agendamento sem ter sido
// gerado por ela (vínculo manual / "Vincular a lançamento existente"). Tooltip: a que está ligado.
// `desvincular`: mostra o botão "Desvincular" (caso 1 de lib/vinculo).
export default function SeloVinculo({ tx, desvincular = false, onToast, className = '' }) {
  const { vinculosPorLancamento, desvincularLancamento, pode } = useApp()
  const lista = tx && !tx.scheduleId ? vinculosPorLancamento?.get(tx.id) : null
  if (!lista?.length) return null
  const texto = lista.map(v => `${v.schedule.description || 'Agendamento'} — ocorrência de ${fmtDate(v.data)}`).join('\n')
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="inline-flex items-center gap-1 text-xs text-primary-fg" title={`Vinculado a:\n${texto}`} aria-label={`Vinculado a ${texto}`}>
        <Link2 size={12} /> {desvincular ? `Vinculado: ${lista[0].schedule.description || 'agendamento'} (${fmtDate(lista[0].data)})` : null}
      </span>
      {desvincular && pode?.('agendamentos', 'editar') && lista.map(v => (
        <button key={`${v.scheduleId}@${v.data}`} type="button" className="text-[11px] text-texto-2 underline hover:text-texto-1"
          onClick={() => {
            const r = desvincularLancamento({ scheduleId: v.scheduleId, data: v.data })
            onToast?.(r?.ok ? 'Desvinculado: a ocorrência voltou a pendente e o lançamento a avulso.' : (r?.motivo || 'Não foi possível desvincular.'))
          }}>
          Desvincular
        </button>
      ))}
    </span>
  )
}
