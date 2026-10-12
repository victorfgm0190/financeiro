import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { estadoSaldos, LIMITE_MS } from '../lib/saldosProntos'

// Abertura do app (carga do módulo): o limite de 15s conta daqui, não de cada tela montada.
const INICIO = Date.now()

// Estado dos saldos no mobile ('carregando' | 'pronto' | 'desatualizado') a partir do dbStatus
// do AppContext — o mesmo sinal que o Painel usa para o skeleton. Ver src/lib/saldosProntos.js.
export function useSaldosProntos() {
  const { dbStatus } = useApp()
  const [estourou, setEstourou] = useState(() => Date.now() - INICIO >= LIMITE_MS)

  useEffect(() => {
    if (dbStatus !== 'connecting' || estourou) return
    const t = setTimeout(() => setEstourou(true), Math.max(0, LIMITE_MS - (Date.now() - INICIO)))
    return () => clearTimeout(t)
  }, [dbStatus, estourou])

  return estadoSaldos(dbStatus, estourou ? LIMITE_MS : 0)
}
