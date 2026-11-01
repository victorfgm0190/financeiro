// Cliente de /api/boas-vindas (tour visto / checklist oculto, por usuário, no banco do ambiente) e
// um estado compartilhado entre o modal do tour, o checklist do Painel e o link "Rever tour".
import { authHeaders } from './api.js'

async function chamar(metodo, corpo) {
  const res = await fetch('/api/boas-vindas', {
    method: metodo, cache: 'no-store',
    headers: { ...(corpo ? { 'Content-Type': 'application/json' } : {}), ...authHeaders() },
    body: corpo ? JSON.stringify(corpo) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(json.error || `Falha (${res.status})`), { status: res.status })
  return json
}

// Estado: null = ainda não carregou (ou falhou — aí NADA aparece sozinho: melhor não mostrar o tour
// do que mostrá-lo de novo a quem já viu).
let estado = null
let carregando = null
const ouvintes = new Set()
const avisar = () => { for (const f of ouvintes) f(estado) }
export const EVENTO_ABRIR_TOUR = 'finup:abrir-tour'

export function assinarBoasVindas(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn) }
export const estadoBoasVindas = () => estado

export function carregarBoasVindas() {
  if (estado) return Promise.resolve(estado)
  if (!carregando) {
    carregando = chamar('GET')
      .then(r => { estado = { tourVistoEm: r.tourVistoEm || null, checklistOcultoEm: r.checklistOcultoEm || null }; avisar(); return estado })
      .catch(err => { console.warn('[boas-vindas]', err.message); return null })
      .finally(() => { carregando = null })
  }
  return carregando
}

async function gravar(corpo, otimista) {
  estado = { ...(estado || {}), ...otimista }
  avisar()
  try {
    const r = await chamar('POST', corpo)
    estado = { tourVistoEm: r.tourVistoEm || null, checklistOcultoEm: r.checklistOcultoEm || null }
    avisar()
  } catch (err) { console.warn('[boas-vindas] não gravou:', err.message) }
}
export const marcarTourVisto = () => gravar({ tourVisto: true }, { tourVistoEm: estado?.tourVistoEm || new Date().toISOString() })
export const ocultarChecklist = () => gravar({ checklistOculto: true }, { checklistOcultoEm: new Date().toISOString() })

// "Rever tour de boas-vindas" (barra lateral / Mais): o host do tour no App escuta.
export function abrirTour() {
  try { window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_TOUR)) } catch { /* sem window */ }
}

// Só para testes.
export function _reiniciarBoasVindas() { estado = null; carregando = null; ouvintes.clear() }
