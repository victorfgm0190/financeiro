import { X } from 'lucide-react'
import { useCallback, useEffect, useRef } from 'react'
import { GuardaFechamentoContext } from './guardaFechamento'
import { useCamadaModal, CamadaContext } from '../../context/atalhosHooks'
import { focaveis } from '../../lib/foco'

// Modais abertos, do mais antigo ao do topo: Tab e Esc valem só para o do topo.
const pilha = []

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
  // Ref: o pai costuma passar um onClose novo a cada render, e o efeito abaixo não pode rodar de
  // novo por isso (devolveria o foco para quem abriu no meio da digitação).
  const fecharRef = useRef(fechar)
  useEffect(() => { fecharRef.current = fechar }, [fechar])
  // Focus trap: Tab/Shift+Tab circulam só dentro do modal do topo; ao abrir, o foco vai para o
  // primeiro campo (se nada lá dentro já o pegou, ex.: autoFocus); ao fechar, volta para quem abriu.
  useEffect(() => {
    if (!open) return
    const id = {}
    pilha.push(id)
    const quemAbriu = document.activeElement
    const raf = requestAnimationFrame(() => {
      const painel = painelRef.current
      if (painel && !painel.contains(document.activeElement)) focaveis(painel)[0]?.focus()
    })
    const handler = (e) => {
      if (pilha[pilha.length - 1] !== id) return
      if (e.key === 'Escape') { if (!e.defaultPrevented) fecharRef.current(); return }
      if (e.key !== 'Tab' || e.defaultPrevented) return
      const painel = painelRef.current
      const lista = focaveis(painel)
      if (!lista.length) return
      const atual = document.activeElement
      // Foco num painel de modal próprio aberto por cima (ex.: ScheduleMatchModal): é dele.
      if (!painel.contains(atual) && atual?.closest?.('[data-modal-painel]')) return
      const primeiro = lista[0]
      const ultimo = lista[lista.length - 1]
      if (!painel.contains(atual)) { e.preventDefault(); (e.shiftKey ? ultimo : primeiro).focus() }
      else if (e.shiftKey && atual === primeiro) { e.preventDefault(); ultimo.focus() }
      else if (!e.shiftKey && atual === ultimo) { e.preventDefault(); primeiro.focus() }
    }
    window.addEventListener('keydown', handler)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', handler)
      const i = pilha.indexOf(id)
      if (i >= 0) pilha.splice(i, 1)
      if (quemAbriu && quemAbriu !== document.body && document.contains(quemAbriu)) quemAbriu.focus?.()
    }
  }, [open])

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
        data-modal-painel=""
        role="dialog"
        aria-modal="true"
        style={{ transform: 'translateZ(0)' }}
        className={`relative z-10 flex flex-col bg-surface border-b border-borda md:border md:rounded-2xl w-full h-full md:h-auto md:max-h-[90vh] ${MAX_WIDTHS[size] || MAX_WIDTHS.md} shadow-2xl`}
      >
        {/* Celular (tela cheia): o cabeçalho desce abaixo da status bar do iPhone (modal-safe-top) e,
            no tema claro, pinta a faixa escura sob ela (faixa-safe-top) — ver index.css. No md+ e
            fora do iOS standalone as duas são no-op. */}
        <div className="faixa-safe-top modal-safe-top flex items-center justify-between gap-2 px-5 pb-4 border-b border-borda shrink-0">
          <h2 className="min-w-0 text-base font-semibold text-texto-1">{title}</h2>
          {/* Fora da ordem do Tab (Esc fecha): o Tab começa no primeiro campo. */}
          <button onClick={fechar} tabIndex={-1} aria-label="Fechar" className="text-texto-3 hover:text-texto-2 transition-colors p-1 rounded-lg hover:bg-surface-hover">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto max-md:overflow-x-hidden p-5">
          <CamadaContext.Provider value={camadaId}>
            <GuardaFechamentoContext.Provider value={registrarGuarda}>{children}</GuardaFechamentoContext.Provider>
          </CamadaContext.Provider>
        </div>
      </div>
    </div>
  )
}
