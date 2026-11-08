// Combinação de teclas no formato canônico "Ctrl+Alt+Shift+<tecla>" (modificadores nessa ordem).
// A tecla vem de KeyboardEvent.code (posição física: KeyN, Digit1…) e não de .key — assim Alt+N
// funciona igual no ABNT2 e no US, e Alt não troca a tecla por um caractere especial.

const MODIFICADORES = ['Ctrl', 'Alt', 'Shift']

const NOMEADAS = ['Enter', 'Space', 'Tab', 'Backspace', 'Delete', 'Insert', 'Home', 'End', 'PageUp', 'PageDown',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape']

// code → rótulo no teclado ABNT2 (o code é a posição no teclado US).
const PONTUACAO = {
  Minus: '-', Equal: '=', BracketLeft: '´', BracketRight: '[', Backslash: ']', Semicolon: 'Ç', Quote: '~',
  Backquote: "'", Comma: ',', Period: '.', Slash: ';', IntlRo: '/', IntlBackslash: '\\',
}

const ROTULOS = {
  Escape: 'Esc', Space: 'Espaço', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Delete: 'Del', Insert: 'Ins', PageUp: 'PgUp', PageDown: 'PgDn',
}

// RESERVED_KEYS — o navegador/sistema age antes da página (ou o usuário perde a aba/janela). No Mac,
// Cmd faz o papel do Ctrl nessas teclas: o motor ignora Cmd e o atalho nunca usa Cmd.
//   F1 é a AJUDA do Finup (fixa; src/help/teclaF1.js): nenhum atalho pode usar F1.
export const TECLA_AJUDA = 'F1'
export const RESERVED_KEYS = [
  'F3', 'F5', 'F6', 'F7', 'F11', 'F12', 'Ctrl+F5', 'Shift+F5', 'Ctrl+Shift+F5',
  'Ctrl+R', 'Ctrl+W', 'Ctrl+T', 'Ctrl+N', 'Ctrl+L', 'Ctrl+P', 'Ctrl+F', 'Ctrl+H', 'Ctrl+J', 'Ctrl+D', 'Ctrl+Tab', 'Ctrl+Shift+Tab',
  'Ctrl+Shift+R', 'Ctrl+Shift+T', 'Ctrl+Shift+N',
  'Alt+F4', 'Alt+ArrowLeft', 'Alt+ArrowRight', 'Alt+ArrowUp', 'Alt+ArrowDown',
  // Menus do navegador (Alt+letra abre o menu no Chrome/Edge/Firefox).
  'Alt+F', 'Alt+D', 'Alt+E',
]
// Nome antigo (mesma lista).
export const RESERVADAS = RESERVED_KEYS
// Teclas de função que podem ser atalho SOZINHAS (sem Ctrl/Alt).
export const F_SOZINHAS = ['F2', 'F4', 'F8', 'F9', 'F10']
export const FIXA_GRAVAR_MODAL = 'Ctrl+Enter'

// code do evento → tecla canônica; null para modificador sozinho ou tecla não suportada.
export function teclaDoCode(code) {
  if (!code) return null
  let m = /^Key([A-Z])$/.exec(code)
  if (m) return m[1]
  m = /^(?:Digit|Numpad)([0-9])$/.exec(code)
  if (m) return m[1]
  if (/^F([1-9]|1[0-2])$/.test(code)) return code
  if (code === 'NumpadEnter') return 'Enter'
  if (NOMEADAS.includes(code) || PONTUACAO[code]) return code
  return null
}

function teclaValida(t) {
  return /^[A-Z0-9]$/.test(t) || /^F([1-9]|1[0-2])$/.test(t) || NOMEADAS.includes(t) || !!PONTUACAO[t]
}

function montar(mods, tecla) {
  return [...MODIFICADORES.filter(m => mods.has(m)), tecla].join('+')
}

// KeyboardEvent → combinação canônica (null = só modificador / tecla não suportada).
export function combinacaoDoEvento(e) {
  const tecla = teclaDoCode(e?.code)
  if (!tecla) return null
  const mods = new Set()
  if (e.ctrlKey) mods.add('Ctrl')
  if (e.altKey) mods.add('Alt')
  if (e.shiftKey) mods.add('Shift')
  return montar(mods, tecla)
}

// Texto livre ("alt+n", "Shift+Ctrl+1") → canônico; null se inválido.
export function normalizarCombinacao(txt) {
  if (typeof txt !== 'string') return null
  const partes = txt.split('+').map(p => p.trim()).filter(Boolean)
  if (!partes.length) return null
  const mods = new Set()
  for (const p of partes.slice(0, -1)) {
    const l = p.toLowerCase()
    const mod = l === 'ctrl' || l === 'control' ? 'Ctrl' : l === 'alt' ? 'Alt' : l === 'shift' ? 'Shift' : null
    if (!mod || mods.has(mod)) return null
    mods.add(mod)
  }
  let tecla = partes[partes.length - 1]
  if (tecla.length === 1) tecla = tecla.toUpperCase()
  else tecla = teclaDoCode(tecla) || (NOMEADAS.find(n => n.toLowerCase() === tecla.toLowerCase()) ?? tecla)
  if (!teclaValida(tecla)) return null
  return montar(mods, tecla)
}

export const temModificador = (combinacao) => /(^|\+)(Ctrl|Alt)\+/.test(combinacao || '')
const teclaFinal = (c) => String(c || '').split('+').pop()
// Pode disparar sem Ctrl/Alt (F2, F4, F8, F9, F10, com ou sem Shift).
export const podeSemModificador = (combinacao) => F_SOZINHAS.includes(teclaFinal(combinacao))

// Mensagem de erro, ou null se a combinação pode ser usada num atalho configurável.
export function validarCombinacao(combinacao) {
  const c = normalizarCombinacao(combinacao)
  if (!c) return 'Combinação inválida.'
  if (teclaFinal(c) === TECLA_AJUDA) return 'F1 é fixa: abre a ajuda do campo ou da tela.'
  if (RESERVED_KEYS.includes(c)) return `${textoCombinacao(c)} é reservada pelo navegador/sistema.`
  if (c === FIXA_GRAVAR_MODAL) return `${c} é fixa (gravar o modal aberto).`
  if (!temModificador(c) && !podeSemModificador(c)) return 'Use um modificador (Ctrl ou Alt). Sozinhas, só F2, F4, F8, F9 e F10.'
  return null
}

// "Alt+Shift+F" → ['Alt', 'Shift', 'F'] para exibir como teclas.
export function teclasDaCombinacao(combinacao) {
  if (!combinacao) return []
  const partes = combinacao.split('+')
  // "Shift+?" (fixo) termina em "?": não passa pelo normalizador.
  return partes.map((p, i) => (i < partes.length - 1 ? p : (PONTUACAO[p] || ROTULOS[p] || p)))
}

export const textoCombinacao = (combinacao) => teclasDaCombinacao(combinacao).join('+')
