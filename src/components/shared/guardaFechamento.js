import { createContext, useContext, useEffect, useRef } from 'react'

// Guarda de fechamento: um filho registra `podeFechar()` (ex.: "Descartar alterações não
// salvas?"); X, fundo e Esc só fecham se todas as guardas devolverem true. Fora de um Modal é no-op.
export const GuardaFechamentoContext = createContext(null)
export function useGuardaFechamento(podeFechar) {
  const registrar = useContext(GuardaFechamentoContext)
  const ref = useRef(podeFechar)
  useEffect(() => { ref.current = podeFechar })
  useEffect(() => (registrar ? registrar(() => ref.current()) : undefined), [registrar])
}
