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

// Compra parcelada citada no texto (SMS/push de cartão): "em 3x", "3 parcelas", "parcelado em 3",
// "parcelada em 3x". Devolve N (2..48) ou null. À vista ("em 1x") → null.
export function parcelasDoTexto(texto) {
  const t = normalizarTermo(texto)
  const m = t.match(/\bem\s+(\d{1,2})\s*x\b/) || t.match(/\b(\d{1,2})\s*parcelas?\b/) || t.match(/\bparcelad[oa]\s+em\s+(\d{1,2})\s*x?\b/)
  const n = m ? Number(m[1]) : null
  return n && n > 1 && n <= 48 ? n : null
}

// Descrição genérica que não diz ONDE foi a compra ("Compra", "Compra em 3x", "Compra aprovada",
// "Compra parcelada", "Compra no cartão") → a prévia usa o estabelecimento (favorecido).
export function descricaoGenericaDeCompra(descricao) {
  const t = normalizarTermo(descricao)
  return !t || /^compra( (aprovada|parcelada|no cartao|no credito|em \d{1,2} ?x|de r\$ ?[\d.,]+))*$/.test(t)
}
