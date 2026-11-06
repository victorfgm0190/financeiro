// Cliente de /api/boas-vindas (tour visto, checklist oculto e guias das telas ocultos, por usuário, no
// banco do ambiente) e um estado compartilhado entre o tour, o checklist, o Guia da Tela e os links
// "Rever tour" / "Reativar guias". As telas ocultas vêm JUNTO na primeira carga, para o Guia não
// "piscar" na abertura.
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

// Estado: null = ainda não carregou (ou falhou — aí NADA abre sozinho: melhor não mostrar o tour ou
// o guia do que mostrá-los a quem já pediu para não ver). `tourAberto` = o tour está na tela agora.
let estado = null
let tourAberto = false
let carregando = null
const ouvintes = new Set()
const avisar = () => { for (const f of ouvintes) f(estado ? { ...estado, tourAberto } : null) }
export const EVENTO_ABRIR_TOUR = 'finup:abrir-tour'

const doServidor = (r) => ({
  tourVistoEm: r.tourVistoEm || null,
  checklistOcultoEm: r.checklistOcultoEm || null,
  guiasOcultos: Array.isArray(r.guiasOcultos) ? r.guiasOcultos : [],
  guiasLigados: r.guiasLigados !== false,
  // Ícones ⓘ de ajuda nos campos (HelpCampo). Ligados por padrão.
  ajudaCampos: r.ajudaCampos !== false,
  progresso: r.progresso && typeof r.progresso === 'object' ? r.progresso : {},
})

export function assinarBoasVindas(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn) }
export const estadoBoasVindas = () => (estado ? { ...estado, tourAberto } : null)

export function carregarBoasVindas() {
  if (estado) return Promise.resolve(estadoBoasVindas())
  if (!carregando) {
    carregando = chamar('GET')
      .then(r => { estado = doServidor(r); avisar(); return estadoBoasVindas() })
      .catch(err => { console.warn('[boas-vindas]', err.message); return null })
      .finally(() => { carregando = null })
  }
  return carregando
}

// Grava com otimismo (a tela muda na hora) e confirma com a resposta do servidor.
async function gravar(metodo, corpo, otimista) {
  if (estado) { estado = { ...estado, ...otimista(estado) }; avisar() }
  try {
    estado = doServidor(await chamar(metodo, corpo))
    avisar()
    return true
  } catch (err) {
    console.warn('[boas-vindas] não gravou:', err.message)
    return false
  }
}
export const marcarTourVisto = () => gravar('POST', { tourVisto: true }, (e) => ({ tourVistoEm: e.tourVistoEm || new Date().toISOString() }))
export const ocultarChecklist = () => gravar('POST', { checklistOculto: true }, () => ({ checklistOcultoEm: new Date().toISOString() }))
export const mostrarChecklist = () => gravar('POST', { checklistOculto: false }, () => ({ checklistOcultoEm: null }))
// Tarefa guiada "Faça comigo" concluída (✓ no menu do "?").
export const marcarTarefaConcluida = (id) => gravar('POST', { tarefaConcluida: id }, (e) => ({
  progresso: { ...(e.progresso || {}), tarefas: { ...(e.progresso?.tarefas || {}), [id]: e.progresso?.tarefas?.[id] || new Date().toISOString() } },
}))
// Primeiros passos: estado de uma etapa ('pulada' | 'nao-se-aplica' | 'feita' | null = desfazer).
export const marcarEtapa = (etapa, estado) => gravar('POST', { etapa, estado: estado ?? null }, (e) => {
  const etapas = { ...(e.progresso?.etapas || {}) }
  if (estado) etapas[etapa] = { estado, em: new Date().toISOString() }
  else delete etapas[etapa]
  return { progresso: { ...(e.progresso || {}), etapas } }
})
// Guia da Tela: "Não mostrar mais" (uma tela), "Desativar todos" e "Reativar todos".
export const ocultarGuia = (tela) => gravar('POST', { guiaOculto: tela }, (e) => ({ guiasOcultos: [...new Set([...(e.guiasOcultos || []), tela])] }))
export const ocultarTodosGuias = (telas = []) => gravar('POST', { guiasTodos: true }, () => ({ guiasOcultos: telas }))
export const reativarTodosGuias = () => gravar('DELETE', null, () => ({ guiasOcultos: [] }))
export const reativarGuia = (tela) => gravar('POST', { guiaReativar: tela }, (e) => ({ guiasOcultos: (e.guiasOcultos || []).filter(t => t !== tela) }))
// Interruptor geral (Configurações › Geral › Guias das telas). Desligado: nada abre sozinho e o "?" some.
export const definirGuiasLigados = (ligados) => gravar('POST', { guiasLigados: !!ligados }, () => ({ guiasLigados: !!ligados }))
export const definirAjudaCampos = (ligada) => gravar('POST', { ajudaCampos: !!ligada }, () => ({ ajudaCampos: !!ligada }))

// O tour avisa quando abre e fecha: o Guia da Tela espera ele fechar.
export function definirTourAberto(v) {
  if (tourAberto === !!v) return
  tourAberto = !!v
  avisar()
}

// "Rever tour de boas-vindas" (barra lateral / Mais): o host do tour no App escuta.
export function abrirTour() {
  try { window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_TOUR)) } catch { /* sem window */ }
}

// Só para testes.
export function _reiniciarBoasVindas() { estado = null; tourAberto = false; carregando = null; ouvintes.clear() }
