// Helpers de parcelamento compartilhados entre a importação de fatura (ImportPanel)
// e o "Editar Lançamento" (TransactionForm). Fonte única — antes viviam duplicados
// dentro do ImportPanel.
import { detectInstallment, normalizeInstallmentBase, installmentKey } from './installments.js'
import { descSimilarity, stripParcelaSuffix } from './conciliacaoMatch.js'

// serie_id: elo único de todas as parcelas de uma mesma compra. Gerado UMA vez na parcela
// base/origem e propagado às filhas — nunca alterado depois. À vista → null.
export function newSerieId() {
  const rand = Math.random().toString(36).slice(2, 10).padEnd(8, '0')
  return `serie_${Date.now()}_${rand}`
}

// Avança n meses em um string YYYY-MM (aceita n negativo — ex.: mês anterior).
export function addMonthToFatura(yyyymm, n) {
  if (!yyyymm) return ''
  const [y, m] = yyyymm.split('-').map(Number)
  const idx = y * 12 + (m - 1) + n
  const ty = Math.floor(idx / 12)
  const tm = ((idx % 12) + 12) % 12
  return `${ty}-${String(tm + 1).padStart(2, '0')}`
}

// Retorna a data de vencimento (YYYY-MM-DD) do cartão no mês da fatura.
export function faturaToDate(faturaYYYYMM, dueDay) {
  if (!faturaYYYYMM || !dueDay) return null
  const [y, m] = faturaYYYYMM.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return `${faturaYYYYMM}-${String(Math.min(dueDay, lastDay)).padStart(2, '0')}`
}

// "Clampa" a data de sistema ao período válido da fatura (YYYY-MM):
//   de (closingDay+1) do mês anterior até closingDay do mês da fatura.
// Se cair fora, retorna o dia de fechamento do mês da fatura.
export function clampDateToFatura(dateStr, faturaYYYYMM, closingDay) {
  if (!dateStr || !faturaYYYYMM || !closingDay) return dateStr
  const [y, m] = faturaYYYYMM.split('-').map(Number)
  if (!y || !m) return dateStr
  const lastDayFatura = new Date(y, m, 0).getDate()
  const endDay = Math.min(closingDay, lastDayFatura)
  const end = new Date(y, m - 1, endDay)            // closingDay do mês da fatura
  const start = new Date(y, m - 2, closingDay + 1)  // (closingDay+1) do mês anterior
  const d = new Date(dateStr + 'T00:00:00')
  if (d < start || d > end) return `${faturaYYYYMM}-${String(endDay).padStart(2, '0')}`
  return dateStr
}

// Data de SISTEMA (date) de uma parcela conforme a regra do Finup:
//   parcela 1/N ou à vista (num <= 1) → mantém a data informada (fallback);
//   parcela N/Total com N > 1         → dia `financialStartDay` do mês ANTERIOR à fatura
//                                       da parcela (a provisão é feita no ciclo financeiro
//                                       anterior ao ciclo da fatura). Ex.: fatura 2026-07 +
//                                       financialStartDay 15 → 2026-06-15.
// date_cartao (a data bruta do extrato) NUNCA é alterada por esta função.
export function installmentSystemDate(faturaYYYYMM, num, fallbackDate, financialStartDay) {
  if (!num || num <= 1 || !faturaYYYYMM) return fallbackDate
  return `${addMonthToFatura(faturaYYYYMM, -1)}-${String(financialStartDay || 1).padStart(2, '0')}`
}

// Detecta duplicata de parcelado: mesma base + mesmo número de parcela + valor ±R$0,50.
// Não compara fatura — se a parcela já existe no cartão, é duplicata independente do mês.
export function isDuplicateInstallment(row, existing, accountId) {
  const rowInst = detectInstallment(row.description)
  if (!rowInst) return false
  const rowBase = rowInst.base.toLowerCase().trim()
  return existing.some(t => {
    if (t.accountId !== accountId) return false
    if (Math.abs(t.amount - row.amount) > 0.50) return false
    const tInst = detectInstallment(t.description || '')
    if (!tInst || tInst.num !== rowInst.num) return false
    return tInst.base.toLowerCase().trim() === rowBase
  })
}

