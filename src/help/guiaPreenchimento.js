// ── PREENCHIMENTO GUIADO (Etapa 4) — estado único no app + partes puras ─────────────────────────
// Quem inicia: o botão "Preencher com guia" do formulário (BotaoPreencherGuia), a oferta da primeira
// abertura, o rodapé do help de campo (evento finup:preencher-guia) e o "Faça comigo" (tour da tela,
// jornada, pré-requisitos): quando a tarefa abre um formulário que tem roteiro, ele já abre guiado.
// Quem desenha: GuiaPreenchimento (montado no App). O guia NUNCA preenche nem salva nada.
// Roteiro: src/help/<tela>.js › formularios[form] (objetivo, preRequisitos, ordemCampos, resumoAoSalvar).
import { helpDoCampo, helpDoFormulario } from './index.js'

// ativo: { form, origem, tarefaId?, seq } | null. pendente: formulário que deve abrir já guiado.
let estado = { ativo: null }
let pendente = null // { form, ate, tarefaId? }
let seq = 0
const ouvintes = new Set()
const emitir = () => ouvintes.forEach(fn => fn())
export const lerPreenchimento = () => estado
export function assinarPreenchimento(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn) }

// Provedores registrados pelos formulários abertos: { resumo(): string[], preRequisitos(): itens|null }.
const provedores = new Map()
export function registrarProvedorGuia(form, provedor) {
  provedores.set(form, provedor)
  return () => { if (provedores.get(form) === provedor) provedores.delete(form) }
}
export const provedorGuia = (form) => provedores.get(form) || null

export const temRoteiro = (form) => !!helpDoFormulario(form)

export function iniciarPreenchimento(form, { origem = 'botao', tarefaId = null } = {}) {
  if (!temRoteiro(form)) return false
  seq += 1
  estado = { ativo: { form, origem, tarefaId, seq } }
  pendente = null
  emitir()
  return true
}
export function encerrarPreenchimento() {
  if (!estado.ativo) return
  estado = { ativo: null }
  emitir()
}
export const preenchimentoAtivo = () => estado.ativo

// "Cadastrar agora" (pré-requisito) e "Sim" do Faça comigo: o próximo formulário `form` que abrir
// (em até 3 min) já começa guiado.
const VALIDADE_PENDENTE_MS = 3 * 60 * 1000
export function armarPreenchimento(form, { tarefaId = null } = {}) { pendente = { form, ate: Date.now() + VALIDADE_PENDENTE_MS, tarefaId } }
export function consumirPendente(form) {
  if (!pendente || pendente.form !== form) return null
  const p = pendente
  pendente = null
  return p.ate >= Date.now() ? p : null
}

// Voltar ao formulário depois de cadastrar um pré-requisito ("Cadastrar agora" → … → "Voltar ao …").
let retorno = null // { form, titulo, ate }
export const definirRetornoGuia = (r) => { retorno = r ? { ...r, ate: Date.now() + 10 * 60 * 1000 } : null }
export const retornoGuia = () => (retorno && retorno.ate >= Date.now() ? retorno : null)
export const limparRetornoGuia = () => { retorno = null }
// Onde fica o botão que abre cada formulário (data-guia), para o "Voltar".
export const ABRIR_FORMULARIO = {
  agendamento: { tela: 'schedule', novo: 'schedule.novo', titulo: 'Novo agendamento' },
  contrato: { tela: 'contratos', novo: 'contratos.novo', titulo: 'Novo contrato' },
}

export function _reiniciarPreenchimento() { estado = { ativo: null }; pendente = null; retorno = null; provedores.clear() }

