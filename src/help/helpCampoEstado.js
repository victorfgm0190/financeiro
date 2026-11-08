// ── Estado do HELP DE CAMPO (um só no app) ───────────────────────────────────────────────────────
// Quem abre: a tecla F1 (teclaF1.js) e o ícone ⓘ (HelpCampo). Quem mostra: HelpCampoPainel (drawer
// lateral no computador, bottom sheet no celular). O painel acompanha o campo com foco enquanto
// estiver aberto. Sem React aqui: assinatura simples para o useSyncExternalStore.
import { helpDoCampo, helpDoFormulario } from './index.js'

// id: campo ('tela.campo'); form: formulário (roteiro); tela: só o atalho para a ajuda da tela.
let estado = { aberto: false, id: null, form: null, tela: false, origem: null }
const ouvintes = new Set()
const emitir = () => ouvintes.forEach(fn => fn())

export const lerHelpCampo = () => estado
export function assinarHelpCampo(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn) }

// Abre (ou troca) o help do campo `id` ('tela.campo'). Sem conteúdo na base: não abre (→ false).
export function abrirHelpCampo(id, { origem = 'f1' } = {}) {
  if (!helpDoCampo(id)) return false
  estado = { aberto: true, id, form: formDoCampoAtual(id), tela: false, origem }
  emitir()
  return true
}
// Help do FORMULÁRIO (objetivo, campos, ao salvar): F1 dentro de um formulário sem campo com foco.
export function abrirHelpFormulario(form, { origem = 'f1' } = {}) {
  if (!helpDoFormulario(form)) return false
  estado = { aberto: true, id: null, form, tela: false, origem }
  emitir()
  return true
}
// Sem "?" na tela (guias desligados) e fora de formulário: o painel aponta para a Central de Ajuda.
export function abrirAjudaTelaNoPainel({ origem = 'f1' } = {}) {
  estado = { aberto: true, id: null, form: null, tela: true, origem }
  emitir()
}
export function fecharHelpCampo() {
  if (!estado.aberto) return
  estado = { aberto: false, id: null, form: null, tela: false, origem: null }
  emitir()
}
// O formulário do campo com foco (para o rodapé "Preencher com guia"): o contêiner data-help-form.
function formDoCampoAtual(id) {
  if (typeof document === 'undefined') return estado.form
  const seguro = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id
  const el = document.activeElement?.closest?.(`[data-help-id="${seguro}"]`) || document.querySelector(`[data-help-id="${seguro}"]`)
  return idFormDe(el) || estado.form || null
}

// Atributo do campo: <input {...propsHelp('agendamento.amount')} />. Vazio sem id.
export const propsHelp = (id) => (id ? { 'data-help-id': id } : {})

// Formulário do elemento (contêiner data-help-form mais próximo), ou null.
export const idFormDe = (el) => (el && typeof el.closest === 'function' ? el.closest('[data-help-form]')?.getAttribute('data-help-form') || null : null)
// Formulário aberto na tela (o último de fora no DOM = o modal de cima; um formulário dentro de
// outro, como as taxas no contrato, só vale com o foco nele), ou null.
export function formAberto() {
  if (typeof document === 'undefined') return null
  const deFora = [...document.querySelectorAll('[data-help-form]')].filter(el => !el.parentElement?.closest('[data-help-form]'))
  return deFora.length ? deFora[deFora.length - 1].getAttribute('data-help-form') : null
}
// Id do help do elemento (ele mesmo ou o contêiner mais próximo com data-help-id), ou null.
export const idHelpDe = (el) => (el && typeof el.closest === 'function' ? el.closest('[data-help-id]')?.getAttribute('data-help-id') || null : null)

// macOS: a F1 é fn+F1 (a dica muda).
export function ehMac() {
  if (typeof navigator === 'undefined') return false
  const p = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || ''
  return /mac/i.test(p)
}

// Pede a ajuda da TELA (o "?" do cabeçalho, AjudaTela). → true se alguma tela atendeu.
export const EVENTO_AJUDA_TELA = 'finup:ajuda-tela'
export function pedirAjudaDaTela() {
  if (typeof window === 'undefined') return false
  const ev = new CustomEvent(EVENTO_AJUDA_TELA, { detail: { atendido: false } })
  window.dispatchEvent(ev)
  return ev.detail.atendido
}

// "Preencher com guia" (Etapa 4): o formulário aberto escuta e responde. → true se atendeu.
export const EVENTO_PREENCHER_GUIA = 'finup:preencher-guia'
export function pedirPreencherComGuia(idCampo) {
  if (typeof window === 'undefined') return false
  const ev = new CustomEvent(EVENTO_PREENCHER_GUIA, { detail: { idCampo, atendido: false } })
  window.dispatchEvent(ev)
  return ev.detail.atendido
}
