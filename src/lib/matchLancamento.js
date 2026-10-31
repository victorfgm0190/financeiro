// Correspondência de um lançamento de CARTÃO que está para nascer (SMS/pedido do Assistente; depois a
// Importar Fatura) com os que já estão nas faturas do mesmo cartão. PURO, sem nomes fixos.
//
// Candidatos: despesas/receitas do MESMO cartão (account_id — as parcelas costumam ter card_id NULL)
// na fatura de referência e nas vizinhas (anterior e seguinte), só faturas abertas.
// Critérios:
//   nome   — favorecido/descrição normalizados (sem acento, sem "*", sem intermediador "MP *", "PTY*"
//            pelo formato, sem números/parcela) por similaridade; apelido aprendido (ia_apelidos) casa direto.
//   parcela— "Parc8", "Parc 8", "8/12", "08/12", "P8", "parcela 8"; parcela igual reforça muito,
//            parcela diferente derruba o match forte.
//   valor  — igual (±R$ 0,01) ou próximo (±5%: sugere ajuste).
//   status — pendentes (não conciliados) primeiro.
// Força: 'forte' = nome parecido e valor igual/próximo, ou valor igual com a mesma parcela;
// 'fraco' = só o nome parecido (apenas sugerir, nunca agir).
import { detectParcela } from './installments.js'
import { numeroParcelaDoTx, totalParcelasDoTx } from './revisaoImportacao.js'
import { faturaDoLancamento } from './scheduleBaixa.js'
import { faturaEstaFechada } from './faturasFechadas.js'
import { normalizarTermo } from './assistente/texto.js'
import { semIntermediador, prefixoParecido } from './assistente/nomeParecido.js'

export const TOL_VALOR_IGUAL = 0.01
export const TOL_VALOR_PROXIMO = 0.05
export const SIMILARIDADE_MINIMA = 0.6
export const MAX_CORRESPONDENCIAS = 3
// À vista / parcela 1: a data da compra é comparável — além disto é outra compra (assinatura do mês
// seguinte, mesma loja noutro dia). Parcela N > 1 casa pelo número, sem olhar a data.
export const JANELA_DIAS_COMPRA = 5

const centavos = (v) => Math.round(Math.abs(Number(v) || 0) * 100)
const diasEntre = (a, b) => Math.abs(Math.round((new Date(`${String(a).slice(0, 10)}T12:00:00Z`) - new Date(`${String(b).slice(0, 10)}T12:00:00Z`)) / 86_400_000))

// ─── Parcela ─────────────────────────────────────────────────────────────────────────────────────
// No texto livre (SMS) "08/12" pode ser data: só os formatos por extenso ("Parc8", "parcela 8", "P8").
// Na descrição curta (estabelecimento) vale também "N/Total".
const RE_P = /(?:^|[^a-z0-9])p\.?\s?0*(\d{1,2})(?![0-9])/i
export function parcelaDoTexto(texto, { aceitaBarra = true } = {}) {
  const s = String(texto || '')
  if (!s.trim()) return null
  const det = aceitaBarra ? detectParcela(s) : (/\bparc/i.test(s) ? detectParcela(s.replace(/(?<!\d)\d{1,2}\/\d{1,2}(?!\d)/g, ' ')) : null)
  if (det?.num) return { num: det.num, total: det.total ?? null }
  const m = s.match(RE_P)
  return m && Number(m[1]) >= 1 ? { num: Number(m[1]), total: null } : null
}

const parcelaDoExistente = (t) => {
  const num = numeroParcelaDoTx(t)
  const total = totalParcelasDoTx(t)
  return num ? { num, total: total || null } : null
}

