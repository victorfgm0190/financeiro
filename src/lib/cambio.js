// COMPRA EM MOEDA ESTRANGEIRA no cartão (SMS/foto "US$ 20,00"): valor em R$ ESTIMADO até a fatura.
//   R$ = US$ × PTAX venda do dia da compra × (1 + spread do cartão), ao centavo.
//   Spread do cartão: média das últimas 3 compras em moeda estrangeira JÁ CONFIRMADAS pela fatura
//     (real ÷ (US$ × PTAX) − 1, gravado na compra ao casar na importação); sem histórico, o padrão do
//     cartão (Editar Conta) ou 2,5%.
//   IOF (alíquota do ambiente, padrão 3,5%): cartão com "IOF em linha separada" (padrão sim) → um
//     lançamento estimado à parte, ligado à compra (compraIofId); senão entra no valor da compra.
// PURO: usado pela prévia do Assistente, pelo AppContext (IOF ligado) e pela importação de fatura.
import { normalizarTermo } from './assistente/texto.js'

export const SPREAD_PADRAO = 0.025
export const IOF_PADRAO = 0.035
export const COMPRAS_DO_SPREAD = 3
export const MOEDAS = { USD: { simbolo: 'US$' } }

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const fracao = (v, padrao) => (Number.isFinite(Number(v)) && v !== null && v !== '' && Number(v) >= 0 && Number(v) < 1 ? Number(v) : padrao)

// "20,00" / "1.234,56" / "20.00" / "20" → número (ou null).
export function numeroDoTexto(s) {
  const t = String(s || '').trim()
  if (!t) return null
  let n
  if (/,\d{1,2}$/.test(t)) n = Number(t.replace(/\./g, '').replace(',', '.'))
  else if (/\.\d{1,2}$/.test(t) && !/\.\d{3}/.test(t.replace(/\.\d{1,2}$/, ''))) n = Number(t.replace(/,/g, ''))
  else n = Number(t.replace(/[.,]/g, ''))
  return Number.isFinite(n) && n > 0 ? r2(n) : null
}

// Moeda citada no texto: "US 20,00", "US$ 20", "USD 20", "U$ 20", "20 dólares" → { moeda: 'USD', valor }.
// Sem moeda estrangeira → null (o valor segue em real).
const RE_USD_ANTES = /(?:^|[^a-z])(?:usd|us\$|u\$|us)\s*([\d.,]*\d)/i
const RE_USD_DEPOIS = /([\d.,]*\d)\s*(?:usd|d[oó]lar(?:es)?)\b/i
export function moedaDoTexto(texto) {
  const s = String(texto || '')
  const m = s.match(RE_USD_ANTES) || s.match(RE_USD_DEPOIS)
  const valor = m ? numeroDoTexto(m[1]) : null
  return valor ? { moeda: 'USD', valor } : null
}

export const aliquotaIof = (settings) => fracao(settings?.iofCompraInternacional, IOF_PADRAO)
export const iofEmLinhaSeparada = (cartao) => cartao?.iofLinhaSeparada !== false

// Compra em moeda estrangeira CONFIRMADA (com spread real gravado) — base do spread aprendido.
const confirmada = (t) => !!t.moeda && !t.estimado && Number(t.valorOriginal) > 0 && Number(t.cotacao) > 0 && Number.isFinite(Number(t.spread))

// → { spread, origem: 'historico' | 'cartao' | 'padrao', n }.
export function spreadDoCartao(cartao, transactions = []) {
  const ultimas = (transactions || [])
    .filter(t => t.accountId === cartao?.id && t.type === 'expense' && confirmada(t))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, COMPRAS_DO_SPREAD)
  if (ultimas.length) {
    const media = ultimas.reduce((s, t) => s + Number(t.spread), 0) / ultimas.length
    return { spread: Math.round(media * 10000) / 10000, origem: 'historico', n: ultimas.length }
  }
  const doCartao = fracao(cartao?.spreadCambio, null)
  return doCartao != null ? { spread: doCartao, origem: 'cartao', n: 0 } : { spread: SPREAD_PADRAO, origem: 'padrao', n: 0 }
}

export const iofDe = (valorReais, aliquota) => r2(Number(valorReais) * aliquota)

