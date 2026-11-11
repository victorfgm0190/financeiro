import { useCallback, useEffect, useReducer, useState } from 'react'
import { situacaoDoNavegador } from '../lib/ambienteNavegador'
import { pedidoDeInstalacao, aoMudarPedido, pedirInstalacao } from '../lib/instalacao'
import { marcarAppInstalado } from '../lib/avisoAplicativo'

// Situação do navegador (src/lib/ambienteNavegador.js), atualizada quando o navegador oferece ou
// deixa de oferecer a instalação e quando a janela muda de modo (aberta como aplicativo).
// `instalar()` abre a instalação do navegador e devolve 'accepted' | 'dismissed' | null.
export function useAmbienteNavegador() {
  const [pedido, setPedido] = useState(() => pedidoDeInstalacao())
  const [, atualizar] = useReducer(n => n + 1, 0)
  useEffect(() => aoMudarPedido(setPedido), [])
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const listas = ['(display-mode: standalone)', '(display-mode: window-controls-overlay)']
      .map(q => { try { return window.matchMedia(q) } catch { return null } })
      .filter(m => m?.addEventListener)
    listas.forEach(m => m.addEventListener('change', atualizar))
    return () => listas.forEach(m => m.removeEventListener('change', atualizar))
  }, [])
  const situacao = situacaoDoNavegador(typeof window !== 'undefined' ? window : null, { pedido })
  const instalar = useCallback(async () => {
    const r = await pedirInstalacao()
    if (r === 'accepted') marcarAppInstalado()
    setPedido(pedidoDeInstalacao())
    return r
  }, [])
  return { situacao, instalar }
}
