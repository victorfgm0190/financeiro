// ── Help de campo (camada leve de ajuda) — ADAPTADOR ───────────────────────────────────────────────
// O conteúdo mora em src/help/ (base nova: título, para que serve, relação com a tela…). Aqui fica
// só a forma antiga, para quem já usa: HELP_CAMPOS[tela][campo] e textoHelpCampo('tela.campo')
// devolvem o `paraQueServe` (o texto do ícone ⓘ). Nada de texto neste arquivo.
import { CAMPOS } from '../help/index.js'

export const HELP_CAMPOS = Object.freeze(Object.entries(CAMPOS).reduce((acc, [id, c]) => {
  const [tela, campo] = id.split('.')
  ;(acc[tela] ||= {})[campo] = c.paraQueServe
  return acc
}, {}))

// 'tela.campo' → texto (ou '' se não existir).
export function textoHelpCampo(chave) {
  return CAMPOS[String(chave || '')]?.paraQueServe || ''
}
