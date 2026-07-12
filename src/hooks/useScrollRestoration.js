import { createContext, useContext, useEffect } from 'react'

const KEY_PREFIX = 'scroll:'

// Navegação do Finup é por estado (activePage / sub-telas), não router. O contexto expõe:
// - setScope: sub-telas (extrato) registram sua própria chave enquanto montadas;
// - saveNow: salva a posição atual ANTES de navegar (o listener de scroll pode não ter
//   disparado após o último movimento) e congela os saves durante a transição.
export const ScrollScopeContext = createContext(null)

export function useScrollScope(key) {
  const ctx = useContext(ScrollScopeContext)
  const setScope = ctx?.setScope
  useEffect(() => {
    if (!setScope) return
    setScope(key)
    return () => setScope(null)
  }, [key, setScope])
}

// Retorna a função que salva a posição atual e prepara a transição. Deve ser chamada por
// quem dispara a navegação (troca de painel, abrir/voltar de sub-tela) ANTES da troca.
export function useScrollSaver() {
  const ctx = useContext(ScrollScopeContext)
  return ctx?.saveNow ?? noop
}
const noop = () => {}

// Ao trocar de tela, o conteúdo do <main> muda de altura e o browser "clampa" o scrollTop,
// disparando um scroll que salvaria uma posição errada na chave que está saindo. Enquanto
// suprimido, o listener ignora esses saves espúrios (só um container/listener por vez).
let saveSuppressed = false
let suppressTimer = null
function suppressSaves(ms = 250) {
  saveSuppressed = true
  if (suppressTimer) clearTimeout(suppressTimer)
  suppressTimer = setTimeout(() => { saveSuppressed = false; suppressTimer = null }, ms)
}

export function saveScrollNow(containerRef, scrollKey) {
  const el = containerRef?.current
  if (!el) return
  try { sessionStorage.setItem(KEY_PREFIX + scrollKey, String(el.scrollTop)) } catch { /* quota */ }
  suppressSaves()
  // Zera antes da troca de conteúdo — a nova tela abre no topo sem herdar o scroll da atual.
  el.scrollTop = 0
}

// Salva/restaura o scrollTop do <main> por chave lógica de tela (sessionStorage: persiste na
// sessão e some ao fechar a aba).
export function useScrollRestoration(containerRef, scrollKey) {
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const storageKey = KEY_PREFIX + scrollKey

    // Zera já para a nova tela não herdar o scroll da anterior (sub-tela abrindo no meio).
    el.scrollTop = 0

    const saved = sessionStorage.getItem(storageKey)
    const y = saved != null ? parseInt(saved, 10) || 0 : 0
    // Só restaura posição > 0 (após o React comitar/pintar, via duplo rAF). Sem posição
    // salva a tela fica no topo — inclusive as sub-telas, que sempre abrem no topo.
    let raf1, raf2
    if (y > 0) {
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => { el.scrollTop = y })
      })
    }

    let ticking = false
    const onScroll = () => {
      if (saveSuppressed || ticking) return
      ticking = true
      requestAnimationFrame(() => {
        try { sessionStorage.setItem(storageKey, String(el.scrollTop)) } catch { /* quota */ }
        ticking = false
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      if (raf1) cancelAnimationFrame(raf1)
      if (raf2) cancelAnimationFrame(raf2)
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
