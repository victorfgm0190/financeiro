import { useEffect } from 'react'
import { CheckCircle2, AlertTriangle, X } from 'lucide-react'

export default function Toast({ message, onClose, duration = 5000, variant = 'success' }) {
  useEffect(() => {
    const t = setTimeout(onClose, duration)
    return () => clearTimeout(t)
  }, [onClose, duration])

  const isError = variant === 'error'
  const Icon = isError ? AlertTriangle : CheckCircle2

  return (
    <div className={`fixed bottom-[calc(84px+env(safe-area-inset-bottom))] md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 border px-4 py-3 rounded-xl shadow-2xl text-sm max-w-[92vw] md:max-w-md ${isError ? 'bg-perigo-bg border-perigo/40 text-texto-1' : 'bg-surface-2 border-borda-forte text-texto-1 whitespace-nowrap'}`}>
      <Icon size={15} className={`shrink-0 ${isError ? 'text-perigo' : 'text-primary-fg'}`} />
      <span>{message}</span>
      <button onClick={onClose} className={`ml-1 shrink-0 transition-colors ${isError ? 'text-perigo hover:text-texto-1' : 'text-texto-3 hover:text-texto-2'}`}>
        <X size={13} />
      </button>
    </div>
  )
}
