// Partes puras da tarefa guiada (testáveis sem tela).
import { INICIO_NO_CELULAR } from '../../lib/tarefasGuiadas'

export const ESPERA_ELEMENTO_MS = 8000
export const PAUSA_DIGITACAO_MS = 1500

// Passos para este aparelho: no celular, o botão "+ Novo" do computador vira o "+" da barra + ação.
export function passosDaTarefa(t, { celular = false } = {}) {
  if (!t) return []
  const inicio = celular ? INICIO_NO_CELULAR[t.passos[0]?.alvo] : null
  if (!inicio) return t.passos
  return [
    { alvo: 'mobile.novo', espera: 'clique', texto: inicio.texto },
    { alvo: `mobile.acao-${inicio.acao}`, espera: 'clique', texto: 'Agora escolha esta opção.' },
    ...t.passos.slice(1),
  ]
}

// Itens da coleção que não estavam no começo da tarefa e passam no filtro.
export function itemNovo(lista, idsAntes, filtro) {
  return (lista || []).find(x => x && !idsAntes.has(x.id) && (!filtro || filtro(x))) || null
}
