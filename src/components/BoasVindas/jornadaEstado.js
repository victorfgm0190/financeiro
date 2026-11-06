// Passo da JORNADA em andamento (só na memória desta aba): qual passo a pessoa abriu pelo painel.
// A barra flutuante (JornadaBarra) mostra esse passo em qualquer tela — "Entendi ✔" para os de
// conhecer; para os de fazer, conclui sozinho quando o dado aparece. O que fica GRAVADO (feita,
// pulada, não se aplica) vai para o banco (boas_vindas_usuario.progresso), nunca para o navegador.
import { useSyncExternalStore } from 'react'
import { navegarPara } from '../../lib/abrirTela'
import { iniciarTour, iniciarTarefa } from './tourEstado'
import { tarefaDisponivel, tarefaPorId } from '../../lib/tarefasGuiadas'
import { ESPERA_TOUR_MS } from './useGuiaTela'

let ativo = null // id do passo
const ouvintes = new Set()
const avisar = () => { for (const f of ouvintes) f() }
const assinar = (f) => { ouvintes.add(f); return () => ouvintes.delete(f) }

export const passoJornadaAtivo = () => ativo
export function usePassoJornadaAtivo() {
  return useSyncExternalStore(assinar, passoJornadaAtivo, () => null)
}
export function encerrarPassoJornada() { if (ativo) { ativo = null; avisar() } }
export function _reiniciarJornada() { ativo = null; avisar() }

// Abre o passo: leva à tela e liga o motor certo.
//   conhecer → tour da tela (começa no item `guiaChave`, se houver);
//   fazer    → "Faça comigo" (a tarefa navega sozinha); sem tarefa disponível neste aparelho/permissão,
//              o formulário/tela de antes (`executar` do checklist).
export function abrirPassoJornada(passo, { ctx, celular = false, executar } = {}) {
  if (!passo) return
  ativo = passo.id
  avisar()
  if (passo.tipo === 'fazer') {
    const t = tarefaPorId(passo.tarefa)
    if (tarefaDisponivel(t, ctx, { celular })) { iniciarTarefa(t.id); return }
    if (passo.acao === 'lancamento' || !executar) { navegarPara(passo.tela, passo.hash ? { hash: passo.hash } : {}); return }
    executar(passo.acao)
    return
  }
  navegarPara(passo.tela, passo.hash ? { hash: passo.hash } : {})
  if (passo.guia) setTimeout(() => iniciarTour(passo.guia, { chave: passo.guiaChave || null }), ESPERA_TOUR_MS)
}
