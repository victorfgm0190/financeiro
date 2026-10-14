// SÓ DESENVOLVIMENTO — carregado por import dinâmico dentro de `if (import.meta.env.DEV)` no
// main.jsx; o Vite elimina o ramo (e este arquivo) do build de produção.
//
// "Modo dev (sem banco)": entra pela tela de Login (botão só em dev) e vale até sair ou fechar a
// aba (flag em sessionStorage). Enquanto ativo:
//  - TODA chamada a /api/* é bloqueada no navegador (503). O /api/load falha → o AppContext entra
//    no modo Local; o /api/ping falha → nunca reconecta, então o sync com o Neon nunca dispara.
//  - Chaves de dados do app no localStorage (finup_*, exceto finup_tema_*) passam a viver só em
//    memória: lidas de um mapa, gravadas no mapa. 'finup_v1' (cache do app) devolve os dados
//    fictícios. Nada disso toca o localStorage real nem o banco.
//  - 'auth_token' lido devolve um token fictício (nunca sai do navegador: o /api está bloqueado).
//    Logout (removeItem do token) = sair do modo dev.
//  - 'finup_last_backup_ts' devolve "agora": o backup automático não baixa arquivo de dados falsos.
import { STORAGE_KEY } from '../lib/storage'
import { AUTH_TOKEN_KEY } from '../lib/api'
import { gerarDadosFicticios } from './dadosFicticios'

export const FLAG_MODO_DEV = 'finup_modo_dev_sem_banco'
const TOKEN_FICTICIO = 'modo-dev-sem-banco'
const BACKUP_TS_KEY = 'finup_last_backup_ts'

const ativo = () => {
  try { return sessionStorage.getItem(FLAG_MODO_DEV) === '1' } catch { return false }
}

// Chave cujo valor é dado do app (vive só em memória no modo dev). Tema fica no localStorage real
// para dar para testar "recarregar mantém o tema".
const ehChaveDeDados = (k) => typeof k === 'string' && k.startsWith('finup_') && !k.startsWith('finup_tema_')

function sairDoModoDev() {
  try { sessionStorage.removeItem(FLAG_MODO_DEV) } catch { /* ignore */ }
}

function instalarStorage() {
  const memoria = new Map([[STORAGE_KEY, JSON.stringify(gerarDadosFicticios())]])
  const proto = Storage.prototype
  const { getItem, setItem, removeItem } = proto
  const ehLocal = (s) => s === window.localStorage

  proto.getItem = function (k) {
    if (!ehLocal(this)) return getItem.call(this, k)
    if (k === AUTH_TOKEN_KEY) return ativo() ? TOKEN_FICTICIO : null
    if (k === BACKUP_TS_KEY) return String(Date.now())
    if (ehChaveDeDados(k)) return memoria.has(k) ? memoria.get(k) : null
    return getItem.call(this, k)
  }
  proto.setItem = function (k, v) {
    if (!ehLocal(this)) return setItem.call(this, k, v)
    if (k === AUTH_TOKEN_KEY) return undefined // nunca grava token de verdade a partir do modo dev
    if (ehChaveDeDados(k)) { memoria.set(k, String(v)); return undefined }
    return setItem.call(this, k, v)
  }
  proto.removeItem = function (k) {
    if (!ehLocal(this)) return removeItem.call(this, k)
    if (k === AUTH_TOKEN_KEY) { sairDoModoDev(); return undefined } // logout → volta ao Login normal
    if (ehChaveDeDados(k)) { memoria.delete(k); return undefined }
    return removeItem.call(this, k)
  }
}

function instalarFetch() {
  const original = window.fetch.bind(window)
  const bloqueadas = new Map() // "MÉTODO /api/rota" → quantidade
  window.fetch = function (input, init) {
    const url = new URL(typeof input === 'string' ? input : (input?.url ?? String(input)), window.location.href)
    if (url.origin === window.location.origin && url.pathname.startsWith('/api/')) {
      const metodo = (init?.method || input?.method || 'GET').toUpperCase()
      const chave = `${metodo} ${url.pathname}`
      bloqueadas.set(chave, (bloqueadas.get(chave) || 0) + 1)
      console.warn(`[modo dev] bloqueado: ${chave}`)
      return Promise.resolve(new Response(JSON.stringify({ error: 'modo dev: /api bloqueado' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }))
    }
    return original(input, init)
  }
  // No console: __finupModoDev.bloqueadas() lista o que o app tentou chamar.
  window.__finupModoDev = { bloqueadas: () => Object.fromEntries(bloqueadas) }
}

function instalarFaixa() {
  const faixa = document.createElement('div')
  faixa.setAttribute('role', 'status')
  faixa.style.cssText = [
    'position:fixed', 'z-index:2147483647', 'left:50%', 'transform:translateX(-50%)',
    'top:calc(env(safe-area-inset-top, 0px) + 2px)', 'display:flex', 'gap:8px', 'align-items:center',
    'padding:2px 10px', 'border-radius:9999px', 'font:600 11px system-ui,sans-serif',
    'background:#7C2D12', 'color:#FFFFFF', 'opacity:0.92', 'box-shadow:0 2px 8px rgba(0,0,0,.35)',
  ].join(';')
  faixa.textContent = 'MODO DEV · sem banco · dados fictícios'
  const sair = document.createElement('button')
  sair.type = 'button'
  sair.textContent = 'Sair'
  sair.style.cssText = 'font:inherit;color:inherit;background:rgba(255,255,255,.18);border:0;border-radius:9999px;padding:0 8px;cursor:pointer'
  sair.onclick = () => { sairDoModoDev(); window.location.replace('/') }
  faixa.appendChild(sair)
  const por = () => document.body.appendChild(faixa)
  if (document.body) por()
  else document.addEventListener('DOMContentLoaded', por, { once: true })
  document.title = `[DEV] ${document.title}`
}

export function instalarModoDev() {
  if (!ativo()) return
  instalarStorage()
  instalarFetch()
  instalarFaixa()
  console.info('[modo dev] ativo — /api bloqueado, dados fictícios só em memória.')
}

// Usado pelo botão da tela de Login (também só em dev).
export function entrarNoModoDev() {
  try { sessionStorage.setItem(FLAG_MODO_DEV, '1') } catch { /* ignore */ }
  window.location.replace('/')
}
