// Rateio citado no TEXTO do pedido ("gastei 250 no posto, 200 de gasolina"; "250 no posto sendo 200
// gasolina"; "McDonald's 200, 100 confraternização e 100 mercado"). PURO, sem nada do cadastro: só
// lê os números e o trecho que vem depois de cada um. Quem escolhe a categoria de cada parte é
// lib/assistente/acoes.js (apelidos e lista do cliente). Imports com .js (backend em Node ESM).

// Valor em reais: "r$ 250", "250", "250,00", "1.250,50", "250.5"; com "reais" opcional depois.
const RE_VALOR = /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?:\s*reais\b)?/g
// Logo antes do número: não é valor ("dia 10", "final 2122", "10/12", "nº 123").
const ANTES_NAO_VALOR = /(?:\bdia|\bfinal|\bn[º°o]?|\bnumero|\bcontrato|\bparcela|\bcota|[/:])\s*$/
// Logo depois do número: não é valor ("4x", "3 vezes", "10/12", "14h", "10%", "2 litros").
const DEPOIS_NAO_VALOR = /^\s*(?:x\b|vezes\b|parcelas?\b|\/|:|h\b|%|litros?\b|l\b|kg\b|km\b|un\b|unidades?\b|meses\b|anos?\b|dias?\b)/
// Trecho que começa com lugar ("no posto", "na padaria", "em casa") = onde gastou, não uma parte.
const LUGAR = /^(?:no|na|nos|nas|num|numa|em|pro|pra|para|ao|aos|à|a)\b/
// Fim do termo de uma parte.
const CORTE = /\s*(?:[,;.!?]|\be\b|\bsendo\b|\bno\b|\bna\b|\bnos\b|\bnas\b|\bem\b|\bpelo\b|\bpela\b|\bhoje\b|\bontem\b|\bpago\b|\bpaguei\b|\bcom o\b|\bcom a\b)/

const valorDe = (s) => {
  const v = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/\.(?=\d{3}(?:\D|$))/g, '')
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

// Valores do texto (normalizado) com a posição: [{ valor, ini, fim }].
function valoresDoTexto(t) {
  const out = []
  for (const m of t.matchAll(RE_VALOR)) {
    const ini = m.index
    const fim = ini + m[0].length
    if (/[\w]$/.test(t.slice(0, ini)) && !/r\$$/.test(t.slice(0, ini))) continue // meio de palavra/código
    if (ANTES_NAO_VALOR.test(t.slice(Math.max(0, ini - 12), ini))) continue
    if (DEPOIS_NAO_VALOR.test(t.slice(fim, fim + 12))) continue
    const valor = valorDe(m[1])
    if (valor) out.push({ valor, ini, fim })
  }
  return out
}

// Termo de uma parte: o trecho logo depois do valor, sem "de"/"com", até a vírgula, "e", "sendo",
// um lugar ("no …") ou o fim. Até 4 palavras. null se for lugar ou vazio.
function termoDaParte(trecho) {
  let s = trecho.replace(/^[\s,;:–—-]+/, '').replace(/^sendo\b\s*/, '')
  if (LUGAR.test(s)) return null
  s = s.replace(/^(?:de|do|da|dos|das|com)\s+/, '')
  const corte = s.search(CORTE)
  const termo = (corte >= 0 ? s.slice(0, corte) : s).trim().split(/\s+/).slice(0, 4).join(' ')
  return /[a-z]/.test(termo) ? termo : null
}

// → { total, partes: [{ valor, termo }], faltam } ou null.
//   O 1º valor é o TOTAL quando o que vem depois dele é um lugar, vírgula, "sendo" ou nada ("250 no
//   posto", "McDonald's 200,", "R$ 250 sendo"); os seguintes são as partes, cada um com o seu termo
//   ("200 de gasolina", "190 gasolina"). Partes somando MAIS que o total, parte que é lugar ("e 80
//   no ifood" = outro gasto) ou 1º valor com cara de parte ("250 de gasolina e 50 de…") → null: não é
//   rateio com total, quem decide é o modelo.
export function rateioDoTexto(texto) {
  // t: minúsculo e sem acento, para ler; orig: o mesmo texto (mesmas posições) para devolver o termo
  // como foi escrito ("alimentação", não "alimentacao").
  const orig = String(texto ?? '').normalize('NFC').replace(/\s+/g, ' ').trim()
  const t = orig.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const doOriginal = (termo, desde) => {
    const i = t.indexOf(termo, desde)
    return i >= 0 && t.length === orig.length ? orig.slice(i, i + termo.length) : termo
  }
  const valores = valoresDoTexto(t)
  if (valores.length < 2) return null
  const [primeiro, ...resto] = valores
  const depoisDoTotal = t.slice(primeiro.fim, resto[0].ini).replace(/^[\s,;:–—-]+/, '')
  if (depoisDoTotal && !LUGAR.test(depoisDoTotal) && !/^sendo\b/.test(depoisDoTotal)) return null
  const partes = []
  for (let i = 0; i < resto.length; i++) {
    const v = resto[i]
    const termo = termoDaParte(t.slice(v.fim, resto[i + 1]?.ini ?? t.length))
    if (!termo) return null
    partes.push({ valor: v.valor, termo: doOriginal(termo, v.fim) })
  }
  const soma = Math.round(partes.reduce((s, p) => s + p.valor, 0) * 100) / 100
  const faltam = Math.round((primeiro.valor - soma) * 100) / 100
  if (faltam < -0.004) return null
  return { total: primeiro.valor, partes, faltam: Math.max(0, faltam) }
}
