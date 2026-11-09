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
  // display: contents (contêiner sem caixa própria): visível se algum filho for.
  if (window.getComputedStyle(el).display === 'contents') return [...el.children].some(visivel)
  for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
    const s = window.getComputedStyle(e)
    if (s.display === 'none' || s.visibility === 'hidden') return false
  }
  return typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '')
}
// Contêiner visível do campo `id` dentro da raiz (o primeiro, se houver mais de um).
export function elementoDoCampo(raiz, id) {
  if (!raiz || !id) return null
  return [...raiz.querySelectorAll(`[data-help-id="${esc(id)}"]`)].find(visivel) || null
}
// Campos com passo na tela agora, na ORDEM VISUAL (linha de cima primeiro; na mesma linha, da
// esquerda para a direita — vale no celular, onde a ordem do CSS muda). Todo campo marcado com
// data-help-id e com conteúdo na base tem passo; o roteiro (ordemCampos) não decide a ordem.
const LINHA_PX = 6
export function camposNaTela(raiz) {
  if (!raiz) return []
  const vistos = new Set()
  const itens = []
  for (const el of raiz.querySelectorAll('[data-help-id]')) {
    const id = el.getAttribute('data-help-id')
    if (vistos.has(id) || !helpDoCampo(id) || !visivel(el)) continue
    vistos.add(id)
    const r = caixaDe(el)
    itens.push({ id, top: r.top, left: r.left, i: itens.length })
  }
  itens.sort((a, b) => (Math.abs(a.top - b.top) > LINHA_PX ? a.top - b.top : a.left - b.left || a.i - b.i))
  return itens.map(x => x.id)
}
// Caixa na tela (display: contents não tem: usa a do primeiro filho visível).
export function caixaDe(el) {
  const r = el.getBoundingClientRect()
  if (r.width || r.height || typeof window === 'undefined' || window.getComputedStyle(el).display !== 'contents') return r
  const f = [...el.children].find(visivel)
  return f ? caixaDe(f) : r
}
// Próximo campo: o primeiro (na ordem visual) ainda não visitado.
export function proximoCampo(raiz, visitados) {
  return camposNaTela(raiz).find(id => !visitados.has(id)) || null
}
// O que dá para preencher dentro do contêiner (para focar e conferir se está vazio).
const CONTROLES = 'input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])'
export function controleDo(el) {
  if (!el) return null
  if (el.matches?.(CONTROLES)) return el
  return [...el.querySelectorAll(CONTROLES)].find(visivel) || el.querySelector('button:not([disabled])') || null
}
// Vazio: texto/número/data/seletor sem valor; grupo de opções sem nenhuma marcada; seletor próprio
// (SearchableSelect) com data-preenchido="nao". Sem nada disso (botões) → não acusa.
export function campoVazio(el) {
  if (!el) return false
  const ctrls = el.matches?.(CONTROLES) ? [el] : [...el.querySelectorAll(CONTROLES)]
  const proprios = [...el.querySelectorAll('[data-preenchido]')]
  if (!ctrls.length) return proprios.length > 0 && proprios.every(p => p.getAttribute('data-preenchido') === 'nao')
  const radios = ctrls.filter(c => c.type === 'radio')
  if (radios.length) return !radios.some(r => r.checked)
  const textos = ctrls.filter(c => c.type !== 'checkbox')
  if (!textos.length) return false
  return textos.every(c => String(c.value ?? '').trim() === '')
}

// ── Obrigatório = a validação do próprio formulário ──────────────────────────────────────────────
// O formulário informa pelo provedor: erros() → [{ id, msg }] (os que barram o Avançar/Salvar agora,
// na ordem da validação) e obrigatorio(id) → boolean (barraria se ficasse vazio). Sem provedor de
// validação, vale a base (obrigatorio) + campo vazio.
const validacaoDe = (form) => provedores.get(form)?.validacao || null
export function obrigatorioNoForm(form, id) {
  const v = validacaoDe(form)
  if (v?.obrigatorio) { try { return !!v.obrigatorio(id) } catch { return false } }
  return !!helpDoCampo(id)?.obrigatorio
}
export function errosDoForm(form) {
  const v = validacaoDe(form)
  if (!v?.erros) return null
  try { return v.erros() || [] } catch { return [] }
}
// Mensagem que barra o campo agora (ou null).
export function erroDoCampo(form, raiz, id) {
  const erros = errosDoForm(form)
  if (erros) return erros.find(e => e.id === id)?.msg || null
  return helpDoCampo(id)?.obrigatorio && campoVazio(elementoDoCampo(raiz, id)) ? 'Este campo é obrigatório.' : null
}
// Campos visíveis que barram agora, na ordem visual.
export function faltandoNaTela(form, raiz) {
  const naTela = camposNaTela(raiz)
  const erros = errosDoForm(form)
  if (erros) {
    const ids = new Set(erros.map(e => e.id))
    return naTela.filter(id => ids.has(id))
  }
  return naTela.filter(id => helpDoCampo(id)?.obrigatorio && campoVazio(elementoDoCampo(raiz, id)))
}
// Primeiro campo com erro mostrado pelo próprio formulário (data-erro) — quando não há provedor.
export function campoComErroNaTela(raiz) {
  const el = raiz ? [...raiz.querySelectorAll('[data-erro]')].find(visivel) : null
  return el ? el.closest('[data-help-id]')?.getAttribute('data-help-id') || el.getAttribute('data-help-id') : null
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
// 'faltando' (o que a validação barra) → 'resumo' → 'salvar' → 'pronto'.
// Depois do campo atual: o próximo campo; sem ele, a próxima fase.
export function faseDepoisDosCampos({ raiz, form, visitados }) {
  const prox = proximoCampo(raiz, visitados)
  if (prox) return { fase: 'campo', id: prox }
  const faltam = faltandoNaTela(form, raiz)
  if (faltam.length) return { fase: 'faltando', faltam }
  if (botaoDoForm(form, 'avancar')) return { fase: 'avancar' }
  return { fase: 'resumo' }
}

// Diagnóstico (dev e testes): controles visíveis do formulário sem passo no guia (fora de um
// data-help-id com conteúdo). [data-guia-fora] marca o que não é campo (ex.: o próprio botão do guia).
const SEL_CAMPOS = 'input:not([type=hidden]), select, textarea, [aria-haspopup="listbox"], [role="switch"]'
export function controlesSemPasso(raiz) {
  if (!raiz) return []
  return [...raiz.querySelectorAll(SEL_CAMPOS)].filter(c => {
    if (!visivel(c) || c.closest('[data-guia-fora]') || c.closest('[role="dialog"][data-modal-painel]') && !raiz.contains(c)) return false
    const ct = c.closest('[data-help-id]')
    return !(ct && raiz.contains(ct) && helpDoCampo(ct.getAttribute('data-help-id')))
  })
}
