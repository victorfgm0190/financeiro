import { useEffect, useRef, useState } from 'react'
import ConfirmDialog from './ConfirmDialog'
import { useGuardaFechamento } from './guardaFechamento'

// Fechar um formulário de cadastro com alteração NÃO salva: X, Esc, clique fora (guarda do Modal) e o
// Cancelar do próprio formulário perguntam "Descartar as alterações?" (Descartar / Continuar
// editando). Sem alteração, fecha direto. Esc dentro de uma lista aberta (busca de conta, categoria,
// favorecido) é da lista: ela marca o evento e o Modal não fecha.
//   alterado: boolean — há algo não salvo agora.
//   onClose:  fecha o formulário (o mesmo do Cancelar).
// → { pedirFechar, dialogo } — o Cancelar chama pedirFechar; `dialogo` vai no JSX do formulário.
export function useDescartarAlteracoes(alterado, onClose) {
  const [perguntando, setPerguntando] = useState(false)
  const alteradoRef = useRef(alterado)
  useEffect(() => { alteradoRef.current = alterado })
  const liberado = useRef(false)
  useGuardaFechamento(() => {
    if (liberado.current || !alteradoRef.current) return true
    setPerguntando(true)
    return false
  })
  const pedirFechar = () => {
    if (!alteradoRef.current) { onClose(); return }
    setPerguntando(true)
  }
  const dialogo = (
    <ConfirmDialog
      open={perguntando}
      onClose={() => setPerguntando(false)}
      onConfirm={() => { liberado.current = true; onClose() }}
      title="Descartar as alterações?"
      message="O que você preencheu ainda não foi salvo e será perdido."
      confirmLabel="Descartar"
      cancelLabel="Continuar editando"
      danger
    />
  )
  return { pedirFechar, dialogo }
}
