import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
// Mesma media query do useIsMobile (constante única em src/lib/breakpoints.js).
import { MOBILE_MEDIA_QUERY } from '../lib/breakpoints'

// Tema claro/escuro com preferência SEPARADA por contexto (mobile × desktop), só no localStorage.
// Preferência: 'light' | 'dark' | 'system'. Padrão: 'dark' (visual atual).
// Tema efetivo: 'light' | 'dark' — o que vai em <html data-theme>.
// Contexto: decidido pela MESMA media query do useIsMobile; cruzar o breakpoint troca o tema
// para o do novo contexto sem recarregar. 'system' acompanha prefers-color-scheme em tempo real.
// O script anti-flash do index.html repete a media query e as chaves — manter os dois iguais.

export const CHAVES_TEMA = { mobile: 'finup_tema_mobile', desktop: 'finup_tema_desktop' }
export const PREFERENCIAS = ['light', 'dark', 'system']
const PADRAO = 'dark'
const QUERY_CLARO = '(prefers-color-scheme: light)'
// Cor da barra do navegador/PWA = fundo de página do tema (mesmos valores de --color-page).
export const THEME_COLOR = { dark: '#030712', light: '#EEF1F6' }

const temJanela = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'

export function lerPreferencia(contexto) {
  try {
    const v = window.localStorage.getItem(CHAVES_TEMA[contexto])
    return PREFERENCIAS.includes(v) ? v : PADRAO
  } catch {
    return PADRAO
  }
}

function gravarPreferencia(contexto, preferencia) {
  try {
    window.localStorage.setItem(CHAVES_TEMA[contexto], preferencia)
  } catch {
    // localStorage indisponível (modo privado/cota): vale só nesta sessão via notificar()
  }
}

// Pura — testável sem DOM.
export function resolverTema(preferencia, sistemaClaro) {
  if (preferencia === 'light') return 'light'
  if (preferencia === 'system') return sistemaClaro ? 'light' : 'dark'
  return 'dark'
}

const contextoAtual = () => (temJanela() && window.matchMedia(MOBILE_MEDIA_QUERY).matches ? 'mobile' : 'desktop')
const sistemaClaroAtual = () => temJanela() && window.matchMedia(QUERY_CLARO).matches

// Preferência escolhida nesta sessão quando o localStorage falha na gravação.
const memoria = {}
const preferenciaDe = (contexto) => memoria[contexto] ?? lerPreferencia(contexto)

// ── store externo: todas as instâncias do hook enxergam o mesmo estado ──
const ouvintes = new Set()
const notificar = () => ouvintes.forEach(fn => fn())

function assinar(fn) {
  ouvintes.add(fn)
  if (!temJanela()) return () => ouvintes.delete(fn)
  const mqlMobile = window.matchMedia(MOBILE_MEDIA_QUERY)
  const mqlClaro = window.matchMedia(QUERY_CLARO)
  const onStorage = (e) => { if (e.key === CHAVES_TEMA.mobile || e.key === CHAVES_TEMA.desktop) fn() }
  mqlMobile.addEventListener('change', fn)
  mqlClaro.addEventListener('change', fn)
  window.addEventListener('storage', onStorage)
  return () => {
    ouvintes.delete(fn)
    mqlMobile.removeEventListener('change', fn)
    mqlClaro.removeEventListener('change', fn)
    window.removeEventListener('storage', onStorage)
  }
}

// Snapshot como string: estável entre renders enquanto nada muda.
function snapshot() {
  const contexto = contextoAtual()
  return `${contexto}|${preferenciaDe(contexto)}|${sistemaClaroAtual() ? 1 : 0}`
}
const snapshotServidor = () => `desktop|${PADRAO}|0`

export function aplicarTema(tema) {
  if (typeof document === 'undefined') return
  const html = document.documentElement
  if (html.dataset.theme !== tema) html.dataset.theme = tema
  html.style.colorScheme = tema
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', THEME_COLOR[tema]))
}

// Chamar uma vez no App (raiz) para aplicar o tema mesmo quando nenhum ThemeToggle está montado;
// pode ser chamado também em qualquer componente (aplicar é idempotente).
export function useTheme() {
  const snap = useSyncExternalStore(assinar, snapshot, snapshotServidor)
  const [contexto, preferencia, claro] = snap.split('|')
  const tema = resolverTema(preferencia, claro === '1')

  useEffect(() => { aplicarTema(tema) }, [tema])

  const setPreferencia = useCallback((nova) => {
    if (!PREFERENCIAS.includes(nova)) return
    memoria[contexto] = nova
    gravarPreferencia(contexto, nova)
    notificar()
  }, [contexto])

  return { contexto, preferencia, tema, setPreferencia }
}

// ── cores para gráficos (Recharts recebe cor como prop, não como classe) ──
const TOKENS_GRAFICO = {
  page: '--color-page',
  surface: '--color-surface',
  surface2: '--color-surface-2',
  borda: '--color-borda',
  bordaForte: '--color-borda-forte',
  texto1: '--color-texto-1',
  texto2: '--color-texto-2',
  texto3: '--color-texto-3',
  primary: '--color-primary',
  primaryFg: '--color-primary-fg',
  receita: '--color-receita',
  despesa: '--color-despesa',
  reserva: '--color-reserva',
  transferencia: '--color-transferencia',
  aviso: '--color-aviso',
  perigo: '--color-perigo',
  ambar: '--color-ambar',
  chartEixo: '--color-chart-eixo',
  chartGrade: '--color-chart-grade',
}
// Fallback = tema escuro (usado só se o CSS ainda não carregou).
const FALLBACK = {
  page: '#030712', surface: '#1A2438', surface2: '#1E2939', borda: '#1E2939', bordaForte: '#364153',
  texto1: '#F3F4F6', texto2: '#C8CED8', texto3: '#9AA3B5', primary: '#0F6E56', primaryFg: '#3CC29B',
  receita: '#85B7EB', despesa: '#F0997B', reserva: '#AFA9EC', transferencia: '#B4B2A9',
  aviso: '#FCD34D', perigo: '#FF8E8E', ambar: '#FBBF24', chartEixo: '#9AA3B5', chartGrade: '#303B55',
}

function lerCores() {
  if (typeof document === 'undefined') return { ...FALLBACK }
  const cs = window.getComputedStyle(document.documentElement)
  const out = {}
  for (const [k, v] of Object.entries(TOKENS_GRAFICO)) out[k] = cs.getPropertyValue(v).trim() || FALLBACK[k]
  return out
}

// Devolve { tema, ...cores } do tema EFETIVAMENTE aplicado; atualiza quando ele muda
// (escolha manual, mudança do sistema ou troca de contexto mobile × desktop).
export function useThemeColors() {
  const { tema } = useTheme()
  const cores = useMemo(() => {
    // Garante o data-theme no <html> antes de ler (o efeito do useTheme só roda depois do render).
    // Idempotente: grava o mesmo valor que o useTheme gravaria.
    aplicarTema(tema)
    return lerCores()
  }, [tema])
  return { tema, ...cores }
}