// Valores da compra: valorCompra (o lançamento) e iof (o lançamento separado; 0 quando embutido).
// cotacao null (PTAX indisponível) → valorCompra null: o usuário digita.
export function planoCompraEstrangeira({ valorOriginal, cotacao, spread, aliquota, separada }) {
  if (!(Number(cotacao) > 0) || !(Number(valorOriginal) > 0)) return { valorCompra: null, iof: 0 }
  const reais = r2(Number(valorOriginal) * Number(cotacao) * (1 + spread))
  if (separada) return { valorCompra: reais, iof: iofDe(reais, aliquota) }
  return { valorCompra: r2(reais * (1 + aliquota)), iof: 0 }
}

// Campos gravados na compra estimada.
export const camposDaCompra = ({ moeda, valorOriginal, cotacao, spread, dataCotacao = null }) => ({
  moeda, valorOriginal: r2(valorOriginal), cotacao: Number(cotacao) > 0 ? Number(cotacao) : null,
  dataCotacao: Number(cotacao) > 0 ? dataCotacao : null,
  spread: Number(cotacao) > 0 ? spread : null, estimado: true,
})

export const descricaoIof = (estabelecimento) => `IOF compra internacional — ${String(estabelecimento || '').trim() || 'compra'}`.slice(0, 120)
export const ehIof = (t) => /\biof\b/.test(normalizarTermo(t?.description))

// Categoria que o usuário já usa para IOF (a mais frequente nos lançamentos de IOF); null = perguntar.
export function categoriaDoIof(transactions = []) {
  const n = new Map()
  for (const t of transactions || []) if (t.categoryId && t.type === 'expense' && ehIof(t)) n.set(t.categoryId, (n.get(t.categoryId) || 0) + 1)
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] || null
}

// IOF estimado da compra (lançamento separado), na mesma conta/data/fatura.
export function lancamentoDoIof(compra, { valor, categoryId }) {
  return {
    type: 'expense', accountId: compra.accountId, amount: valor, date: compra.date,
    ...(compra.faturaMonthYear ? { faturaMonthYear: compra.faturaMonthYear } : {}),
    description: descricaoIof(compra.payee || compra.description), categoryId: categoryId || '',
    compraIofId: compra.id, estimado: true,
  }
}

// Compra estimada casada com o valor REAL da fatura: tira o "estimado" e grava o spread real.
export function ajusteDaCompraEstimada(compra, valorReal) {
  const real = r2(valorReal)
  const out = { amount: real, estimado: false }
  if (Number(compra.valorOriginal) > 0 && Number(compra.cotacao) > 0) {
    out.spread = Math.round((real / (Number(compra.valorOriginal) * Number(compra.cotacao)) - 1) * 10000) / 10000
  }
  return out
}

// A compra mudou (ou foi apagada: compra null) → o que fazer com os IOFs ligados a ela.
// IOF ainda estimado acompanha valor (alíquota × novo valor), conta, data e fatura; IOF já confirmado
// pela fatura não muda. Compra apagada → apaga os IOFs. → { apagar: [ids], mudar: [{ id, changes }] }.
export function iofAposMudancaDaCompra(compra, iofs, aliquota) {
  if (!compra) return { apagar: iofs.map(t => t.id), mudar: [] }
  const mudar = []
  for (const t of iofs) {
    if (!t.estimado) continue
    const alvo = { amount: iofDe(compra.amount, aliquota), accountId: compra.accountId, date: compra.date, faturaMonthYear: compra.faturaMonthYear || t.faturaMonthYear || null }
    const changes = {}
    if (Math.round(alvo.amount * 100) !== Math.round(Number(t.amount) * 100)) changes.amount = alvo.amount
    for (const k of ['accountId', 'date', 'faturaMonthYear']) if (alvo[k] && alvo[k] !== t[k]) changes[k] = alvo[k]
    if (Object.keys(changes).length) mudar.push({ id: t.id, changes })
  }
  return { apagar: [], mudar }
}

// Selo da lista/prévia: "US$ 20,00 × 5,0x".
export function rotuloCambio(t) {
  if (!t?.moeda || !(Number(t.valorOriginal) > 0)) return null
  const simb = MOEDAS[t.moeda]?.simbolo || t.moeda
  const orig = Number(t.valorOriginal).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const tx = Number(t.amount) > 0 ? (Number(t.amount) / Number(t.valorOriginal)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null
  return `${simb} ${orig}${tx ? ` × ${tx}` : ''}`
}
