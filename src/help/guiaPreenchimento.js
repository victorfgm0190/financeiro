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
  lancamento: { tela: 'transactions', novo: 'transactions.novo', titulo: 'Novo lançamento' },
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
// Grupo de opções (rádios ou botões Receita/Despesa…): o foco vai para a opção JÁ escolhida — assim o
// Enter avança em vez de trocar a escolha.
export function controleDo(el) {
  if (!el) return null
  if (el.matches?.(CONTROLES)) return el
  const ctrls = [...el.querySelectorAll(CONTROLES)].filter(visivel)
  if (ctrls.length && ctrls.every(c => c.type === 'radio')) return ctrls.find(c => c.checked) || ctrls[0]
  // Sem campo: a opção escolhida, um seletor próprio ou um liga/desliga. Botão de ação ("Dividir em
  // categorias", "+ Adicionar") não recebe o foco — o Enter o abriria; o foco fica no balão.
  return ctrls[0] || el.querySelector('button[aria-pressed="true"]:not([disabled]), button[aria-haspopup]:not([disabled]), [role="switch"]:not([disabled])') || null
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

// Celular: o balão fica preso em cima ou embaixo da tela — ou, quando cabe, logo abaixo do campo aceso
// (entre ele e o Salvar). Escolhe o que não cobre o campo e, se der, nem o botão de salvar (o campo
// pesa mais). Caixas: { top, bottom } na tela; null = não há. alturaBalao: a do balão; teclado: altura
// do teclado aberto (o balão de baixo fica acima dele). Entre os dois, o balão pode encolher até
// `minimo` (rola por dentro). → { lado: 'cima' | 'baixo' | 'entre', top?, altura? }.
export function ladoDoBalaoCelular({ alvo = null, salvar = null, vh, alturaBalao, teclado = 0, topo = 8, folga = 8, minimo = 180 }) {
  const piso = vh - teclado
  const faixas = { cima: [topo, topo + alturaBalao], baixo: [piso - alturaBalao, piso] }
  if (alvo) {
    const t = alvo.bottom + folga
    const limite = Math.min(piso, salvar && salvar.top > alvo.bottom ? salvar.top - folga / 2 : piso)
    const cabe = Math.min(alturaBalao, limite - t)
    if (cabe >= Math.min(alturaBalao, minimo)) faixas.entre = [t, t + cabe]
  }
  const cobre = (f, r) => (r ? Math.max(0, Math.min(f[1], r.bottom) - Math.max(f[0], r.top)) : 0)
  const custo = (lado) => 10 * cobre(faixas[lado], alvo) + cobre(faixas[lado], salvar)
  // Preferência no empate: embaixo (perto do polegar), depois em cima, depois entre.
  const lado = Object.keys(faixas).sort((a, b) => custo(a) - custo(b) || ['baixo', 'cima', 'entre'].indexOf(a) - ['baixo', 'cima', 'entre'].indexOf(b))[0]
  if (lado !== 'entre') return { lado }
  const [t, b] = faixas.entre
  return b - t < alturaBalao ? { lado, top: Math.round(t), altura: Math.floor(b - t) } : { lado, top: Math.round(t) }
}

// Computador: o balão NUNCA cobre um controle do formulário (campo, aba, botão). Primeiro FORA da
// janela do formulário (direita, esquerda, abaixo, acima — na altura do campo aceso); sem espaço lá,
// o lugar perto do campo que cobre menos controles. O campo aceso nunca é coberto.
// Caixas: { top, left, right, bottom } na tela. alvo: campo aceso (null = fase sem campo); janela:
// painel do formulário (modal) ou o próprio formulário; controles: caixas dos controles visíveis.
// Fora da janela, ao lado, o balão pode afinar até `larguraMin` (a altura cresce na mesma proporção).
// → { top, left, largura, lado } (lado: 'fora-direita' | … | 'perto' | 'canto' | 'sobra').
// alturaDe(w): altura do balão com a largura w (a medida de verdade, quando já se mediu; senão a
// estimativa proporcional) — sem isso o balão alternaria entre duas larguras.
export function posicaoBalaoComputador({ alvo = null, janela = null, controles = [], largura, altura: estimada, vw, vh, gap = 18, borda = 8, folgaAlvo = 6, larguraMin = 260, alturaDe = null }) {
  const altura = (alturaDe && alturaDe(largura)) || estimada
  const hDe = (w) => (alturaDe && alturaDe(w)) || (w === largura ? altura : Math.ceil(altura * largura / w))
  const ref = alvo || janela
  if (!ref) return { top: Math.max(16, (vh - altura) / 2), left: Math.max(borda, (vw - largura) / 2), largura, lado: 'meio' }
  const limX = (v) => Math.min(Math.max(borda, v), Math.max(borda, vw - largura - borda))
  const limY = (v) => Math.min(Math.max(borda, v), Math.max(borda, vh - altura - borda))
  const cy = limY((ref.top + ref.bottom) / 2 - altura / 2)
  const cx = limX((ref.left + ref.right) / 2 - largura / 2)
  const cands = []
  const add = (lado, top, left, w = largura, h = altura) => cands.push({ lado, top, left, w, h })
  if (janela) {
    add('fora-direita', cy, janela.right + gap)
    add('fora-esquerda', cy, janela.left - gap - largura)
    // Sem espaço para a largura inteira ao lado: mais estreito (até larguraMin), mais alto.
    for (const [lado, livre] of [['fora-direita', vw - borda - janela.right - gap], ['fora-esquerda', janela.left - gap - borda]]) {
      const w = Math.floor(livre)
      if (w >= larguraMin && w < largura) {
        const h = hDe(w)
        const top = Math.min(Math.max(borda, (ref.top + ref.bottom) / 2 - h / 2), Math.max(borda, vh - h - borda))
        add(lado, top, lado === 'fora-direita' ? janela.right + gap : janela.left - gap - w, w, h)
      }
    }
    add('fora-abaixo', janela.bottom + gap, cx)
    add('fora-acima', janela.top - gap - altura, cx)
  }
  if (alvo) {
    for (const left of [cx, limX(alvo.left), limX(alvo.right - largura)]) {
      add('perto', alvo.bottom + gap, left)
      add('perto', alvo.top - gap - altura, left)
    }
    for (const top of [cy, limY(alvo.top), limY(alvo.bottom - altura)]) {
      add('perto', top, alvo.right + gap)
      add('perto', top, alvo.left - gap - largura)
    }
  }
  for (const top of [borda, vh - altura - borda]) for (const left of [borda, vw - largura - borda]) add('canto', top, left)
  const cabe = (p) => p.top >= borda - 0.5 && p.left >= borda - 0.5 && p.top + p.h <= vh - borda + 0.5 && p.left + p.w <= vw - borda + 0.5
  const area = (p, r) => Math.max(0, Math.min(p.left + p.w, r.right) - Math.max(p.left, r.left)) * Math.max(0, Math.min(p.top + p.h, r.bottom) - Math.max(p.top, r.top))
  const zona = alvo ? { top: alvo.top - folgaAlvo, left: alvo.left - folgaAlvo, right: alvo.right + folgaAlvo, bottom: alvo.bottom + folgaAlvo } : null
  let melhor = null
  for (const p of cands) {
    if (!cabe(p) || (zona && area(p, zona) > 0)) continue
    const custo = controles.reduce((s, r) => s + area(p, r), 0)
    if (!melhor || custo < melhor.custo) melhor = { ...p, custo }
    if (custo === 0) break // a ordem já é a preferência: o primeiro sem cobrir nada
  }
  // Nenhum lugar livre na lista acima: procura um vão livre na tela inteira (grade fina, também mais
  // estreito), o mais perto do campo; sem vão, o lugar que cobre menos.
  if (!melhor || melhor.custo > 0) {
    const cx0 = (ref.left + ref.right) / 2
    const cy0 = (ref.top + ref.bottom) / 2
    const passo = 16
    for (const w of [...new Set([largura, Math.max(larguraMin, Math.round(largura * 0.88)), larguraMin])]) {
      const h = hDe(w)
      for (let top = borda; top + h <= vh - borda; top += passo) {
        for (let left = borda; left + w <= vw - borda; left += passo) {
          const p = { lado: 'vao', top, left, w, h }
          if (zona && area(p, zona) > 0) continue
          const custo = controles.reduce((s, r) => s + area(p, r), 0)
          const dist = Math.hypot(left + w / 2 - cx0, top + h / 2 - cy0)
          if (!melhor || custo < melhor.custo || (custo === melhor.custo && melhor.lado === 'vao' && dist < melhor.dist)) melhor = { ...p, custo, dist }
        }
      }
    }
  }
  if (melhor) return { top: melhor.top, left: melhor.left, largura: melhor.w, lado: melhor.lado }
  // Não cabe em lugar nenhum sem cobrir o campo: o canto oposto a ele.
  return {
    top: (ref.top + ref.bottom) / 2 > vh / 2 ? borda : Math.max(borda, vh - altura - borda),
    left: (ref.left + ref.right) / 2 > vw / 2 ? borda : Math.max(borda, vw - largura - borda),
    largura,
    lado: 'sobra',
  }
}

// Caixas dos controles visíveis da janela do formulário (cortadas pela parte visível da janela).
const SEL_CONTROLES = 'input:not([type=hidden]), select, textarea, button, a[href], [role="tab"], [role="switch"], [role="combobox"], [aria-haspopup], [contenteditable="true"]'
export function caixasDosControles(janela) {
  if (!janela) return []
  const out = []
  // Corte de cada contêiner que rola (corpo do modal): o que rolou para fora dele não aparece.
  const cortes = new Map()
  const corte = (el) => {
    if (cortes.has(el)) return cortes.get(el)
    let r
    if (el === janela) r = el.getBoundingClientRect()
    else {
      const pai = el.parentElement ? corte(el.parentElement) : null
      const ov = typeof window !== 'undefined' && window.getComputedStyle ? window.getComputedStyle(el).overflow : 'visible'
      const prop = /(auto|scroll|hidden|clip)/.test(ov || '') ? el.getBoundingClientRect() : null
      r = pai && prop ? { top: Math.max(pai.top, prop.top), left: Math.max(pai.left, prop.left), right: Math.min(pai.right, prop.right), bottom: Math.min(pai.bottom, prop.bottom) } : pai || prop
    }
    cortes.set(el, r)
    return r
  }
  for (const c of janela.querySelectorAll(SEL_CONTROLES)) {
    const r = c.getBoundingClientRect()
    if (!r.width || !r.height) continue
    const j = c.parentElement ? corte(c.parentElement) : null
    if (!j) continue
    const top = Math.max(r.top, j.top); const bottom = Math.min(r.bottom, j.bottom)
    const left = Math.max(r.left, j.left); const right = Math.min(r.right, j.right)
    if (bottom > top && right > left) out.push({ top, left, right, bottom })
  }
  return out
}
// Janela do formulário: o painel do modal em volta (role=dialog) ou o próprio formulário.
export const janelaDoForm = (raiz) => (raiz ? raiz.closest('[role="dialog"]') || raiz : null)

// Esc é de quem está aberto por cima do formulário: lista (SearchableSelect), menu ou janela. O
// guia só fecha num Esc com tudo isso fechado. `balao`: o próprio balão do guia (não conta).
export function algoAbertoNoForm(raiz, { balao = null, foco = typeof document !== 'undefined' ? document.activeElement : null } = {}) {
  if (!raiz || typeof document === 'undefined') return false
  const janela = janelaDoForm(raiz)
  const fora = (el) => !balao || !balao.contains(el)
  // Lista/menu do formulário aberta (o gatilho marca aria-expanded).
  if ([...janela.querySelectorAll('[aria-expanded="true"]')].some(el => (el.hasAttribute('aria-haspopup') || el.getAttribute('role') === 'combobox') && visivel(el))) return true
  // Lista/menu aberto em portal (fora da janela).
  if ([...document.querySelectorAll('[role="listbox"], [role="menu"]')].some(el => fora(el) && visivel(el))) return true
  // O foco está em algo aberto por cima — outra janela ou um painel em portal (fora do app) —, fora do
  // formulário e do balão. Foco em outro lugar da própria página (menu lateral) não conta.
  if (!foco || foco === document.body || !foco.isConnected || janela.contains(foco) || !fora(foco)) return false
  const app = document.getElementById('root')
  return !!(foco.closest('[role="dialog"], [data-modal-painel], [aria-modal="true"]') || (app && !app.contains(foco)))
}
