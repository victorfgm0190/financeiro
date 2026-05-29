import { useEffect } from 'react'
import { CheckCircle2, X } from 'lucide-react'

export default function Toast({ message, onClose, duration = 5000 }) {
  useEffect(() => {
    const t = setTimeout(onClose, duration)
    return () => clearTimeout(t)
  }, [onClose, duration])

  return (
    <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-gray-800 border border-gray-700 text-gray-200 px-4 py-3 rounded-xl shadow-2xl text-sm whitespace-nowrap">
      <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
      <span>{message}</span>
      <button onClick={onClose} className="ml-1 text-gray-500 hover:text-gray-300 transition-colors">
        <X size={13} />
      </button>
    </div>
  )
}
