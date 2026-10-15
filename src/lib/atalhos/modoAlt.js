// Modo "segurar Alt" (estilo KeyTips do Office): segurar SÓ a tecla Alt por `atraso` ms liga o
// realce dos selos de atalho; soltar o Alt, apertar qualquer outra tecla (o Alt+G de um atalho, por
// exemplo) ou a janela perder o foco desliga. Só observa os eventos — nunca chama preventDefault,
// então não interfere no disparo dos atalhos nem no menu do navegador.
//
// `aoMudar(ligado)` é chamado só quando o estado muda. `agendar`/`cancelar` são injetáveis (testes).
export function criarModoAlt({ aoMudar, atraso = 400, agendar = setTimeout, cancelar = clearTimeout }) {
  let timer = null
  let ligado = false

  const desligar = () => {
    if (timer) { cancelar(timer); timer = null }
    if (ligado) { ligado = false; aoMudar(false) }
  }

  return {
    keydown(e) {
      // AltGr (ABNT2) chega como Ctrl+Alt ou key 'AltGraph': não é "Alt sozinho".
      if (e.key === 'Alt' && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
        if (e.repeat || timer || ligado) return
        timer = agendar(() => { timer = null; ligado = true; aoMudar(true) }, atraso)
        return
      }
      desligar()
    },
    keyup(e) {
      if (e.key === 'Alt') desligar()
    },
    desligar,
  }
}
