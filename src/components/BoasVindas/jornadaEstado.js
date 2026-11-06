// Passo da JORNADA em andamento (só na memória desta aba): qual passo a pessoa abriu pelo painel e como
// terminou o tour dele. A barra flutuante (JornadaBarra) mostra esse passo em qualquer tela. O que fica
// GRAVADO (feita, pulada, não se aplica) vai para o banco (boas_vindas_usuario.progresso), nunca para
// o navegador.
import { useSyncExternalStore } from 'react'
import { navegarPara } from '../../lib/abrirTela'
import { iniciarTour, iniciarTarefa, suprimirTourAutomatico } from './tourEstado'
import { tarefaDisponivel, tarefaPorId } from '../../lib/tarefasGuiadas'
import { ESPERA_TOUR_MS } from './useGuiaTela'

let ativo = null // id do passo
// Tour do passo: 'aguardando' (abrindo a tela) | 'concluido' (foi até o fim) | 'fechado' (saiu no meio) | null.
let fimTour = null
const ouvintes = new Set()
const avisar = () => { for (const f of ouvintes) f() }
const assinar = (f) => { ouvintes.add(f); return () => ouvintes.delete(f) }

export const passoJornadaAtivo = () => ativo
export const fimTourJornada = () => fimTour
export function usePassoJornadaAtivo() {
  return useSyncExternalStore(assinar, passoJornadaAtivo, () => null)
}
export function useFimTourJornada() {
  return useSyncExternalStore(assinar, fimTourJornada, () => null)
}
export function registrarFimTourJornada(resultado) { fimTour = resultado; avisar() }
export function encerrarPassoJornada() {
  ativo = null
  fimTour = null
  suprimirTourAutomatico(false)
  avisar()
}
export const _reiniciarJornada = encerrarPassoJornada

// Abre o passo: leva à tela e liga o motor certo, mesmo com os guias das telas desligados ou a tela
// marcada como oculta (sem mudar essas preferências).
//   conhecer → tour da tela (começa no item `guiaChave`, se houver);
//   fazer    → "Faça comigo" (a tarefa navega sozinha); sem tarefa disponível neste aparelho/permissão,
//              o formulário/tela de antes (`executar` do checklist).
export function abrirPassoJornada(passo, { ctx, celular = false, executar } = {}) {
  if (!passo) return
  ativo = passo.id
  fimTour = passo.tipo === 'conhecer' && passo.guia ? 'aguardando' : null
  suprimirTourAutomatico(true)
  avisar()
  if (passo.tipo === 'fazer') {
    const t = tarefaPorId(passo.tarefa)
    if (tarefaDisponivel(t, ctx, { celular })) { iniciarTarefa(t.id, { jornada: true }); return }
    if (!executar || ['lancamento', 'funcao-reserva'].includes(passo.acao)) { navegarPara(passo.tela, passo.hash ? { hash: passo.hash } : {}); return }
    executar(passo.acao)
    return
  }
  navegarPara(passo.tela, passo.hash ? { hash: passo.hash } : {})
  if (passo.guia) {
    setTimeout(() => {
      if (ativo !== passo.id) return
      fimTour = null
      iniciarTour(passo.guia, { chave: passo.guiaChave || null, jornada: true })
      avisar()
    }, ESPERA_TOUR_MS)
  }
}
