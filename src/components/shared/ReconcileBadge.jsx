import { Check } from 'lucide-react'

// Badge quadrado de reconciliação (28x28px, raio 6px). Substitui o antigo círculo/ícone.
//   pendente     → quadrado vazado, borda 1.5px, check apagado (cinza)
//   reconciliado → quadrado verde (primary) preenchido, check branco — status ok (decisão 11 do tema)
// Apenas visual: a lógica de reconciliação fica com quem passa `onClick`
// (o handler recebe o evento e pode dar stopPropagation quando a linha é clicável).
export default function ReconcileBadge({ reconciled, onClick, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? (reconciled ? 'Reconciliado — clique para desmarcar' : 'Marcar como reconciliado')}
      className={`inline-flex items-center justify-center w-7 h-7 rounded-md border-[1.5px] transition-colors ${
        reconciled
          ? 'bg-primary border-primary text-white'
          : 'border-borda-forte text-texto-3 hover:border-borda-forte'
      }`}
    >
      <Check size={16} strokeWidth={3} />
    </button>
  )
}
