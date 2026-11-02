// Estado ÚNICO do guia interativo (tour da tela hoje; tarefas guiadas usam o mesmo motor depois):
// um por vez, em qualquer tela. Quem desenha é o GuiaInterativo (montado uma vez no App).
//   iniciarTour(tela, { chave })  → começa o tour da tela (opcional: já no item `chave`)
//   encerrarTour()                → fecha sem marcar nada (ex.: a pessoa trocou de tela no meio)
import { useSyncExternalStore } from 'react'

let ativo = null // { tipo: 'tour', tela, chave, id }
let seq = 0
const ouvintes = new Set()
const avisar = () => { for (const f of ouvintes) f() }

export function iniciarTour(tela, { chave = null } = {}) {
  if (!tela) return
  ativo = { tipo: 'tour', tela, chave, id: ++seq }
  avisar()
}
export function encerrarTour() {
  if (!ativo) return
  ativo = null
  avisar()
}
// Fecha só se o tour aberto for desta tela (a tela saiu de cena).
export function encerrarTourDaTela(tela) {
  if (ativo?.tela === tela) encerrarTour()
}
export const tourAtivo = () => ativo
const assinar = (f) => { ouvintes.add(f); return () => ouvintes.delete(f) }
export function useTourAtivo() {
  return useSyncExternalStore(assinar, tourAtivo, () => null)
}
export function _reiniciarTour() { ativo = null; avisar() }