// Encontra no banco a transação de uma parcela específica (mesma base + número + conta,
// valor ±R$0,50). Usado para saber se uma parcela futura já existe.
export function findExistingParcela(inst, num, amount, accountId, existing) {
  const base = inst.base.toLowerCase().trim()
  return existing.find(t => {
    if (t.accountId !== accountId) return false
    if (Math.abs(t.amount - amount) > 0.50) return false
    const tInst = detectInstallment(t.description || '')
    if (!tInst || tInst.num !== num) return false
    return tInst.base.toLowerCase().trim() === base
  }) || null
}

// Prefixo PERMISSIVO para AGRUPAR parcelas irmãs já marcadas — remove o ÚLTIMO bloco
// "<dígitos>/<dígitos>" da descrição (tudo antes dele). Diferente do detectInstallment:
// não tem lookbehind nem valida se é parcela; serve só para casar irmãs de uma série já
// reconhecida (inclui formatos que o detector ignora, ex.: "BR1*PRIVALIA 7216001/03").
export function installmentPrefix(description) {
  const s = description || ''
  const re = /\d+\/\d+/g
  let last = null, m
  while ((m = re.exec(s)) !== null) last = m
  return normalizeInstallmentBase(last ? s.slice(0, last.index) : s)
}

// Gera a descrição de uma parcela k a partir de uma irmã âncora.
//  - formato reconhecido pelo detector → substitui "N/total" preservando a largura;
//  - formato permissivo (código de loja) → incrementa o bloco numérico antes da barra
//    em (k − anchorNum), preservando a largura, e mantém o total.
export function buildSiblingDescription(anchorDesc, anchorNum, k, total) {
  const det = detectInstallment(anchorDesc || '')
  if (det) {
    const numWidth = det.matchStr.split('/')[0].length
    return anchorDesc.replace(det.matchStr, `${String(k).padStart(numWidth, '0')}/${total}`)
  }
  const m = (anchorDesc || '').match(/(\d+)\/(\d+)(\s*)$/)
  // Sem N/M (parcela por extenso "Yelumseg Parc7" ou marcação manual): base + " k/total". Devolver
  // a própria descrição fazia a parcela faltante parecer já existente.
  if (!m) return `${stripParcelaSuffix(anchorDesc || '').trim() || (anchorDesc || '')} ${k}/${total}`
  const code = m[1]
  const newCode = String(Number(code) + (k - anchorNum)).padStart(code.length, '0')
  return anchorDesc.slice(0, m.index) + newCode + '/' + m[2] + m[3]
}

// Monta a visão de uma série a partir de um lançamento âncora (a parcela sendo editada).
// NÃO depende do detectInstallment para achar as irmãs: usa installment_num/installment_total
// JÁ gravados (detecção automática OU marcação manual) + prefixo permissivo. Assim o card
// "Parcela N de M" e o botão aparecem também para formatos que o detector ignora.
//
// Retorna null se o lançamento ainda não estiver marcado como parcela. Caso contrário:
//   { base, total, siblings, missing }
//   - siblings: parcelas existentes da série (mesma conta + total + prefixo), com _num
//   - missing : parcelas de 1..total AUSENTES, com campos herdados da irmã mais próxima
// serie_inicio (YYYY-MM) de uma parcela: fatura − (num − 1) meses (fallback: YYYY-MM da date).
// Mesma definição usada na installmentKey — distingue séries PARALELAS (mesma loja/total)
// que começam em meses diferentes, ex.: visitas distintas à mesma clínica.
function serieInicioOf(t) {
  const num = Number(t.installmentNum) || 1
  const ym = t.faturaMonthYear || (typeof t.date === 'string' && t.date.length >= 7 ? t.date.slice(0, 7) : null)
  if (!ym) return 'sem-fatura'
  return addMonthToFatura(ym, -(num - 1))
}

