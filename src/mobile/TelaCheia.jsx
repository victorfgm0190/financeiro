import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

// Tela cheia do mobile (ex.: "Como chegamos aqui"): cabeçalho fixo com título e X, conteúdo com
// rolagem. Abrir cria UMA entrada no histórico, para o voltar do Android / gesto do iOS fechar a
// tela em vez de sair do app. Fechar pelo X (ou Esc) remove essa entrada — o próximo voltar
// segue normal, sem precisar de dois toques.
export default function TelaCheia({ open, onClose, title, children }) {
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  useEffect(() => {
    if (!open) return
    let saiuPeloVoltar = false
    window.history.pushState({ finupTelaCheia: true }, '')
    // Só fecha quando o voltar sai das entradas desta tela (no StrictMode do dev o efeito roda
    // duas vezes e o back() da 1ª limpeza cai numa entrada nossa — essa é ignorada).
    const onPop = (e) => {
      if (e.state?.finupTelaCheia) return
      saiuPeloVoltar = true
      onCloseRef.current()
    }
    const onKey = (e) => { if (e.key === 'Escape') onCloseRef.current() }
    window.addEventListener('popstate', onPop)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('keydown', onKey)
      // Fechou pelo X/Esc: a entrada criada ainda está no topo — tira (o listener já saiu).
      if (!saiuPeloVoltar && window.history.state?.finupTelaCheia) window.history.back()
    }
  }, [open])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-page" role="dialog" aria-modal="true" aria-label={title}>
      <header className="flex items-center gap-2 pl-4 pr-2 h-14 shrink-0 border-b border-borda bg-page" style={{ paddingTop: 'env(safe-area-inset-top)', boxSizing: 'content-box' }}>
        <h2 className="flex-1 text-base font-semibold text-texto-1 truncate">{title}</h2>
        <button type="button" onClick={() => onCloseRef.current()} aria-label="Fechar" className="w-11 h-11 flex items-center justify-center text-texto-2 hover:text-texto-1">
          <X size={20} />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pt-4" style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
        {children}
      </div>
    </div>
  )
}