// ─── Nome ────────────────────────────────────────────────────────────────────────────────────────
export function normalizarNome(s) {
  return normalizarTermo(semIntermediador(String(s || '').replace(/^\s*[a-z]{2,4}\s?\*\s*/i, '')))
    .replace(/\*/g, ' ')
    .replace(/\bparc(?:ela)?\.?\s*\d{1,2}(?:\s*(?:de|\/)\s*\d{1,2})?/g, ' ')
    .replace(/(?<!\d)\d{1,2}\/\d{1,2}(?!\d)/g, ' ')
    .replace(/[0-9]+/g, ' ')
    .replace(/[^a-z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const bigramas = (s) => {
  const x = s.replace(/ /g, '')
  const out = []
  for (let i = 0; i < x.length - 1; i++) out.push(x.slice(i, i + 2))
  return out
}
// Dice por bigramas (0..1) entre nomes normalizados.
export function similaridade(a, b) {
  const x = normalizarNome(a), y = normalizarNome(b)
  if (!x || !y) return 0
  if (x === y) return 1
  if (prefixoParecido(x, y)) return 0.9
  const ba = bigramas(x), bb = bigramas(y)
  if (!ba.length || !bb.length) return 0
  const resto = [...bb]
  let comuns = 0
  for (const g of ba) {
    const i = resto.indexOf(g)
    if (i >= 0) { comuns++; resto.splice(i, 1) }
  }
  const dice = (2 * comuns) / (ba.length + bb.length)
  // Uma palavra forte (4+ letras) igual nos dois lados também conta ("vercel inc" × "vercel pro").
  const pa = x.split(' ').filter(w => w.length >= 4)
  const pb = y.split(' ').filter(w => w.length >= 4)
  const palavra = pa.some(w => pb.some(v => v === w || v.startsWith(w) || w.startsWith(v))) ? 0.7 : 0
  return Math.max(dice, palavra)
}

// Apelido aprendido (ia_apelidos: { tipo, termo, ref_id }) que leva o nome ao favorecido do existente.
const apelidoLeva = (nomes, t, apelidos) => {
  if (!apelidos?.length || !t.payee) return false
  const termos = new Set(nomes.flatMap(n => [normalizarTermo(n), normalizarNome(n)]).filter(Boolean))
  return apelidos.some(a => (a.tipo === 'favorecido' || a.tipo === 'descricao_fatura') && termos.has(a.termo) && a.ref_id === t.payee)
}

const simNomes = (nomes, t) => {
  const deles = [t.payee, t.description].filter(Boolean)
  let best = 0
  for (const a of nomes) for (const b of deles) best = Math.max(best, similaridade(a, b))
  return best
}

// ─── Fatura ──────────────────────────────────────────────────────────────────────────────────────
export const somarMes = (ym, n) => {
  const [y, m] = String(ym).split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
export const rotuloFatura = (ym) => (ym ? `${ym.slice(5, 7)}/${ym.slice(0, 4)}` : '')

// ─── Busca ───────────────────────────────────────────────────────────────────────────────────────
// novo: { accountId, type, amount, date, payee?, description?, faturaMonthYear?, parcela? ({num,total}),
//         textoOriginal? }. ctx: { transactions, accounts, apelidos, faturasFechadas }.
// opcoes: excluirIds (já casados com outra linha), janelaDias (à vista), conciliadosSoNaFatura (um
//   conciliado de OUTRA fatura já foi conferido contra ela — Importar Fatura), fracosSoPendentes.
// → { fortes: [m], fracos: [m] }, m = { tx, forca, fatura, simNome, valorIgual, valorProximo,
//     parcelaIgual, diferencaValor, dataDiverge, pendente }.
export function buscarCorrespondencias(novo, { transactions = [], accounts = [], apelidos = [], faturasFechadas = null } = {}, {
  excluirIds = null, janelaDias = JANELA_DIAS_COMPRA, conciliadosSoNaFatura = false, fracosSoPendentes = false,
} = {}) {
  const vazio = { fortes: [], fracos: [] }
  if (!novo?.accountId || !(Number(novo.amount) > 0)) return vazio
  const cartao = accounts.find(a => a.id === novo.accountId)
  if (!cartao || cartao.type !== 'credit') return vazio
  const closingDay = cartao.closingDay || 14
  const tipo = novo.type || 'expense'
  const ref = novo.faturaMonthYear || (novo.date ? faturaDoLancamento({ date: novo.date }, closingDay) : null)
  if (!ref) return vazio
  const faturas = new Set([somarMes(ref, -1), ref, somarMes(ref, 1)].filter(f => !faturaEstaFechada(faturasFechadas, cartao.id, f)))

  const nomes = [novo.payee, novo.description].filter(Boolean)
  const pn = novo.parcela
    || parcelaDoTexto(novo.description)
    || parcelaDoTexto(novo.textoOriginal, { aceitaBarra: false })
  const valor = centavos(novo.amount)

  const out = []
  for (const t of transactions) {
    if (t.accountId !== cartao.id || (t.type || 'expense') !== tipo || t.isEspelho || t.reservaAuto) continue
    if (excluirIds?.has(t.id)) continue
    const fatura = faturaDoLancamento(t, closingDay)
    if (!faturas.has(fatura)) continue
    if (conciliadosSoNaFatura && t.reconciled && fatura !== ref) continue
    const simNome = apelidoLeva(nomes, t, apelidos) ? 1 : simNomes(nomes, t)
    const nomeOk = simNome >= SIMILARIDADE_MINIMA
    const vt = centavos(t.amount)
    const diff = Math.abs(vt - valor)
    const valorIgual = diff <= TOL_VALOR_IGUAL * 100
    const valorProximo = !valorIgual && diff <= Math.max(1, vt * TOL_VALOR_PROXIMO)
    const pt = parcelaDoExistente(t)
    const parcelaIgual = !!(pn && pt && pn.num === pt.num && (!pn.total || !pt.total || pn.total === pt.total))
    const parcelaConflita = !!(pn && pt && !parcelaIgual)
    // Parcela N > 1 tem a data do dia financeiro: não é comparável com a data da compra.
    const ehParcelaSeguinte = (pt?.num || 0) > 1 || (pn?.num || 0) > 1
    const dataDoTx = t.dateCartao ? String(t.dateCartao).slice(0, 10) : t.date
    const longeDemais = !ehParcelaSeguinte && janelaDias != null && !!novo.date && !!dataDoTx && diasEntre(novo.date, dataDoTx) > janelaDias
    const forte = !parcelaConflita && !longeDemais && ((nomeOk && (valorIgual || valorProximo)) || (valorIgual && parcelaIgual))
    if (!forte && !nomeOk) continue
    if (!forte && fracosSoPendentes && t.reconciled) continue
    const dataDiverge = !ehParcelaSeguinte && !!novo.date && !!dataDoTx && dataDoTx !== novo.date
    const score = (forte ? 100 : 0) + (parcelaIgual ? 40 : 0) + (valorIgual ? 20 : valorProximo ? 8 : 0)
      + simNome * 10 + (t.reconciled ? 0 : 15) + (fatura === ref ? 3 : 0)
      - (novo.date && dataDoTx ? Math.min(diasEntre(novo.date, dataDoTx), 60) * 0.1 : 0)
    out.push({
      tx: t, forca: forte ? 'forte' : 'fraco', fatura, simNome, valorIgual, valorProximo, parcelaIgual,
      diferencaValor: Math.round((Number(novo.amount) - Number(t.amount)) * 100) / 100,
      dataDiverge, pendente: !t.reconciled, score,
    })
  }
  out.sort((a, b) => b.score - a.score)
  const fortes = out.filter(m => m.forca === 'forte').slice(0, MAX_CORRESPONDENCIAS)
  const fracos = fortes.length ? [] : out.filter(m => m.forca === 'fraco').slice(0, MAX_CORRESPONDENCIAS)
  return { fortes, fracos }
}

// Ajuste proposto ao existente: valor (se diverge) e data (só à vista / parcela 1).
export function ajusteProposto(m, novo) {
  const out = {}
  if (!m.valorIgual) out.amount = Math.round(Number(novo.amount) * 100) / 100
  if (m.dataDiverge && novo.date) out.date = novo.date
  return out
}

// Campos herdados do existente/série para o lançamento novo (o que a prévia não trouxe).
export function camposHerdados(tx) {
  if (!tx) return {}
  const out = {}
  if (tx.categoryId) out.categoryId = tx.categoryId
  if (tx.costCenter) out.costCenter = tx.costCenter
  if (tx.tipoDocumentoId) out.tipoDocumentoId = tx.tipoDocumentoId
  if (tx.grupoGerencial) out.grupoGerencial = tx.grupoGerencial
  return out
}

// Categoria mais usada nos lançamentos do favorecido (nome igual ou muito parecido). null sem histórico.
export function categoriaMaisUsada(nome, transactions = [], { tipo = 'expense' } = {}) {
  const alvo = normalizarNome(nome)
  if (!alvo) return null
  const cont = new Map()
  for (const t of transactions) {
    if (!t.categoryId || (t.type || 'expense') !== tipo || !t.payee) continue
    const p = normalizarNome(t.payee)
    if (p !== alvo && similaridade(p, alvo) < 0.9) continue
    cont.set(t.categoryId, (cont.get(t.categoryId) || 0) + 1)
  }
  let best = null
  for (const [id, n] of cont) if (!best || n > best.n) best = { id, n }
  return best?.id || null
}
