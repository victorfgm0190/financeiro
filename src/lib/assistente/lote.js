// Assistente IA — VÁRIOS lançamentos num pedido só ("lançar 100 de combustível / 200 de refeição /
// 150 de mercado"). O modelo chama registrar_lancamento / criar_agendamento uma vez por movimento;
// o backend valida cada item pelo validador de sempre e responde { ferramenta: 'lote', itens }.
// Pedido de 1 item continua igual (ferramenta normal). PURO; a parte do app (pendências, gravação
// direta) está em src/lib/assistente/loteApp.js.
import { numeroDoTexto } from '../cambio.js'

export const MAX_ITENS_LOTE = 10
export const FERRAMENTAS_LOTE = new Set(['registrar_lancamento', 'criar_agendamento'])

// ─── Backend ──────────────────────────────────────────────────────────────────────────────────────
// Blocos tool_use da resposta → { lote, blocos, total }. Lote = 2+ blocos, TODOS de criação de
// lançamento/agendamento (até 10) — ou 1 só quando faltou algo (resposta cortada ou a IA contou mais
// movimentos: `total_encontrado`). Qualquer outra mistura segue o comportamento de sempre: o 1º bloco.
// `cortada` (stop_reason max_tokens): o último bloco pode estar incompleto → descartado; o movimento
// dele volta no "texto restante".
export function blocosDoPedido(content, disponiveis, { cortada = false } = {}) {
  let usos = (content || []).filter(b => b.type === 'tool_use' && disponiveis.has(b.name))
  const criacao = usos.length > 0 && usos.every(b => FERRAMENTAS_LOTE.has(b.name))
  if (cortada && criacao) usos = usos.slice(0, -1)
  const total = Math.max(0, ...usos.map(b => Math.trunc(Number(b.input?.total_encontrado)) || 0))
  const faltou = cortada || total > Math.min(usos.length, MAX_ITENS_LOTE)
  if (criacao && (usos.length >= 2 || (usos.length === 1 && faltou))) return { lote: true, blocos: usos.slice(0, MAX_ITENS_LOTE), total }
  return { lote: false, blocos: usos.slice(0, 1), total }
}

// O que ficou de fora do lote → null (nada faltou) ou { lidos, total, trecho }. `total` = o que a IA
// contou (null se ela não contou além do que leu). `trecho` = o texto dos movimentos que faltaram, ou
// null quando não dá para recortar com certeza (nunca um trecho errado).
export function faltantesDoLote({ texto, valores, total, cortada }) {
  const lidos = valores.length
  const n = total > lidos ? total : null
  if (!n && !cortada) return null
  return { lidos, total: n, trecho: n ? restanteDoPedido(texto, valores, n - lidos) : null }
}

// Texto depois do último movimento lido. Os movimentos vêm na ordem do texto: acha o valor de cada
// item, em sequência; o do último tem de ser único dali em diante. Unidades do texto: blocos separados
// por linha em branco (se houver mais de um) ou linhas. Só devolve o restante quando sobram EXATAMENTE
// `faltam` unidades depois da do último item; qualquer dúvida → null.
export function restanteDoPedido(texto, valores, faltam) {
  const t = String(texto || '')
  if (!valores.length || !(faltam > 0)) return null
  const numeros = [...t.matchAll(/\d[\d.,]*\d|\d/g)].map(m => ({ pos: m.index, fim: m.index + m[0].length, v: Math.round((numeroDoTexto(m[0]) || 0) * 100) }))
  let cursor = 0, ultimo = null
  for (const [k, valor] of valores.entries()) {
    const alvo = Math.round(Number(valor) * 100)
    if (!(alvo > 0)) return null
    const achados = numeros.filter(x => x.pos >= cursor && x.v === alvo)
    if (!achados.length) return null
    if (k === valores.length - 1 && achados.length > 1) return null
    ultimo = achados[0]
    cursor = ultimo.fim
  }
  const unidades = []
  const sep = /\n\s*\n/.test(t.trim()) ? /\n\s*\n/g : /\n/g
  let ini = 0
  for (const m of t.matchAll(sep)) { unidades.push({ ini, fim: m.index }); ini = m.index + m[0].length }
  unidades.push({ ini, fim: t.length })
  const cheias = unidades.filter(u => t.slice(u.ini, u.fim).trim())
  const k = cheias.findIndex(u => ultimo.pos >= u.ini && ultimo.pos < u.fim)
  const resto = cheias.slice(k + 1)
  if (k < 0 || resto.length !== faltam) return null
  return t.slice(resto[0].ini).trim() || null
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
