// INSTALAR O FINUP (PWA) — detecção do aparelho e o pedido de instalação do Chrome/Android.
// Usado pela página /instalar. O manifest é relativo ("/"), então instalar a partir de
// <sigla>.finup.app.br abre aquele ambiente.

// iPhone/iPad (inclusive iPad que se apresenta como Mac), Android ou computador. No iPhone, só o
// Safari instala (Chrome/Firefox/Edge do iOS não têm "Adicionar à Tela de Início" confiável).
export function detectarAparelho(ua = '', { maxTouchPoints = 0 } = {}) {
  const s = String(ua)
  const ios = /iPhone|iPad|iPod/i.test(s) || (/Macintosh/i.test(s) && maxTouchPoints > 1)
  if (ios) {
    const outroNavegador = /CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|Instagram|FBAN|FBAV/i.test(s)
    return { tipo: 'iphone', safari: !outroNavegador }
  }
  if (/Android/i.test(s)) return { tipo: 'android', chrome: /Chrome\//i.test(s) && !/EdgA|SamsungBrowser|OPR\//i.test(s) }
  return { tipo: 'computador' }
}

// Já aberto como app instalado?
export function estaInstalado(win = typeof window !== 'undefined' ? window : null) {
  if (!win) return false
  return !!(win.matchMedia?.('(display-mode: standalone)').matches || win.navigator?.standalone)
}

// O Chrome dispara 'beforeinstallprompt' cedo (antes da página montar): guardamos o evento aqui
// (chamado no src/main.jsx). Só na /instalar o padrão é adiado, para o botão "Instalar agora";
// nas outras telas o navegador segue com o comportamento dele.
let pedido = null
const ouvintes = new Set()
export function capturarPedidoDeInstalacao(win = window) {
  win.addEventListener('beforeinstallprompt', (e) => {
    if (win.location.pathname.replace(/\/+$/, '') === '/instalar') e.preventDefault()
    pedido = e
    ouvintes.forEach(f => f(e))
  })
  win.addEventListener('appinstalled', () => { pedido = null; ouvintes.forEach(f => f(null)) })
}
export const pedidoDeInstalacao = () => pedido
export function aoMudarPedido(f) {
  ouvintes.add(f)
  return () => ouvintes.delete(f)
}
// Abre o diálogo de instalação do navegador. Devolve 'accepted' | 'dismissed' | null.
export async function pedirInstalacao() {
  if (!pedido) return null
  const e = pedido
  pedido = null
  await e.prompt()
  const escolha = await e.userChoice.catch(() => null)
  return escolha?.outcome ?? null
}
