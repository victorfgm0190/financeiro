import { CheckCircle, Circle } from 'lucide-react'
import { fmt } from './utils'

// Conteúdo inline "✓ Conciliados | ○ Pendentes" (sem wrapper de barra). Retorna null quando
// ambos são zero. Use dentro de uma barra flex — ex.: com className="ml-auto" p/ alinhar à direita.
export default function ReconciledTotals({ conciliado, pendente, className = '' }) {
  if (!conciliado && !pendente) return null
  return (
    <span className={`inline-flex items-center gap-x-3 whitespace-nowrap ${className}`}>
      <span className="inline-flex items-center gap-1.5">
        <CheckCircle size={13} className="text-blue-600" />
        <span className="text-gray-500">Conciliados:</span>
        <span className="font-semibold text-gray-300">{fmt(conciliado)}</span>
      </span>
      <span className="text-gray-700 select-none">|</span>
      <span className="inline-flex items-center gap-1.5">
        <Circle size={13} className="text-gray-500" />
        <span className="text-gray-500">Pendentes:</span>
        <span className="font-semibold text-gray-300">{fmt(pendente)}</span>
      </span>
    </span>
  )
}