export function buildSeries(tx, transactions, account, financialStartDay = 1) {
  const total = Number(tx.installmentTotal) || null
  const myNum = Number(tx.installmentNum) || null
  if (!total || !myNum) return null
  const accountId = tx.accountId
  const prefix = installmentPrefix(tx.description)
  const serieInicio = serieInicioOf(tx)

  // Irmã = mesmo serie_id, OU mesmo prefixo antes do "N/M" e mesmo início de série, OU membro pelo
  // critério de série (cartão + base sem sufixo de parcela + valor + total). O último é o que junta
  // "Yelumseg Parc7" com "Yelumseg Parc6" e "Yelumseg 8/12" — sem ele o card via só a própria parcela.
  const refSerie = { accountId, base: tx.description, total, amount: tx.amount, serieInicio }
  const siblings = transactions
    .filter(t =>
      t.accountId === accountId &&
      t.installmentNum != null &&
      (Number(t.installmentTotal) || null) === total && (
        (tx.serieId && t.serieId === tx.serieId) ||
        (installmentPrefix(t.description) === prefix && serieInicioOf(t) === serieInicio) ||
        ehMembroDaSerie(t, refSerie)))
    .map(t => ({ ...t, _num: Number(t.installmentNum) }))
  // Garante a própria parcela na lista (o array pode estar desatualizado em alguns fluxos).
  if (!siblings.some(s => s.id === tx.id)) siblings.push({ ...tx, _num: myNum })
  siblings.sort((a, b) => a._num - b._num)

  const presentNums = new Set(siblings.map(s => s._num))
  const dueDay = account?.dueDay || null
  const closingDay = account?.closingDay || 14

  const missing = []
  for (let k = 1; k <= total; k++) {
    if (presentNums.has(k)) continue
    const anchor = [...siblings].sort((a, b) => Math.abs(a._num - k) - Math.abs(b._num - k))[0]
    if (!anchor) continue
    const futFatura = addMonthToFatura(anchor.faturaMonthYear, k - anchor._num)
    // Parcela 1 (se ausente) mantém a data efetiva da fatura; parcelas 2..N vão para o dia
    // financialStartDay do mês ANTERIOR à fatura da parcela (regra do Finup).
    const fallbackDate = clampDateToFatura(faturaToDate(futFatura, dueDay) || `${futFatura}-01`, futFatura, closingDay)
    const futDate = installmentSystemDate(futFatura, k, fallbackDate, financialStartDay)
    const description = buildSiblingDescription(anchor.description, anchor._num, k, total)
    // Guarda: se a descrição gerada já existe na conta, não oferece (cobre parcela
    // existente porém não-marcada no formato permissivo).
    if (transactions.some(t => t.accountId === accountId && t.description === description)) continue
    missing.push({
      num: k,
      total,
      description,
      amount: anchor.amount,
      faturaMonthYear: futFatura,
      date: futDate,
      categoryId: anchor.categoryId || '',
      grupoGerencial: anchor.grupoGerencial || null,
      payee: anchor.payee || '',
      reservaFuncaoId: anchor.reservaFuncaoId || null,
    })
  }
  // Completa = todas as N parcelas no histórico. `missing` vazio não basta: uma faltante pode ter
  // ficado de fora pela guarda de descrição acima.
  const presentes = [...presentNums].filter(n => n >= 1 && n <= total).length
  return { base: prefix, total, siblings, missing, presentes, completa: presentes >= total }
}

