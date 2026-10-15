// "Olho" de ocultar valores do mobile: preferência do aparelho (localStorage), ligada no Início e
// respeitada pelas telas que mostram valores (Fluxo). Lida na montagem de cada tela.
export const OCULTAR_KEY = 'finup:mobile:ocultarValores'
export const MASCARA = 'R$ ••••'

export function lerOcultar() {
  try { return localStorage.getItem(OCULTAR_KEY) === '1' } catch { return false }
}

export function gravarOcultar(ocultar) {
  try { localStorage.setItem(OCULTAR_KEY, ocultar ? '1' : '0') } catch { /* sem storage */ }
}
