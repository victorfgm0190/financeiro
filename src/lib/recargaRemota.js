// Recarga do banco sem sair do app (voltar à aba, puxar para atualizar, botão 🔄). Só as regras puras;
// a orquestração mora no AppContext (recarregarDoBanco), que reaproveita loadFromDb + aplicarCargaDoBanco.

// Modais/telas por cima do app. Todos os do Finup caem em pelo menos um: o Modal compartilhado e os
// próprios marcam data-modal-painel/aria-modal; BottomSheet/TelaCheia, aria-modal; os overlays
// avulsos (ImportPanel, SchedulePanel, ScheduleForm…) usam `fixed inset-0`.
export const SELETOR_MODAL = '[aria-modal="true"], [data-modal-painel], .fixed.inset-0'

const INPUT_SEM_TEXTO = new Set(['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'range', 'color', 'image'])

export function haModalAberto(doc = globalThis.document) {
  return !!doc?.querySelector?.(SELETOR_MODAL)
}

// Campo de formulário com foco (edição inline fora de modal, filtro sendo digitado…).
export function campoEmEdicao(doc = globalThis.document) {
  const el = doc?.activeElement
  if (!el || el === doc.body) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') return !INPUT_SEM_TEXTO.has(String(el.type || 'text').toLowerCase())
  return false
}

// Pode trocar o estado pelo do banco agora? Não com modal aberto, campo em edição ou alteração local
// ainda não enviada (a fila é reaplicada por aplicarCargaDoBanco, mas a regra é não recarregar com ela).
export function podeRecarregar({ pendentes = 0, enviando = false, doc = globalThis.document } = {}) {
  if (pendentes > 0 || enviando) return false
  return !haModalAberto(doc) && !campoEmEdicao(doc)
}

// Disparo duplo: focus e visibilitychange chegam juntos ao voltar para o app. Devolve uma função
// que só deixa passar uma chamada a cada `ms`.
export function criarJanela(ms = 2000, agora = () => Date.now()) {
  let ultimo = -Infinity
  return () => {
    const t = agora()
    if (t - ultimo < ms) return false
    ultimo = t
    return true
  }
}

// "Atualizado agora" / "há 1 min" / "há 2 h". null sem carga ainda.
export function textoAtualizadoHa(quando, agora = Date.now()) {
  if (!quando) return null
  const min = Math.floor(Math.max(0, agora - quando) / 60000)
  if (min < 1) return 'Atualizado agora'
  if (min < 60) return `Atualizado há ${min} min`
  const h = Math.floor(min / 60)
  return `Atualizado há ${h} h`
}

// Aviso depois de uma recarga: quantos registros chegaram diferentes do que estava na tela.
export function textoNovidades(n) {
  if (!n) return null
  return n === 1 ? 'Dados atualizados: 1 alteração recebida' : `Dados atualizados: ${n} alterações recebidas`
}
