import { X } from 'lucide-react'
import { useEffect } from 'react'

const MAX_WIDTHS = {
  sm: 'md:max-w-sm',
  md: 'md:max-w-lg',
  lg: 'md:max-w-2xl',
  xl: 'md:max-w-4xl',
}

export default function Modal({ open, onClose, title, children, size = 'md' }) {
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col md:items-center md:justify-center md:p-4">
      {/* Desktop backdrop — sem backdrop-filter: sob uma camada composta que se move acima
          (ex.: o dropdown portado do SearchableSelect, z-9999, ao passar o cursor pelas opções),
          o backdrop-filter invalida o backing store e o modal "sumia" por um frame. O overlay
          escuro bg-black/60 mantém o mesmo efeito visual de escurecer o fundo. */}
      <div className="absolute inset-0 bg-black/60 hidden md:block" onClick={onClose} />
      {/* Modal — translateZ(0) promove o painel a uma camada de composição GPU própria,
          isolando-o das recomposições forçadas por elementos portados acima (ex.: o dropdown
          do SearchableSelect em z-9999), que faziam o modal "sumir" por um frame. */}
      <div
        style={{ transform: 'translateZ(0)' }}
        className={`relative z-10 flex flex-col bg-surface border-b border-gray-800 md:border md:rounded-2xl w-full h-full md:h-auto md:max-h-[90vh] ${MAX_WIDTHS[size] || MAX_WIDTHS.md} shadow-2xl`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
          <h2 className="text-base font-semibold text-gray-100">{title}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors p-1 rounded-lg hover:bg-gray-800">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  )
}
