// ── F1 = AJUDA (fixa e exclusiva) ────────────────────────────────────────────────────────────────
// Ouvinte global na fase de CAPTURA: a F1 nunca chega ao navegador (ajuda do Chrome/Edge) nem a
// outro atalho do app — sempre preventDefault + stopPropagation.
//   • foco num campo com data-help-id (ele ou um contêiner) → help do campo;
//   • sem campo, dentro de um formulário (data-help-form) → ajuda do formulário;
//   • fora de formulário → ajuda da tela;
//   • F1 com Ctrl/Alt/Shift/Meta → não faz nada (mas também não vaza).
// No Mac a tecla chega como F1 com fn (fn não é modificador no evento).
import { abrirHelpCampo, abrirHelpFormulario, abrirAjudaTelaNoPainel, idHelpDe, idFormDe, formAberto, pedirAjudaDaTela } from './helpCampoEstado.js'

// Ajuda da tela: o "?" do cabeçalho; sem ele (guias desligados), o painel com o atalho para a Central.
const ajudaDaTela = () => { if (!pedirAjudaDaTela()) abrirAjudaTelaNoPainel() }

export const ehF1 = (e) => e?.key === 'F1' || e?.code === 'F1' || e?.keyCode === 112

// Trata o keydown. → 'campo' | 'formulario' | 'tela' | 'ignorado' | null (não era F1).
export function tratarTeclaF1(e, { abrirCampo = abrirHelpCampo, abrirForm = abrirHelpFormulario, abrirTela = ajudaDaTela, alvo = null } = {}) {
  if (!ehF1(e)) return null
  e.preventDefault()
  // Gravando um atalho (Configurações › Atalhos): a F1 segue para a tela de captura, que a recusa.
  if (typeof document !== 'undefined' && document.body?.dataset?.capturandoAtalho) return 'captura'
  e.stopPropagation()
  e.stopImmediatePropagation?.()
  if (e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return 'ignorado'
  if (e.repeat) return 'ignorado'
  const el = alvo || (typeof document !== 'undefined' ? document.activeElement : null)
  const id = idHelpDe(el)
  if (id && abrirCampo(id, { origem: 'f1' })) return 'campo'
  const form = idFormDe(el) || formAberto()
  if (form && abrirForm(form, { origem: 'f1' })) return 'formulario'
  abrirTela()
  return 'tela'
}

// Instala uma vez (App). → função para remover.
export function instalarTeclaF1(opcoes) {
  if (typeof window === 'undefined') return () => {}
  const fn = (e) => { tratarTeclaF1(e, opcoes) }
  window.addEventListener('keydown', fn, true)
  // Navegadores antigos disparam 'help' (F1) além do keydown.
  const ajuda = (e) => e.preventDefault()
  window.addEventListener('help', ajuda, true)
  return () => { window.removeEventListener('keydown', fn, true); window.removeEventListener('help', ajuda, true) }
}