// Ordinal de cada parcela entre as GÊMEAS do arquivo: linhas com a MESMA identidade de chave
// (conta, base, num/total, centavos, mês da série) recebem 1, 2, 3… na ordem do extrato. Uma
// fatura traz cobranças legitimamente idênticas — a de 08/2026 tem duas "Payservice 5/5" de
// R$ 59,60 no mesmo dia — e sem o ordinal as duas geram a mesma installment_key: o índice único
// (e o dedup de reconcileInstallmentKeys) deixa passar só a primeira, e a segunda vira UPDATE
// dela em vez de um lançamento novo.
//
// A ordem do arquivo é a âncora de estabilidade: numa reimportação o Itaú lista as mesmas linhas
// na mesma ordem, então a 1ª gêmea reencontra a #1 gravada e a 2ª reencontra a #2 — nenhuma das
// duas vira lançamento extra. Só a 2ª em diante recebe ordinal; a 1ª fica sem, mantendo as
// chaves já gravadas intactas.
// `faturaMY` sobrepõe a fatura da linha — a conciliação trabalha com itens crus do arquivo,
// que ainda não têm faturaMonthYear, e grava todos no mês de referência selecionado.
export function assignInstallmentOccurrences(rows, accountId, faturaMY) {
  const vistos = new Map()
  return rows.map(row => {
    if (!row._installment || (row.type || 'expense') !== 'expense') return row
    const base = installmentKey({
      accountId, description: row.description,
      installmentNum: row._installment.num, installmentTotal: row._installment.total,
      amount: row.amount, faturaMonthYear: faturaMY || row.faturaMonthYear, date: row.date,
    })
    if (!base) return row
    const n = (vistos.get(base) || 0) + 1
    vistos.set(base, n)
    return n > 1 ? { ...row, _installmentOccurrence: n } : row
  })
}

// Série já gravada no cartão de uma parcela que chegou SEM o total ("Yelumseg Parc7"): mesma
// conta, despesa com installment_total preenchido, valor ±R$ 0,05 e base da descrição igual ou
// parecida (≥ 0,7, sem o sufixo de parcela de nenhum dos lados). `total`, quando a linha traz,
// restringe às séries desse tamanho. Entre séries candidatas vence a mais parecida e, no empate,
// a que começou por último — uma série encerrada do ano anterior com o mesmo valor perde para a
// que está em andamento. Devolve { total, anchor } (anchor = irmã mais próxima do número) ou null.
export function inferirSerieParcela({ base, num, total = null, amount, accountId }, transactions) {
  const baseLimpa = stripParcelaSuffix(base)
  let best = null
  for (const t of transactions || []) {
    if (t.accountId !== accountId || (t.type || 'expense') !== 'expense') continue
    const tTotal = Number(t.installmentTotal) || 0
    const tNum = Number(t.installmentNum) || 0
    if (tTotal < 2 || !tNum || num > tTotal) continue
    if (total != null && tTotal !== total) continue
    if (Math.abs((Number(t.amount) || 0) - (Number(amount) || 0)) > 0.05) continue
    const sim = descSimilarity(stripParcelaSuffix(t.description), baseLimpa)
    if (sim < 0.7) continue
    const cand = { t, sim, inicio: serieInicioOf(t), dist: Math.abs(tNum - num) }
    if (!best
      || cand.sim > best.sim
      || (cand.sim === best.sim && cand.inicio > best.inicio)
      || (cand.sim === best.sim && cand.inicio === best.inicio && cand.dist < best.dist)) best = cand
  }
  return best ? { total: Number(best.t.installmentTotal), anchor: best.t } : null
}

// Parcela `num` da série de `anchor` já gravada (gerada antes ou importada noutra fatura): mesmo
// serie_id quando a âncora tem; senão mesma conta + total + início de série + base parecida.
// `usados` = lançamentos já casados por outra linha do arquivo (1:1).
export function findParcelaDaSerie(anchor, num, amount, transactions, usados) {
  if (!anchor) return null
  const total = Number(anchor.installmentTotal)
  const inicio = serieInicioOf(anchor)
  const baseAnchor = stripParcelaSuffix(anchor.description)
  return (transactions || []).find(t => {
    if (usados?.has(t.id)) return false
    if (t.accountId !== anchor.accountId || (t.type || 'expense') !== 'expense') return false
    if (Number(t.installmentNum) !== num || Number(t.installmentTotal) !== total) return false
    if (Math.abs((Number(t.amount) || 0) - (Number(amount) || 0)) > 0.50) return false
    if (anchor.serieId && t.serieId) return t.serieId === anchor.serieId
    return serieInicioOf(t) === inicio && descSimilarity(stripParcelaSuffix(t.description), baseAnchor) >= 0.7
  }) || null
}

