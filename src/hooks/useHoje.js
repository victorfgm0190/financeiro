import { useEffect, useState } from 'react'
import { hojeStr } from '../lib/saldos'

// Data local de hoje (YYYY-MM-DD) que vira sozinha: com o app aberto de um dia para o outro, quem
// usa este valor como dependência de useMemo recalcula quando o dia muda. Confere a cada minuto
// (o timer pode atrasar com a aba em segundo plano) e ao voltar para o app (foco/aba visível).
// Enquanto o dia é o mesmo, o setState recebe a mesma string e não renderiza de novo.
const INTERVALO_MS = 60 * 1000

export function useHoje() {
  const [hoje, setHoje] = useState(() => hojeStr())
  useEffect(() => {
    const conferir = () => setHoje(hojeStr())
    const id = setInterval(conferir, INTERVALO_MS)
    const aoVoltar = () => { if (document.visibilityState !== 'hidden') conferir() }
    window.addEventListener('focus', conferir)
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', conferir)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [])
  return hoje
}
