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

// Posição do balão ao lado do alvo, sem sair da tela: embaixo, em cima ou centralizado.
export function posicaoBalao(rect, { largura, altura }, { vw, vh }) {
  if (!rect) return { top: Math.max(16, (vh - altura) / 2), left: Math.max(8, (vw - largura) / 2) }
  const left = Math.min(Math.max(8, rect.left + rect.width / 2 - largura / 2), vw - largura - 8)
  const abaixo = rect.bottom + MARGEM + 12
  if (abaixo + altura <= vh - 8) return { top: abaixo, left }
  const acima = rect.top - MARGEM - 12 - altura
  if (acima >= 8) return { top: acima, left }
  return { top: Math.max(8, vh - altura - 8), left }
}
