import { X } from 'lucide-react'
import { useCallback, useEffect, useRef } from 'react'
import { GuardaFechamentoContext } from './guardaFechamento'
import { useCamadaModal, CamadaContext } from '../../context/atalhosHooks'

const MAX_WIDTHS = {
  sm: 'md:max-w-sm',
  md: 'md:max-w-lg',
  lg: 'md:max-w-2xl',
  xl: 'md:max-w-4xl',
}

export default function Modal({ open, onClose, title, children, size = 'md' }) {
  const guardas = useRef(new Set())
  const registrarGuarda = useCallback((fn) => {
    guardas.current.add(fn)
    return () => guardas.current.delete(fn)
  }, [])
  const fechar = useCallback(() => {
    for (const g of guardas.current) if (!g()) return
    onClose()
  }, [onClose])
  // Camada para os atalhos de teclado: ações registradas dentro deste modal só valem com ele no topo.
  const painelRef = useRef(null)
  const camadaId = useCamadaModal(open, painelRef)
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') fechar() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, fechar])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col md:items-center md:justify-center md:p-4">
      {/* Desktop backdrop — sem backdrop-filter: sob uma camada composta que se move acima
          (ex.: o dropdown portado do SearchableSelect, z-9999, ao passar o cursor pelas opções),
          o backdrop-filter invalida o backing store e o modal "sumia" por um frame. O overlay
          escuro (bg-overlay) mantém o mesmo efeito visual de escurecer o fundo. */}
      <div className="absolute inset-0 bg-overlay hidden md:block" onClick={fechar} />
      {/* Modal — translateZ(0) promove o painel a uma camada de composição GPU própria,
          isolando-o das recomposições forçadas por elementos portados acima (ex.: o dropdown
          do SearchableSelect em z-9999), que faziam o modal "sumir" por um frame. */}
      <div
        ref={painelRef}
        style={{ transform: 'translateZ(0)' }}
        className={`relative z-10 flex flex-col bg-surface border-b border-borda md:border md:rounded-2xl w-full h-full md:h-auto md:max-h-[90vh] ${MAX_WIDTHS[size] || MAX_WIDTHS.md} shadow-2xl`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-borda shrink-0">
          <h2 className="text-base font-semibold text-texto-1">{title}</h2>
          <button onClick={fechar} className="text-texto-3 hover:text-texto-2 transition-colors p-1 rounded-lg hover:bg-surface-hover">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <CamadaContext.Provider value={camadaId}>
            <GuardaFechamentoContext.Provider value={registrarGuarda}>{children}</GuardaFechamentoContext.Provider>
          </CamadaContext.Provider>
        </div>
      </div>
    </div>
  )
}
