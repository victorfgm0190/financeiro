import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { registrarTrabalho, removerTrabalho, assinarTrabalhos, trabalhosEmAndamento } from '../lib/trabalhoEmAndamento'

// A tela informa que tem algo NÃO gravado enquanto `ativo` (e a frase do que é). Sai do registro quando
// `ativo` vira false (Confirmar / Cancelar / Salvar) ou a tela/janela fecha. Ver lib/trabalhoEmAndamento.
export function useTrabalhoEmAndamento(chave, ativo, frase) {
  const sufixo = useId()
  const id = `${chave}:${sufixo}`
  useEffect(() => {
    if (!ativo) return undefined
    registrarTrabalho(id, frase)
    return () => removerTrabalho(id)
  }, [id, ativo, frase])
}

// Lista atual ({ id, frase }[]) — para o aviso de atualização.
export function useTrabalhosEmAndamento() {
  return useSyncExternalStore(assinarTrabalhos, trabalhosEmAndamento, trabalhosEmAndamento)
}

// O valor (estado do formulário) mudou desde que ele terminou de abrir? Guarda a "foto" um instante
// depois de montar (efeitos de abertura ainda preenchem padrões) e compara pelo JSON.
export function useAlteradoDesdeAbertura(valor, espera = 400) {
  const json = JSON.stringify(valor ?? null)
  const atual = useRef(json)
  useEffect(() => { atual.current = json })
  const [base, setBase] = useState(null)
  useEffect(() => {
    const t = setTimeout(() => setBase(b => b ?? atual.current), espera)
    return () => clearTimeout(t)
  }, [espera])
  return base != null && json !== base
}
