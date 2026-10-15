import { useEffect } from 'react'
import { useAtalhos } from '../../context/atalhosHooks'
import { criarModoAlt } from '../../lib/atalhos/modoAlt'

const ATRIBUTO = 'data-atalhos-alt'

// Segurar só o Alt (~400 ms) realça os selos de atalho (ShortcutHint) da tela, via atributo no
// <html> lido pelo CSS (.atalho-hint). Escuta na fase de captura e sem preventDefault: não muda o
// disparo dos atalhos (AtalhosContext) nem o comportamento do navegador. Só no computador.
export default function ModoAltAtalhos() {
  const ativo = !!useAtalhos()?.ativo

  useEffect(() => {
    if (!ativo) return
    const raiz = document.documentElement
    const modo = criarModoAlt({ aoMudar: (ligado) => raiz.toggleAttribute(ATRIBUTO, ligado) })
    const onVisibilidade = () => { if (document.hidden) modo.desligar() }
    window.addEventListener('keydown', modo.keydown, true)
    window.addEventListener('keyup', modo.keyup, true)
    window.addEventListener('blur', modo.desligar)
    document.addEventListener('visibilitychange', onVisibilidade)
    return () => {
      window.removeEventListener('keydown', modo.keydown, true)
      window.removeEventListener('keyup', modo.keyup, true)
      window.removeEventListener('blur', modo.desligar)
      document.removeEventListener('visibilitychange', onVisibilidade)
      modo.desligar()
      raiz.removeAttribute(ATRIBUTO)
    }
  }, [ativo])

  return null
}
