// Subtela ativa para o Guia da Tela: uma tela com partes que mudam por completo (seções de
// Configurações, modo Conciliação do Importar Fatura, extrato de uma conta…) avisa enquanto está
// montada qual guia vale — o "?" do cabeçalho e a abertura automática passam a usar esse id.
//
//   useSubtelaGuia('settings:perfis')   // dentro do componente da subtela
//
// O id precisa existir em AJUDA_TELAS (src/lib/ajudaTelas.js); sem texto, vale o guia da página.
import { useEffect, useSyncExternalStore } from 'react'

const pilha = [] // subtelas montadas, a última vale
const ouvintes = new Set()
const avisar = () => { for (const f of ouvintes) f() }

export function useSubtelaGuia(id) {
  useEffect(() => {
    if (!id) return
    const marca = { id }
    pilha.push(marca)
    avisar()
    return () => {
      const i = pilha.indexOf(marca)
      if (i >= 0) pilha.splice(i, 1)
      avisar()
    }
  }, [id])
}

const assinar = (f) => { ouvintes.add(f); return () => ouvintes.delete(f) }
const atual = () => (pilha.length ? pilha[pilha.length - 1].id : null)
export function useSubtelaAtiva() {
  return useSyncExternalStore(assinar, atual, () => null)
}
