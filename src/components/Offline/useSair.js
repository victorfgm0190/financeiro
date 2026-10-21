import { useState } from 'react'
import { useApp } from '../../context/AppContext'
import { clearTokenAndRedirect } from '../../lib/api'

// "Sair" (sidebar, topo, menu Mais): encerra a sessão DIRETO, sem pergunta. Antes tenta enviar a
// fila de pendências; sem internet ela fica guardada no aparelho (o cache também) e vai no próximo
// login do mesmo usuário. Sem token, o app volta ao Login e nada do cache aparece antes de entrar.
export function useSair() {
  const { sincronizarAntesDeSair } = useApp()
  const [saindo, setSaindo] = useState(false)
  const sair = async () => {
    if (saindo) return
    setSaindo(true)
    try { await sincronizarAntesDeSair() } catch { /* a fila continua no aparelho */ }
    clearTokenAndRedirect()
  }
  return { sair, saindo }
}
