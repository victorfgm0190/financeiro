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

// Texto curto do indicador. Alteração recusada pelo servidor tem prioridade: precisa do usuário.
// `online` false = aparelho SEM REDE (dbStatus 'local'); `servidor` = há rede, mas a API não respondeu
// (dbStatus 'servidor') — nunca "Sem internet" nesse caso.
export const textoAguardando = (n) => `${n} ${n === 1 ? 'alteração aguardando' : 'alterações aguardando'} envio`
export function textoIndicador({ online, pendentes, erros = 0, servidor = false }) {
  if (erros) return `${erros} ${erros === 1 ? 'alteração com erro' : 'alterações com erro'} — ver detalhes`
  if (!online) return pendentes ? `Sem internet · ${textoAguardando(pendentes)}` : 'Sem internet · gravando no aparelho'
  if (servidor) return pendentes ? `Servidor sem resposta · ${textoAguardando(pendentes)}` : 'Servidor sem resposta · tentando de novo'
  if (pendentes) return textoAguardando(pendentes)
  return 'Tudo sincronizado'
}
