import { useState, useEffect } from 'react'
import { MOBILE_MEDIA_QUERY as MOBILE_QUERY } from '../lib/breakpoints'

// Detecta viewport mobile (<md do Tailwind = 768px) de forma reativa.
// Usado para ocultar contas com hideOnMobile em listas/seletores no celular,
// sem afetar dados/saldos (que continuam considerando todas as contas).
// A media query vem de src/lib/breakpoints.js (a mesma do useTheme e do index.html).

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia(MOBILE_QUERY).matches
      : false
  )

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia(MOBILE_QUERY)
    const onChange = (e) => setIsMobile(e.matches)
    setIsMobile(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return isMobile
}
