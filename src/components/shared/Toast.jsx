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
    <div className={`fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 border px-4 py-3 rounded-xl shadow-2xl text-sm max-w-[92vw] md:max-w-md ${isError ? 'bg-red-950/90 border-red-800 text-red-100' : 'bg-gray-800 border-gray-700 text-gray-200 whitespace-nowrap'}`}>
      <Icon size={15} className={`shrink-0 ${isError ? 'text-red-400' : 'text-emerald-400'}`} />
      <span>{message}</span>
      <button onClick={onClose} className={`ml-1 shrink-0 transition-colors ${isError ? 'text-red-300/70 hover:text-red-100' : 'text-gray-500 hover:text-gray-300'}`}>
        <X size={13} />
      </button>
    </div>
  )
}
