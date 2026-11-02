// Partes puras do tour da tela (testáveis sem tela): passos e posição do balão.
import { elementoDoItem } from './guiaElementos'

export const MARGEM = 6 // folga do recorte em volta do elemento
export const LARGURA_BALAO = 340

// Passos do tour: intro, itens com elemento na tela agora, fim. → [{ tipo, item?, el? }]
export function montarPassos(guia, tela, achar = elementoDoItem) {
  if (!guia) return []
  const itens = guia.itens
    .map(item => ({ tipo: 'item', item, el: achar(tela, item.chave) }))
    .filter(p => p.el)
  return [{ tipo: 'intro' }, ...itens, { tipo: 'fim' }]
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