// ── Partes puras (DOM) ──────────────────────────────────────────────────────────────────────────
const esc = (s) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : String(s).replace(/"/g, '\\"'))

// Raiz do formulário na tela (o último no DOM = o modal de cima), ou null.
export function raizDoForm(form) {
  if (typeof document === 'undefined') return null
  const todos = [...document.querySelectorAll(`[data-help-form="${esc(form)}"]`)]
  return todos.length ? todos[todos.length - 1] : null
}
// Visível de verdade: no DOM, com tamanho, sem display:none/visibility:hidden em cima.
export function visivel(el) {
  if (!el || !el.isConnected) return false
  if (el.closest('[hidden],[aria-hidden="true"]')) return false
  const r = el.getClientRects?.()
  if (r && r.length) return true
  // jsdom não tem layout: vale o estilo.
  if (typeof window === 'undefined' || !window.getComputedStyle) return true
  for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
    const s = window.getComputedStyle(e)
    if (s.display === 'none' || s.visibility === 'hidden') return false
  }
  return typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '')
}
// Contêiner visível do campo `id` dentro da raiz (o primeiro, se houver mais de um).
export function elementoDoCampo(raiz, id) {
  if (!raiz) return null
  return [...raiz.querySelectorAll(`[data-help-id="${esc(id)}"]`)].find(visivel) || null
}
// Próximo campo do roteiro: o primeiro da ordem ainda não visitado e visível agora.
export function proximoCampo(raiz, ordem, visitados) {
  for (const id of ordem || []) {
    if (visitados.has(id)) continue
    if (elementoDoCampo(raiz, id)) return id
  }
  return null
}
// O que dá para preencher dentro do contêiner (para focar e conferir se está vazio).
const CONTROLES = 'input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])'
export function controleDo(el) {
  if (!el) return null
  if (el.matches?.(CONTROLES)) return el
  return [...el.querySelectorAll(CONTROLES)].find(visivel) || el.querySelector('button:not([disabled])') || null
}
// Vazio: texto/número/data/seletor sem valor; grupo de opções sem nenhuma marcada. Controle
// próprio (botões, seletor de categoria) não dá para saber → não acusa.
export function campoVazio(el) {
  if (!el) return false
  const ctrls = el.matches?.(CONTROLES) ? [el] : [...el.querySelectorAll(CONTROLES)]
  if (!ctrls.length) return false
  const radios = ctrls.filter(c => c.type === 'radio')
  if (radios.length) return !radios.some(r => r.checked)
  const textos = ctrls.filter(c => c.type !== 'checkbox')
  if (!textos.length) return false
  return textos.every(c => String(c.value ?? '').trim() === '')
}
// Obrigatórios (pela base) visíveis e vazios agora, na ordem do roteiro.
export function obrigatoriosVazios(raiz, ordem) {
  return (ordem || []).filter(id => helpDoCampo(id)?.obrigatorio && campoVazio(elementoDoCampo(raiz, id)))
}
// Botão de avançar etapa (wizard) e o de salvar: data-help-avancar / data-help-salvar = id do form.
export function botaoDoForm(form, tipo) {
  if (typeof document === 'undefined') return null
  const raiz = raizDoForm(form)
  const sel = `[data-help-${tipo}="${esc(form)}"]`
  const dentro = raiz ? [...raiz.querySelectorAll(sel)] : []
  return [...dentro, ...document.querySelectorAll(sel)].find(visivel) || null
}

// Fases: 'prereq' → 'objetivo' → 'campo' (um por vez) → 'avancar' (wizard: próxima etapa) →
// 'faltando' (obrigatórios vazios) → 'resumo' → 'salvar' → 'pronto'.
// Depois do campo atual: o próximo campo; sem ele, a próxima fase.
export function faseDepoisDosCampos({ raiz, form, ordem, visitados }) {
  const prox = proximoCampo(raiz, ordem, visitados)
  if (prox) return { fase: 'campo', id: prox }
  const faltam = obrigatoriosVazios(raiz, ordem)
  if (faltam.length) return { fase: 'faltando', faltam }
  if (botaoDoForm(form, 'avancar')) return { fase: 'avancar' }
  return { fase: 'resumo' }
}
