import { useEffect, useSyncExternalStore } from 'react'
import { assinarAvisos, outroAvisoNaFrente, quererAviso } from '../lib/filaDeAvisos'

// Registra que o aviso `id` quer aparecer (`quer`) e diz se há outro de prioridade maior na frente
// (src/lib/filaDeAvisos.js). → { naFrente }
export function useVezDoAviso(id, quer) {
  useEffect(() => {
    quererAviso(id, quer)
    return () => quererAviso(id, false)
  }, [id, quer])
  const naFrente = useSyncExternalStore(assinarAvisos, () => outroAvisoNaFrente(id), () => false)
  return { naFrente }
}
