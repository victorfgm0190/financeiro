import { createContext, useContext, useEffect, useRef } from 'react'

// Rolagem do corpo do Modal em formulários com etapas (wizards): ao trocar de etapa, o corpo volta ao
// topo; ao barrar o avanço por validação, rola até o campo com problema. Fora de um Modal, o corpo é
// o ancestral rolável mais próximo (ou nada: no-op).
export const CorpoModalContext = createContext(null)

export function rolarCorpoAoTopo(corpo) {
  if (!corpo) return
  if (typeof corpo.scrollTo === 'function') corpo.scrollTo({ top: 0 })
  else corpo.scrollTop = 0
}

// Ao mudar `chave` (etapa), rola o corpo do Modal para o topo. Não roda na montagem.
export function useRolarAoTopo(chave) {
  const corpoRef = useContext(CorpoModalContext)
  const anterior = useRef(chave)
  useEffect(() => {
    if (Object.is(anterior.current, chave)) return
    anterior.current = chave
    rolarCorpoAoTopo(corpoRef?.current)
  }, [chave, corpoRef])
}

// Leva o elemento para a vista (centro do corpo do Modal) e foca o primeiro campo dele.
export function rolarAteElemento(el, { focar = true } = {}) {
  if (!el) return
  el.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  if (!focar) return
  // Campo de digitação primeiro (o cartão pode ter botões antes dos campos); botão só se não houver.
  const campo = el.matches?.('input,select,textarea,button') ? el
    : el.querySelector?.('input:not([type=hidden]):not([disabled]),select:not([disabled]),textarea:not([disabled])') || el.querySelector?.('button')
  campo?.focus?.({ preventScroll: true })
}
