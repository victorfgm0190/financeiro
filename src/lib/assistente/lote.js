// Assistente IA — VÁRIOS lançamentos num pedido só ("lançar 100 de combustível / 200 de refeição /
// 150 de mercado"). O modelo chama registrar_lancamento / criar_agendamento uma vez por movimento;
// o backend valida cada item pelo validador de sempre e responde { ferramenta: 'lote', itens }.
// Pedido de 1 item continua igual (ferramenta normal). PURO; a parte do app (pendências, gravação
// direta) está em src/lib/assistente/loteApp.js.
import { numeroDoTexto } from '../cambio.js'

export const MAX_ITENS_LOTE = 10
export const FERRAMENTAS_LOTE = new Set(['registrar_lancamento', 'criar_agendamento'])

// ─── Backend ──────────────────────────────────────────────────────────────────────────────────────
// Blocos tool_use da resposta → { lote, blocos }. Lote = 2+ blocos, TODOS de criação de lançamento/
// agendamento (até 10). Qualquer outra mistura segue o comportamento de sempre: o 1º bloco.
export function blocosDoPedido(content, disponiveis) {
  const usos = (content || []).filter(b => b.type === 'tool_use' && disponiveis.has(b.name))
  if (usos.length >= 2 && usos.every(b => FERRAMENTAS_LOTE.has(b.name))) return { lote: true, blocos: usos.slice(0, MAX_ITENS_LOTE) }
  return { lote: false, blocos: usos.slice(0, 1) }
}

// Trechos do pedido, um por movimento: linhas, ";", " / ", vírgula seguida de espaço e " e ".
export function segmentosDoPedido(texto) {
  return String(texto || '')
    .split(/\n|;|\s\/\s|,(?=\s)|\s+e\s+/i)
    .map(s => s.trim())
    .filter(Boolean)
}

// Trecho do item (para a leitura de parcelas e moeda do PRÓPRIO item, não do pedido inteiro): o
// 1º trecho ainda livre que cita o valor do item. Sem trecho → '' (nada do texto vale para o item).
export function trechosDosItens(texto, valores) {
  const segs = segmentosDoPedido(texto)
  const usados = new Set()
  return valores.map(v => {
    const alvo = Math.round(Number(v) * 100)
    const i = segs.findIndex((s, k) => !usados.has(k) && (s.match(/\d[\d.,]*/g) || []).some(n => Math.round((numeroDoTexto(n) || 0) * 100) === alvo))
    if (i < 0 || !(alvo > 0)) return ''
    usados.add(i)
    return segs[i]
  })
}
