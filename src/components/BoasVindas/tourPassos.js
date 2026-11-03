// Partes puras do tour da tela (testáveis sem tela): passos e posição do balão.
import { elementoDoItem } from './guiaElementos'

export const MARGEM = 6 // folga do recorte em volta do elemento
export const LARGURA_BALAO = 340

// Passos do tour: intro, itens com elemento na tela agora, "em cada linha", fim.
// → [{ tipo: 'intro' | 'item' | 'linhas' | 'fim', item?, el?, itens? }]
// Botões que se repetem em cada linha (porLinha) sem nenhuma linha na tela viram UM passo no centro,
// com a lista deles — e não um balão vazio para cada um.
export function montarPassos(guia, tela, achar = elementoDoItem) {
  if (!guia) return []
  const todos = guia.itens.map(item => ({ tipo: 'item', item, el: achar(tela, item.chave) }))
  const itens = todos.filter(p => p.el)
  const semLinha = todos.filter(p => !p.el && p.item.porLinha).map(p => p.item)
  const linhas = semLinha.length ? [{ tipo: 'linhas', itens: semLinha }] : []
  return [{ tipo: 'intro' }, ...itens, ...linhas, { tipo: 'fim' }]
}

// Passo em que o tour abre quando pedido já num item (Central de Ajuda › "Mostrar na tela").
export function indiceDoItem(passos, chave) {
  if (!chave) return 0
  const k = passos.findIndex(p => p.item?.chave === chave || p.itens?.some(i => i.chave === chave))
  return k > 0 ? k : 0
}

const cruza = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top

// Posição do balão ao lado do alvo, sem sair da tela e sem cobrir o alvo: tenta os lados na ordem
// pedida (padrão: abaixo, acima, direita, esquerda) e fica com o primeiro que cabe e não cobre nada de
// `evitar` (ex.: o elemento do próximo passo); sem nenhum assim, o primeiro que cabe; sem nenhum que
// caiba, o canto da tela oposto ao alvo.
export function posicaoBalao(rect, { largura, altura }, { vw, vh }, { ordem = ['abaixo', 'acima', 'direita', 'esquerda'], evitar = [] } = {}) {
  if (!rect) return { top: Math.max(16, (vh - altura) / 2), left: Math.max(8, (vw - largura) / 2) }
  const gap = MARGEM + 12
  const right = rect.right ?? rect.left + rect.width
  const bottom = rect.bottom ?? rect.top + rect.height
  const limita = (v, max) => Math.min(Math.max(8, v), Math.max(8, max))
  const meioX = limita(rect.left + rect.width / 2 - largura / 2, vw - largura - 8)
  const meioY = limita(rect.top + rect.height / 2 - altura / 2, vh - altura - 8)
  const lados = {
    abaixo: { top: bottom + gap, left: meioX },
    acima: { top: rect.top - gap - altura, left: meioX },
    direita: { top: meioY, left: right + gap },
    esquerda: { top: meioY, left: rect.left - gap - largura },
  }
  const caixa = (p) => ({ top: p.top, left: p.left, right: p.left + largura, bottom: p.top + altura })
  const cabe = (p) => p.top >= 8 && p.left >= 8 && p.top + altura <= vh - 8 && p.left + largura <= vw - 8
  const alvo = { top: rect.top - MARGEM, left: rect.left - MARGEM, right: right + MARGEM, bottom: bottom + MARGEM }
  const cabem = ordem.map(l => lados[l]).filter(p => p && cabe(p) && !cruza(caixa(p), alvo))
  const livre = cabem.find(p => !evitar.some(e => e && cruza(caixa(p), e)))
  if (livre || cabem[0]) return livre || cabem[0]
  return {
    top: rect.top + rect.height / 2 > vh / 2 ? 8 : Math.max(8, vh - altura - 8),
    left: rect.left + rect.width / 2 > vw / 2 ? 8 : Math.max(8, vw - largura - 8),
  }
}

export const TAM_SELO = 20

// Selos numerados do "Ver todas as funções": um no canto de cima à direita de cada bloco, SÓ quando o
// selo inteiro cabe na parte visível do bloco (`area`: interseção da tela com os containers que rolam)
// e não cai em cima de nada de `bloqueios` (cabeçalho fixo, painel do guia). Fora disso, some — nunca
// fica preso na borda. Dois selos no mesmo ponto: o seguinte vai para o lado.
// medidas: [{ chave, numero, rect, area, bloqueios? }] (bloqueios só deste bloco) → [{ chave, numero, top, left }]
export function posicionarSelos(medidas, bloqueios = []) {
  const out = []
  for (const m of medidas) {
    const { rect: r, area } = m
    if (!r || !area) continue
    let top = r.top - 8
    let left = r.right - 12
    const box = () => ({ top, left, right: left + TAM_SELO, bottom: top + TAM_SELO })
    const dentro = () => top >= area.top && left >= area.left && top + TAM_SELO <= area.bottom && left + TAM_SELO <= area.right
    if (!dentro()) { top = r.top + 2; left = r.right - TAM_SELO - 2 } // encostado na borda do container: entra no bloco
    let tentativas = 0
    while (out.some(o => cruza(box(), { top: o.top - 2, left: o.left - 2, right: o.left + TAM_SELO + 2, bottom: o.top + TAM_SELO + 2 })) && tentativas++ < 6) {
      left -= TAM_SELO + 4
    }
    if (!dentro() || [...bloqueios, ...(m.bloqueios || [])].some(b => b && cruza(box(), b))) continue
    out.push({ chave: m.chave, numero: m.numero, top, left })
  }
  return out
}

// Item do guia sem bloco na tela agora: quando ele aparece. Usa `quando` do item; senão, a frase
// "(Só) aparece quando…" do texto/detalhe; botões de linha: quando a lista tiver itens.
export function quandoAparece(item) {
  if (!item) return ''
  if (item.quando) return item.quando
  for (const t of [item.texto, item.detalhe]) {
    const m = String(t || '').match(/(?:^|[.!?]\s+)((?:Só\s+)?aparece[^.]*\.)/i)
    if (m) return m[1].charAt(0).toUpperCase() + m[1].slice(1)
  }
  if (item.porLinha) return 'Aparece em cada linha quando a lista tiver itens.'
  return 'Depende do que a tela mostra agora (dados, filtros, aba ou menu aberto).'
}
