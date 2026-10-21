import { useApp } from '../../context/AppContext'
import { MODOS_VALOR } from '../../lib/contratos/despesaReal'

// "Despesa real / Valor pago" dos relatórios por categoria (só aparece com o módulo de Contratos).
export default function SeletorModoValor({ value, onChange }) {
  const { contratosHabilitado } = useApp()
  if (!contratosHabilitado) return null
  return (
    <div className="inline-flex rounded-lg border border-borda-forte overflow-hidden text-xs" role="group" aria-label="Valor dos lançamentos de contrato">
      {MODOS_VALOR.map(m => (
        <button key={m.value} type="button" title={m.title} onClick={() => onChange(m.value)}
          className={`px-2 py-1 ${value === m.value ? 'bg-primary/15 text-primary-fg font-semibold' : 'text-texto-2 hover:bg-surface-hover'}`}>
          {m.label}
        </button>
      ))}
    </div>
  )
}
