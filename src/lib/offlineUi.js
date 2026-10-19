// Detalhes de tela do modo sem internet (sem React, testáveis).

// A partir daqui o painel pede para conectar e baixar uma cópia das pendências.
export const LIMITE_AVISO_FILA = 500

// iPhone/iPad no Safari SEM o app instalado: ali o iOS pode apagar os dados guardados do site após
// alguns dias sem uso. Instalado (Tela de Início), navigator.standalone é true.
export function ehIphoneSemInstalar(nav = globalThis.navigator, win = globalThis.window) {
  if (!nav) return false
  const ua = String(nav.userAgent || '')
  const ios = /iPhone|iPad|iPod/.test(ua) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
  if (!ios) return false
  const standalone = nav.standalone === true || !!win?.matchMedia?.('(display-mode: standalone)')?.matches
  return !standalone
}

// Texto curto do indicador.
export function textoIndicador({ online, pendentes }) {
  if (!online) return pendentes ? `Sem internet · ${pendentes} aguardando envio` : 'Sem internet · gravando no aparelho'
  if (pendentes) return `${pendentes} ${pendentes === 1 ? 'alteração aguardando' : 'alterações aguardando'} envio`
  return 'Tudo sincronizado'
}
