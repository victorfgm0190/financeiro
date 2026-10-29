// Assistente IA — utilitários de texto PUROS, usados pelo backend (api/_ia*.js) e pelo app.
// Imports SEMPRE com extensão .js: o backend roda em Node ESM sem bundler.

// Termo normalizado: minúsculo, sem acento, espaços simples. "Combustível " → "combustivel".
export function normalizarTermo(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 120)
}

export const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/
export const MES_ISO = /^\d{4}-\d{2}$/

// Texto limpo (null quando vazio), com limite de tamanho.
export const txt = (v, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

// Confiança 0..1.
export const conf = (v) => (Number.isFinite(Number(v)) ? Math.min(1, Math.max(0, Number(v))) : 0)

// Valor positivo com 2 casas, ou null.
export const valorPositivo = (v) => (Number(v) > 0 ? Math.round(Number(v) * 100) / 100 : null)

// Algum dos termos (já normalizados, como prefixo de palavra) aparece no texto normalizado?
export function contemPalavra(textoNormalizado, termos) {
  const t = ` ${textoNormalizado} `
  return termos.some(p => t.includes(` ${p}`))
}

// ─── Compra parcelada citada no texto (SMS/push de cartão, voz, frase livre) ─────────────────────
const POR_EXTENSO = { dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12 }
const N = String.raw`(\d{1,2}|${Object.keys(POR_EXTENSO).join('|')})`
const UNID = '(?:x|vezes|parcelas?)'
const VALOR = String.raw`(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)`
const numero = (w) => (/^\d+$/.test(w) ? Number(w) : POR_EXTENSO[w] ?? null)
// "1.400,00" / "350" / "350,5" / "350.50" → número.
function valorBr(v) {
  const s = /,\d{1,2}$/.test(v) ? v.replace(/\./g, '').replace(',', '.') : (/\.\d{3}$/.test(v) && !/\.\d{1,2}$/.test(v) ? v.replace(/\./g, '') : v)
  const n = Number(s)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

// Lê o parcelamento → { n, valorParcela, claro } ou null (à vista / não citado).
//   valorParcela: o texto deu o valor DA PARCELA ("4 vezes de 350", "4x de 350", "4 parcelas de
//     R$ 350") → total = n × valorParcela.
//   claro: o valor citado é sem dúvida o TOTAL ("R$ 350 em 4 vezes", "parcelei 350 em 4x",
//     "em 3x" do SMS) ou a parcela (acima). false = só "4x"/"4 vezes" soltos → tratar como TOTAL
//     e pedir conferência do valor.
export function parcelamentoDoTexto(texto) {
  const t = normalizarTermo(texto)
  const re = (src) => t.match(new RegExp(src))
  let m = re(String.raw`\b${N}\s*${UNID}\s+de\s+${VALOR}`)
  if (m && numero(m[1]) > 1 && numero(m[1]) <= 48) return { n: numero(m[1]), valorParcela: valorBr(m[2]), claro: true }
  // "em 4x" / "em 4 vezes" / "parcelei … em 4" / "dividi em 4". "em 4" SEM unidade só vale com
  // parcelei/dividi (senão "em 2 restaurantes", "em 29/10"…).
  m = re(String.raw`\bem\s+${N}\s*${UNID}\b`)
    || (/\b(parcel|dividi)/.test(t) ? re(String.raw`\b(?:parcel(?:ei|ado|ada|ar)|dividi(?:d[oa])?)\b[^.]*?\bem\s+${N}\b`) : null)
  if (m) {
    const n = numero(m[1])
    if (n > 1 && n <= 48) return { n, valorParcela: null, claro: true }
  }
  m = re(String.raw`\b${N}\s*${UNID}\b`)
  if (m) {
    const n = numero(m[1])
    if (n > 1 && n <= 48) return { n, valorParcela: null, claro: false }
  }
  return null
}

// Só o número de parcelas (2..48) ou null.
export const parcelasDoTexto = (texto) => parcelamentoDoTexto(texto)?.n ?? null

// Descrição genérica que não diz ONDE foi a compra ("Compra", "Compra em 3x", "Compra aprovada",
// "Compra parcelada", "Compra no cartão") → a prévia usa o estabelecimento (favorecido).
export function descricaoGenericaDeCompra(descricao) {
  const t = normalizarTermo(descricao)
  return !t || /^compra( (aprovada|parcelada|no cartao|no credito|em \d{1,2} ?x|de r\$ ?[\d.,]+))*$/.test(t)
}
