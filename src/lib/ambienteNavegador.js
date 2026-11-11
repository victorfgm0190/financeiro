// AMBIENTE DO NAVEGADOR (computador) — o que este navegador consegue fazer com o Finup, sempre por
// RECURSO (nunca só pelo nome do navegador):
//   • rodando instalado como aplicativo? (display-mode standalone / window-controls-overlay; no Mac,
//     navigator.standalone)
//   • dá para instalar? (o navegador tem o evento beforeinstallprompt — Chrome e Edge; o evento em si,
//     guardado por src/lib/instalacao.js, é o que abre a instalação pelo botão)
//   • dá para gravar o backup numa pasta? (showDirectoryPicker — backupPasta.suportaPasta). O bloqueio
//     por política/permissão continua tratado na tela de Backup.
//   • navegador sem o mínimo para abrir o Finup (Internet Explorer ou muito antigo): página simples
//     antes de carregar o app (scriptNavegadorSemSuporte, injetado no index.html pelo vite.config.js).
// Puro: tudo recebe a janela (`win`) para os testes. Nada específico de cliente.
import { suportaPasta } from './backupPasta.js'

export const LINK_EDGE = 'https://www.microsoft.com/pt-br/edge/download'
export const LINK_CHROME = 'https://www.google.com/intl/pt-BR/chrome/'

const janela = () => (typeof window !== 'undefined' ? window : null)

// Aberto na janela própria do aplicativo instalado?
export function rodandoInstalado(win = janela()) {
  if (!win) return false
  const mm = (q) => { try { return !!win.matchMedia?.(q)?.matches } catch { return false } }
  return mm('(display-mode: standalone)') || mm('(display-mode: window-controls-overlay)') || win.navigator?.standalone === true
}

// O navegador sabe instalar sites como aplicativo pelo próprio botão do Finup (Chrome, Edge)?
export function suportaInstalar(win = janela()) {
  return !!win && ('onbeforeinstallprompt' in win || typeof win.BeforeInstallPromptEvent === 'function')
}

// Safari do Mac: não tem o botão de instalar, mas instala por "Arquivo → Adicionar ao Dock". Sem o
// recurso de instalação E com cara de Safari no Mac (o nome sozinho não decide nada).
export function safariDoMac(win = janela()) {
  if (!win || suportaInstalar(win)) return false
  const ua = String(win.navigator?.userAgent || '')
  const toque = Number(win.navigator?.maxTouchPoints || 0) > 1 // iPad que se apresenta como Mac
  return /Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|Firefox|FxiOS|Edg|OPR/.test(ua) && !toque
}

// Situação deste navegador. `pedido`: o evento beforeinstallprompt guardado (instalacao.js).
//   modo 'instalado'      → aberto como aplicativo
//   modo 'instalavel'     → o botão "Instalar o Finup" abre a instalação do navegador
//   modo 'pelo-menu'      → o navegador instala, mas ainda não ofereceu (ou o Finup já está instalado
//                           e aberto numa aba): instalar pelo menu do navegador
//   modo 'safari-mac'     → "Arquivo → Adicionar ao Dock"; backup em pasta só no Edge/Chrome
//   modo 'sem-instalacao' → não instala (ex.: Firefox): recomenda Edge ou Chrome
export function situacaoDoNavegador(win = janela(), { pedido = null } = {}) {
  const instalado = rodandoInstalado(win)
  const instala = suportaInstalar(win)
  const mac = safariDoMac(win)
  const gravaEmPasta = suportaPasta(win)
  const modo = instalado ? 'instalado'
    : pedido ? 'instalavel'
      : instala ? 'pelo-menu'
        : mac ? 'safari-mac'
          : 'sem-instalacao'
  return { modo, instalado, suportaInstalar: instala, podeInstalarAgora: !instalado && !!pedido, safariMac: mac, gravaEmPasta }
}

// ── Navegador sem suporte mínimo ──────────────────────────────────────────────────────────────────
// ESCRITA EM ES5 DE PROPÓSITO (var, function, sem =>, sem crase): o texto desta função vai para um
// <script> comum no index.html e precisa ser lido pelo Internet Explorer. O teste confere.
// O mínimo = o que o app usa para abrir: módulos JS, Promise/fetch e cores CSS modernas (color-mix,
// base do visual — Chrome/Edge 111+, Firefox 113+, Safari 16.2+). Devolve true quando NÃO dá.
export function navegadorSemSuporte(w) {
  try {
    var d = w.document
    if (d && d.documentMode) return true // Internet Explorer
    if (typeof w.Promise !== 'function' || typeof w.fetch !== 'function') return true
    var s = d && d.createElement ? d.createElement('script') : null
    if (!s || !('noModule' in s)) return true // sem módulos JS
    if (!w.CSS || typeof w.CSS.supports !== 'function') return true
    if (!w.CSS.supports('color', 'color-mix(in srgb, red, blue)')) return true
    return false
  } catch (e) { // eslint-disable-line no-unused-vars -- o IE exige o nome no catch
    return false // na dúvida, deixa o app tentar abrir
  }
}

// Página mostrada no lugar do app (HTML simples, sem React, estilos no próprio elemento).
export function paginaNavegadorSemSuporte() {
  const link = (href, texto) => `<a href="${href}" target="_blank" rel="noopener" style="display:inline-block;margin:6px 8px 0 0;padding:10px 16px;border-radius:8px;background:#0F6E56;color:#fff;text-decoration:none;font-weight:600">${texto}</a>`
  return '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;margin:48px auto;padding:24px;color:#111;background:#fff;border:1px solid #ddd;border-radius:12px;line-height:1.5">'
    + '<h1 style="font-size:22px;margin:0 0 12px">Este navegador não é compatível com o Finup</h1>'
    + '<p style="margin:0 0 8px">O Finup precisa de um navegador atualizado para abrir. Use o Microsoft Edge (já vem no Windows) ou o Google Chrome.</p>'
    + '<p style="margin:0 0 8px">Se um deles já está instalado, abra-o e entre de novo neste mesmo endereço.</p>'
    + `<p style="margin:12px 0 0">${link(LINK_EDGE, 'Baixar o Microsoft Edge')}${link(LINK_CHROME, 'Baixar o Google Chrome')}</p>`
    + '</div>'
}

// O <script> que vai no <head> do index.html (vite.config.js): roda antes do app; sem suporte, marca
// window.__finupSemSuporte (o src/main.jsx não monta o app) e troca a página pela mensagem.
export function scriptNavegadorSemSuporte() {
  return '(function(){var w=window;'
    + `if(!(${navegadorSemSuporte.toString()})(w))return;`
    + 'w.__finupSemSuporte=true;'
    + `var h=${JSON.stringify(paginaNavegadorSemSuporte())};`
    + 'var p=function(){document.body.innerHTML=h;document.body.style.background="#f3f4f6"};'
    + 'if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",p);else p();'
    + '})();'
}
