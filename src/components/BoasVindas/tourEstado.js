// Estado ÚNICO do guia interativo — tour da tela OU tarefa guiada "Faça comigo": um por vez, em
// qualquer tela. Quem desenha é o GuiaInterativo (montado uma vez no App).
//   iniciarTour(tela, { chave })  → começa o tour da tela (opcional: já no item `chave`)
//   iniciarTarefa(id)             → começa a tarefa guiada (src/lib/tarefasGuiadas.js)
//   encerrarTour()                → fecha o que estiver aberto, sem marcar nada
import { useSyncExternalStore } from 'react'

let ativo = null // { tipo: 'tour' | 'tarefa', tela, chave, tarefaId, id }
let seq = 0
const ouvintes = new Set()
const avisar = () => { for (const f of ouvintes) f() }

export function iniciarTour(tela, { chave = null } = {}) {
  if (!tela) return
  ativo = { tipo: 'tour', tela, chave, id: ++seq }
  avisar()
}
export function iniciarTarefa(tarefaId, { tela = null } = {}) {
  if (!tarefaId) return
  ativo = { tipo: 'tarefa', tarefaId, tela, id: ++seq }
  avisar()
}
export function encerrarTour() {
  if (!ativo) return
  ativo = null
  avisar()
}
// Fecha só se o TOUR aberto for desta tela (a tela saiu de cena). Tarefa guiada atravessa telas.
export function encerrarTourDaTela(tela) {
  if (ativo?.tipo === 'tour' && ativo.tela === tela) encerrarTour()
}
export const tourAtivo = () => ativo
const assinar = (f) => { ouvintes.add(f); return () => ouvintes.delete(f) }
export function useTourAtivo() {
  return useSyncExternalStore(assinar, tourAtivo, () => null)
}
export function _reiniciarTour() { ativo = null; avisar() }
