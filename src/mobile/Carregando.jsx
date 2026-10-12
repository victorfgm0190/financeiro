import { AlertTriangle, RefreshCw } from 'lucide-react'

// Placeholders enquanto os saldos não estão prontos (useSaldosProntos === 'carregando') — o
// mesmo shimmer `.skeleton` (index.css) que o Painel do desktop usa no lugar dos números.

export function SkeletonVal({ className = 'w-24 h-5' }) {
  return <span className={`skeleton block ${className}`} aria-hidden="true" />
}

// Corpo de card do Início: linhas de shimmer, sem nenhum número.
export function SkeletonLinhas({ linhas = 3 }) {
  return (
    <div className="space-y-3" role="status" aria-label="Calculando saldos">
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-3">
          <SkeletonVal className="w-28 h-4" />
          <SkeletonVal className="w-20 h-4" />
        </div>
      ))}
    </div>
  )
}

// Tela de módulo com saldo (Fluxo, Reservas…) enquanto calcula.
export function TelaCarregando() {
  return (
    <div className="space-y-4" role="status" aria-label="Calculando saldos">
      <p className="text-xs text-gray-500">Calculando saldos…</p>
      {[0, 1, 2].map(i => (
        <div key={i} className="card p-4 space-y-3">
          <SkeletonVal className="w-32 h-7" />
          <SkeletonLinhas linhas={2} />
        </div>
      ))}
    </div>
  )
}

// Falha ou demora (> 15s) ao conectar: valores do cache + aviso discreto. "Recalcular" recarrega o
// app, que reconecta ao Neon e refaz o recálculo automático dos saldos (AppContext) — nenhuma
// regra de cálculo nova.
export function AvisoDesatualizado() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 mb-3 text-xs text-amber-300">
      <AlertTriangle size={14} className="shrink-0" />
      <span className="flex-1">Saldos podem estar desatualizados</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="flex items-center gap-1 min-h-[44px] -my-2 px-2 font-medium text-amber-200"
      >
        <RefreshCw size={13} /> Recalcular
      </button>
    </div>
  )
}
