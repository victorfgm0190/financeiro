import { useEffect, useRef } from 'react'
import { guardarPreLancamento } from '../../lib/assistenteApi'

// Prévia do Assistente fechada SEM confirmar (Cancelar, X, fundo, Esc — qualquer caminho) → guarda
// em ia_pre_lancamentos ('pendente'). Roda no desmonte; o timer sobrevive ao mount/unmount de teste
// do StrictMode (o novo mount o cancela). Já veio de um pré-lançamento (`preId`) → não duplica.
// `marcar('salvo' | 'descartado')` antes de fechar impede a gravação.
export function usePreLancamentoAoFechar({ tipo, payload, textoOriginal, preId, onToast }) {
  const desfecho = useRef(null)
  const timer = useRef(null)
  const dados = useRef({ tipo, payload, textoOriginal, preId, onToast })
  useEffect(() => { dados.current = { tipo, payload, textoOriginal, preId, onToast } })

  useEffect(() => {
    clearTimeout(timer.current)
    return () => {
      timer.current = setTimeout(() => {
        const d = dados.current
        if (desfecho.current || d.preId) return
        guardarPreLancamento(d.tipo, d.payload, d.textoOriginal)
          .then(() => d.onToast?.('Guardado em pré-lançamentos para revisar depois.'))
          .catch(err => d.onToast?.(`Não consegui guardar o pré-lançamento: ${err.message}`))
      }, 0)
    }
  }, [])

  return { marcar: (valor) => { desfecho.current = valor } }
}
