import { useEffect, useRef, useState } from 'react'
import { haModalAberto } from '../lib/recargaRemota'

export const LIMIAR_PUXAR = 64
const MAX_PUXAR = 96
const FOLGA = 8 // px antes de decidir que é "puxar" e não toque/rolagem

// Puxar para atualizar no container que rola (`ref`). Só começa com o container no topo, sem modal
// aberto e fora de lista interna já rolada; arrasto lateral ou para cima desiste (rolagem normal).
// Soltar passado o limiar chama `onAtualizar` (promise). → { puxado (px), atualizando }
export function usePuxarParaAtualizar(ref, onAtualizar) {
  const [puxado, setPuxado] = useState(0)
  const [atualizando, setAtualizando] = useState(false)
  const onRef = useRef(onAtualizar)
  useEffect(() => { onRef.current = onAtualizar })
  const atualizandoRef = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let inicioY = null
    let inicioX = 0
    let ativo = false
    let dist = 0

    const listaInternaRolada = (alvo) => {
      for (let n = alvo; n && n !== el; n = n.parentElement) if (n.scrollTop > 0) return true
      return false
    }
    const inicio = (e) => {
      inicioY = null
      if (!onRef.current || atualizandoRef.current || e.touches.length !== 1 || el.scrollTop > 0) return
      if (haModalAberto() || listaInternaRolada(e.target)) return
      inicioY = e.touches[0].clientY
      inicioX = e.touches[0].clientX
      ativo = false
      dist = 0
    }
    const mover = (e) => {
      if (inicioY == null) return
      const dy = e.touches[0].clientY - inicioY
      const dx = e.touches[0].clientX - inicioX
      if (!ativo) {
        if (dy < -2 || Math.abs(dx) > Math.max(10, dy) || el.scrollTop > 0) { inicioY = null; return }
        if (dy < FOLGA) return
        ativo = true
      }
      e.preventDefault() // segura o "quique" nativo enquanto puxa
      dist = Math.min(MAX_PUXAR, (dy - FOLGA) * 0.5)
      setPuxado(dist)
    }
    const fim = async () => {
      const puxou = inicioY != null && ativo
      inicioY = null
      ativo = false
      if (!puxou) return
      if (dist < LIMIAR_PUXAR) { setPuxado(0); return }
      atualizandoRef.current = true
      setAtualizando(true)
      setPuxado(48)
      try {
        await onRef.current?.()
      } finally {
        atualizandoRef.current = false
        setAtualizando(false)
        setPuxado(0)
      }
    }

    el.addEventListener('touchstart', inicio, { passive: true })
    el.addEventListener('touchmove', mover, { passive: false })
    el.addEventListener('touchend', fim)
    el.addEventListener('touchcancel', fim)
    return () => {
      el.removeEventListener('touchstart', inicio)
      el.removeEventListener('touchmove', mover)
      el.removeEventListener('touchend', fim)
      el.removeEventListener('touchcancel', fim)
    }
  }, [ref])

  return { puxado, atualizando }
}
