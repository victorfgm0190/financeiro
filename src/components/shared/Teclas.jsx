import { teclasDaCombinacao } from '../../lib/atalhos/combinacao'

// Combinação exibida como teclas: [Alt] + [N].
export default function Teclas({ combinacao, className = '' }) {
  const teclas = teclasDaCombinacao(combinacao)
  if (!teclas.length) return <span className={`text-xs text-texto-3 ${className}`}>Desativado</span>
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {teclas.map((t, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-texto-3 text-xs">+</span>}
          <kbd className="min-w-[1.75rem] text-center px-1.5 py-0.5 rounded-md border border-borda-forte bg-surface-2 text-xs font-mono text-texto-1 shadow-sm">{t}</kbd>
        </span>
      ))}
    </span>
  )
}