// Fatura (YYYY-MM) gravada de um lançamento; sem ela, o mês da data (aproximação suficiente
// para parcela, que sempre nasce com fatura).
const faturaDe = (t) => t.faturaMonthYear || (typeof t.date === 'string' ? t.date.slice(0, 7) : '')
const baseParecida = (descA, baseB) => {
  const a = stripParcelaSuffix(descA), b = stripParcelaSuffix(baseB)
  return a.trim().toLowerCase() === b.trim().toLowerCase() || descSimilarity(a, b) >= 0.7
}

// Parcela futura já gravada que equivale à que se vai gerar: mesmo serie_id e número, OU mesma
// conta + base da descrição + valor ±R$ 0,05 + num/total + fatura. Sem esta segunda via, cada
// importação mensal de "Yelumseg ParcN" gerava de novo as parcelas seguintes ("Parc2 11/12",
// "Parc3 11/12"…): a base com o "ParcN" do mês nunca batia com a da importação anterior.
export function findParcelaEquivalente({ accountId, base, amount, num, total, faturaMonthYear, serieId }, transactions) {
  return (transactions || []).find(t => {
    if (t.accountId !== accountId || (t.type || 'expense') !== 'expense') return false
    if (Number(t.installmentNum) !== num || Number(t.installmentTotal) !== total) return false
    if (serieId && t.serieId === serieId) return true
    if (Math.abs((Number(t.amount) || 0) - (Number(amount) || 0)) > 0.05) return false
    return faturaDe(t) === faturaMonthYear && baseParecida(t.description, base)
  }) || null
}

const mesesEntre = (a, b) => {
  const [ya, ma] = String(a).split('-').map(Number)
  const [yb, mb] = String(b).split('-').map(Number)
  return (yb * 12 + mb) - (ya * 12 + ma)
}

// Folga no início da série (fatura − (num − 1)). Parcela antiga sem fatura_month_year cai no mês
// da data — o anterior à fatura — e o início exato deixava essas irmãs de fora do backfill (o bug
// da "Yelumseg Parc7" sozinha na série). A renovação do ano seguinte, com mesmo valor e total,
// começa 12 meses depois e continua separada.
export const SERIE_INICIO_TOLERANCIA = 2

// Membro de uma série sem depender do serie_id: mesmo cartão, base da descrição (sem sufixo de
// parcela), valor ±R$ 0,05 e installment_total, com o início da série dentro da folga.
export function ehMembroDaSerie(t, { accountId, base, total, amount, serieInicio }) {
  if (t.accountId !== accountId || (t.type || 'expense') !== 'expense') return false
  if (Number(t.installmentTotal) !== Number(total) || !Number(t.installmentNum)) return false
  if (Math.abs((Number(t.amount) || 0) - (Number(amount) || 0)) > 0.05) return false
  if (!baseParecida(t.description, base)) return false
  const ini = serieInicioOf(t)
  if (!serieInicio || serieInicio === 'sem-fatura' || ini === 'sem-fatura') return true
  return Math.abs(mesesEntre(ini, serieInicio)) <= SERIE_INICIO_TOLERANCIA
}

// Todos os lançamentos gravados da série (inclusive cópias duplicadas): mesmo serie_id, ou membro
// pelo critério acima. Usado para gravar o MESMO serie_id em todos.
export function membrosDaSerie(ref, transactions) {
  return (transactions || []).filter(t => (ref.serieId && t.serieId === ref.serieId) || ehMembroDaSerie(t, ref))
}

// serie_id que a série inteira deve ter: o mais frequente entre os membros (empate → o primeiro
// visto). null quando nenhum membro tem.
export function serieIdDominante(membros) {
  const cont = new Map()
  for (const t of membros || []) if (t.serieId) cont.set(t.serieId, (cont.get(t.serieId) || 0) + 1)
  let melhor = null, n = 0
  for (const [id, c] of cont) if (c > n) { melhor = id; n = c }
  return melhor
}
