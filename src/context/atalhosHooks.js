import { createContext, useContext, useEffect, useId, useRef } from 'react'
import { textoCombinacao } from '../lib/atalhos/combinacao'

// Contextos e hooks do motor de atalhos (o provider está em ./AtalhosContext.jsx).
export const AtalhosContext = createContext(null)
// Id da camada de modal em que o componente está (null = fora de modal).
export const CamadaContext = createContext(null)

export const useAtalhos = () => useContext(AtalhosContext)

// Registra `handler` para a ação enquanto o componente estiver montado e `habilitado`.
export function useAtalho(acaoId, handler, habilitado = true) {
  const registrar = useContext(AtalhosContext)?.registrar
  const camada = useContext(CamadaContext)
  const fnRef = useRef(handler)
  useEffect(() => { fnRef.current = handler })
  useEffect(() => {
    if (!registrar || !habilitado) return
    return registrar({ acaoId, fnRef, camada })
  }, [registrar, acaoId, camada, habilitado])
}

// Camada de modal: o <Modal> chama com o ref do painel enquanto aberto e envolve o conteúdo com
// <CamadaContext.Provider value={id}>. Devolve o id da camada.
export function useCamadaModal(open, ref) {
  const registrarCamada = useContext(AtalhosContext)?.registrarCamada
  const id = useId()
  useEffect(() => {
    if (!open || !registrarCamada) return
    return registrarCamada(id, ref)
  }, [open, registrarCamada, id, ref])
  return id
}

// "Novo Lançamento (Alt+N)" para o title do botão; sem atalho (ou no mobile), só o rótulo.
export function useTituloAtalho(rotulo, acaoId) {
  const ctx = useContext(AtalhosContext)
  const combinacao = ctx?.ativo ? ctx.mapa[acaoId] : null
  return combinacao ? `${rotulo} (${textoCombinacao(combinacao)})` : rotulo
}
