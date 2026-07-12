import { createContext, useContext, useEffect } from 'react'

const KEY_PREFIX = 'scroll:'

// O Finup navega por estado (activePage / sub-telas), não por router. Este contexto deixa
// uma sub-tela (extrato de conta, extrato/relatório de cartão) registrar sua própria chave
// de scroll enquanto montada — assim a posição da lista de origem e a da sub-tela são
// guardadas separadamente e restauradas ao voltar.
export const ScrollScopeContext = createContext(null)

export function useScrollScope(key) {
  const setScope = useContext(ScrollScopeContext)
  useEffect(() => {
    if (!setScope) return
    setScope(key)
    return () => setScope(null)
  }, [key, setScope])
}

// Salva/restaura o scrollTop do container (o <main> do app) por chave lógica de tela.
// Guardado em sessionStorage: persiste na sessão e some ao fechar a aba, sem acumular lixo.
export function useScrollRestoration(containerRef, scrollKey) {
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const storageKey = KEY_PREFIX + scrollKey
    const saved = sessionStorage.getItem(storageKey)
    const y = saved != null ? parseInt(saved, 10) || 0 : 0

    // Aguarda o React comitar/pintar a nova tela antes de reaplicar o scroll (duplo rAF).
    let raf1, raf2
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => { el.scrollTop = y })
    })

    // Salva a posição continuamente (throttle via rAF) — no momento de navegar, a última
    // posição desta chave já está gravada, sem depender de ler o DOM no cleanup.
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        try { sessionStorage.setItem(storageKey, String(el.scrollTop)) } catch { /* quota */ }
        ticking = false
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      el.removeEventListener('scroll', onScroll)
    }
  }, [containerRef, scrollKey])
}

// Limpa as posições salvas no logout/401 — evita restaurar scroll de outra sessão.
export function clearScrollRestoration() {
  try {
    Object.keys(sessionStorage)
      .filter(k => k.startsWith(KEY_PREFIX))
      .forEach(k => sessionStorage.removeItem(k))
  } catch { /* ignore */ }
}
