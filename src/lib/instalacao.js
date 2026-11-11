// INSTALAR O FINUP (PWA) — detecção do aparelho e o pedido de instalação do Chrome/Android.
// Usado pela página /instalar e pelo aviso "Use como aplicativo" do computador. O manifest é relativo ("/"), então instalar a partir de
// <sigla>.finup.app.br abre aquele ambiente.
import { rodandoInstalado } from './ambienteNavegador.js'
import { marcarAppInstalado } from './avisoAplicativo.js'

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

// Já aberto como app instalado? (janela própria, inclusive window-controls-overlay no computador)
export function estaInstalado(win = typeof window !== 'undefined' ? window : null) {
  return rodandoInstalado(win)
}

// O Chrome/Edge dispara 'beforeinstallprompt' cedo (antes da página montar): guardamos o evento aqui
// (chamado no src/main.jsx) para o botão "Instalar agora" (/instalar) e "Instalar o Finup" (aviso e
// Configurações no computador). Na /instalar e no computador o padrão é adiado (o botão abre a
// instalação); no celular, fora da /instalar, o navegador segue com o comportamento dele.
// Instalou (appinstalled): o aviso "Use como aplicativo" não volta mais neste aparelho.
let pedido = null
const ouvintes = new Set()
export function capturarPedidoDeInstalacao(win = window) {
  win.addEventListener('beforeinstallprompt', (e) => {
    const naInstalar = win.location.pathname.replace(/\/+$/, '') === '/instalar'
    const computador = detectarAparelho(win.navigator?.userAgent, { maxTouchPoints: win.navigator?.maxTouchPoints }).tipo === 'computador'
    if (naInstalar || computador) e.preventDefault()
    pedido = e
    ouvintes.forEach(f => f(e))
  })
  win.addEventListener('appinstalled', () => { pedido = null; marcarAppInstalado(); ouvintes.forEach(f => f(null)) })
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
