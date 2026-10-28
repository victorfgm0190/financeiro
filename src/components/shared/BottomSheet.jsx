import { useEffect } from 'react'
import { X } from 'lucide-react'

// Bottom sheet do mobile (filtros do Fluxo, botão "+"): fundo escurecido que fecha, alça no topo,
// título e botão fechar. Esc também fecha.
export default function BottomSheet({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Fechar" className="absolute inset-0 bg-overlay" onClick={onClose} />
      <div className="relative bg-surface border-t border-borda rounded-t-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden nav-safe-bottom">
        <div className="flex justify-center pt-2"><span className="w-10 h-1 rounded-full bg-surface-hover" /></div>
        <div className="flex items-center justify-between px-4 pt-1 pb-2">
          <h2 className="text-sm font-semibold text-texto-1">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="w-11 h-11 -mr-2 flex items-center justify-center text-texto-2 hover:text-texto-1">
            <X size={18} />
          </button>
        </div>
        <div className="px-4 pb-6 space-y-4">{children}</div>
      </div>
    </div>
  )
}
