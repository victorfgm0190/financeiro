// Ocorrência de agendamento de cartão × lançamento de cartão.
//
// PRINCÍPIO: casam por (cartão, valor ±R$ 0,05, fatura). A fatura da ocorrência é a da data
// EFETIVA dela pelo dia de fechamento; a do lançamento é o faturaMonthYear gravado. Data exata
// não serve: as parcelas geradas ficam no dia financeiro (15) e o agendamento no dia 30 — uma
// janela de dias casava a ocorrência com a parcela do mês errado. A similaridade de descrição
// (base sem sufixo de parcela) só desempata entre candidatos.
//
// Três usos:
//   • importação, linha nova (regra B)         → baixa "importado" + "coberta_parcela" nas futuras;
//   • importação, linha já no cartão (regra A) → baixa "ja_no_cartao";
//   • relatórios (regra C)                     → ocorrência pendente já coberta por lançamento
//     do cartão fica fora das projeções, sem alterar o agendamento. Regra C exige mais (data e
//     descrição) — ver txCobrindoOcorrencia.
import { computeOccurrences, registerAndAdvance } from './occurrences.js'
import { occEfetiva } from './fluxoCaixa.js'
import { descSimilarity, stripParcelaSuffix, normText } from './conciliacaoMatch.js'

export const BAIXA_TOLERANCIA_VALOR = 0.05

// Tipos de registered_meta. `registered` continua sendo a verdade da baixa (computeOccurrences
// lê só ele); o meta diz COMO a ocorrência foi baixada e por qual lançamento/importação.
export const TIPO_BAIXA = {
  PAGO: 'pago',                       // botão Pagar
  IMPORTADO: 'importado',             // regra B: linha nova da fatura
  JA_NO_CARTAO: 'ja_no_cartao',       // regra A / botão "Baixar como já no cartão"
  COBERTA_PARCELA: 'coberta_parcela', // regra B: parcela futura da série cobre a ocorrência
}
const TIPOS_DE_IMPORTACAO = new Set([TIPO_BAIXA.IMPORTADO, TIPO_BAIXA.JA_NO_CARTAO, TIPO_BAIXA.COBERTA_PARCELA])

// Agendamentos gerados pelo motor gerencial/fatura não são cobranças do cartão.
const TIPOS_MOTOR = new Set(['gerencial_devolucao', 'resgate_reserva', 'pagamento_fatura'])

// YYYY-MM da fatura em que a data cai: dia <= fechamento → mês corrente; senão o seguinte.
export function faturaDaData(dateStr, closingDay = 14) {
  if (!dateStr) return ''
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return ''
  const idx = (y * 12 + (m - 1)) + (d <= (closingDay || 14) ? 0 : 1)
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`
}

export const faturaDoLancamento = (t, closingDay = 14) =>
  t.faturaMonthYear || faturaDaData(t.date, closingDay)

export const cartaoDoAgendamento = (s) => s?.cardId || s?.accountId || null

export const ehAgendamentoDeCartao = (s, cardId) =>
  !!s && s.transactionType === 'expense' && !TIPOS_MOTOR.has(s.tipo) &&
  (s.accountId === cardId || s.cardId === cardId)

export const baixaKey = (c) => `${c.scheduleId}|${c.occurrenceDate}`

const valorProximo = (a, b) => Math.abs((Number(a) || 0) - (Number(b) || 0)) <= BAIXA_TOLERANCIA_VALOR

// Ocorrências PENDENTES (exclui registered/skipped) com a fatura e o valor efetivos de cada uma.
export function ocorrenciasPendentes(s, closingDay = 14, limite = 36) {
  return computeOccurrences(s, limite).map(date => {
    const ef = occEfetiva(s, date)
    return { date, fatura: faturaDaData(ef.date, closingDay), amount: Number(ef.amount) || 0 }
  })
}

// Lançamentos já presos a uma ocorrência: os que levam scheduleId (Pagar, importação) e os
// citados em registered_meta de uma ocorrência ainda registrada. Esses não cobrem outra.
export function lancamentosVinculados(schedules, transactions) {
  const ids = new Set()
  for (const t of transactions || []) if (t.scheduleId) ids.add(t.id)
  for (const s of schedules || []) {
    const reg = new Set(s.registered || [])
    for (const [date, meta] of Object.entries(s.registeredMeta || {})) {
      if (reg.has(date) && meta?.lancamento_id) ids.add(meta.lancamento_id)
    }
  }
  return ids
}

// ── Importação ───────────────────────────────────────────────────────────────

// Candidatos de UMA linha, do mais parecido para o menos. `card` = { id, closingDay }.
export function candidatosBaixa({ description, payee, amount, type, faturaMonthYear }, schedules, card) {
  if ((type || 'expense') !== 'expense' || !card?.id || !faturaMonthYear) return []
  const baseLinha = stripParcelaSuffix(description)
  const out = []
  for (const s of schedules || []) {
    if (!ehAgendamentoDeCartao(s, card.id)) continue
    const occ = ocorrenciasPendentes(s, card.closingDay)
      .find(o => o.fatura === faturaMonthYear && valorProximo(o.amount, amount))
    if (!occ) continue
    const sim = Math.max(
      descSimilarity(baseLinha, stripParcelaSuffix(s.description)),
      s.payee ? descSimilarity(baseLinha, s.payee) : 0,
      (s.payee && payee) ? descSimilarity(payee, s.payee) : 0,
    )
    out.push({ scheduleId: s.id, description: s.description || '', occurrenceDate: occ.date, fatura: occ.fatura, sim })
  }
  return out.sort((a, b) => b.sim - a.sim || a.occurrenceDate.localeCompare(b.occurrenceDate))
}

// Distribui as baixas entre as linhas, 1:1: uma ocorrência só pode ser baixada por UMA linha.
// As escolhas manuais (`escolha` = baixaKey) são servidas primeiro; as demais seguem a ordem do
// arquivo. Entrada: [{ id, candidatos, escolha?, desligada? }]. Saída: Map(id → { candidatos,
// escolhido, ativa }) — `candidatos` sem as ocorrências tomadas por outra linha.
export function atribuirBaixas(linhas, tomadasIniciais = new Set()) {
  const tomadas = new Map([...tomadasIniciais].map(k => [k, null]))
  const ordem = [...linhas].sort((a, b) => (b.escolha ? 1 : 0) - (a.escolha ? 1 : 0))
  const escolhido = new Map()
  for (const l of ordem) {
    const livres = l.candidatos.filter(c => !tomadas.has(baixaKey(c)))
    const c = (l.escolha && livres.find(x => baixaKey(x) === l.escolha)) || livres[0] || null
    if (c) { tomadas.set(baixaKey(c), l.id); escolhido.set(l.id, c) }
  }
  const out = new Map()
  for (const l of linhas) {
    const c = escolhido.get(l.id) || null
    const candidatos = l.candidatos.filter(x => !tomadas.has(baixaKey(x)) || tomadas.get(baixaKey(x)) === l.id)
    if (!c && candidatos.length === 0) continue
    out.set(l.id, { candidatos, escolhido: c, ativa: !!c && !l.desligada })
  }
  return out
}

// Parcelas futuras da série × ocorrências pendentes do MESMO agendamento: cada parcela cobre a
// ocorrência que cai na fatura dela (mesmo princípio). `parcelas` = [{ id, faturaMonthYear,
// amount, existenteId? }]; `tomadas` = baixaKeys já usadas por outras baixas do lote.
export function coberturaDaSerie(schedule, parcelas, closingDay = 14, tomadas = new Set()) {
  const pend = ocorrenciasPendentes(schedule, closingDay)
  const usadas = new Set(tomadas)
  const out = []
  for (const p of parcelas || []) {
    const o = pend.find(x => x.fatura === p.faturaMonthYear && valorProximo(x.amount, p.amount)
      && !usadas.has(`${schedule.id}|${x.date}`))
    if (!o) continue
    usadas.add(`${schedule.id}|${o.date}`)
    out.push({ scheduleId: schedule.id, occurrenceDate: o.date, parcelaId: p.id, existenteId: p.existenteId || null })
  }
  return out
}

// Plano completo de baixas de uma importação.
//   linhas : [{ id, description, payee, amount, type, faturaMonthYear, existenteId, escolha,
//              desligada }] — `existenteId` preenchido = linha já no cartão (regra A).
//   futuras: [{ id, parentId, faturaMonthYear, amount, existenteId }] — parcelas futuras das
//              linhas novas (existentes e a criar).
// Devolve Map(linhaId → { tipo, candidatos, escolhido, ativa, existenteId, coberturas }).
export function planejarBaixas({ linhas, futuras = [], schedules, transactions, card }) {
  const vinculados = lancamentosVinculados(schedules, transactions)
  const entradas = []
  const porId = new Map()
  for (const l of linhas || []) {
    // Lançamento já preso a outra ocorrência não baixa de novo (reimportação da mesma fatura).
    if (l.existenteId && vinculados.has(l.existenteId)) continue
    const candidatos = candidatosBaixa(l, schedules, card)
    if (candidatos.length === 0) continue
    entradas.push({ id: l.id, candidatos, escolha: l.escolha, desligada: l.desligada })
    porId.set(l.id, l)
  }
  const atrib = atribuirBaixas(entradas)
  const tomadas = new Set([...atrib.values()].filter(b => b.escolhido).map(b => baixaKey(b.escolhido)))
  const out = new Map()
  for (const [id, b] of atrib) {
    const l = porId.get(id)
    const tipo = l.existenteId ? TIPO_BAIXA.JA_NO_CARTAO : TIPO_BAIXA.IMPORTADO
    let coberturas = []
    if (b.ativa && tipo === TIPO_BAIXA.IMPORTADO) {
      const schedule = (schedules || []).find(s => s.id === b.escolhido.scheduleId)
      const parcelas = futuras.filter(f => f.parentId === id && !(f.existenteId && vinculados.has(f.existenteId)))
      coberturas = schedule ? coberturaDaSerie(schedule, parcelas, card?.closingDay, tomadas) : []
      for (const c of coberturas) tomadas.add(baixaKey(c))
    }
    out.set(id, { ...b, tipo, existenteId: l.existenteId || null, coberturas })
  }
  return out
}

// ── Registro / estorno ───────────────────────────────────────────────────────

// Meta da baixa feita GERANDO o lançamento (botão Pagar, registro de agendamento, motor da fatura:
// pagamento_fatura / gerencial_devolucao / resgate_reserva). Aponta o lançamento gerado, para o
// histórico e a aba "Pagos" casarem pela id e não por proximidade de data.
export const metaBaixaGerada = (lancamentoId) => ({ tipo: TIPO_BAIXA.PAGO, lancamento_id: lancamentoId || null, import_id: null })

// "Cobrança recorrente detectada": a ocorrência que o lançamento paga é a pendente da MESMA
// fatura (cartão) ou do mesmo mês (conta: closingDay 31); sem ela, a próxima pendente.
// Devolve { date, fatura, amount } (amount = previsto da ocorrência) ou null.
export function ocorrenciaDaCobranca(schedule, tx, closingDay = 14) {
  const pendentes = ocorrenciasPendentes(schedule, closingDay)
  if (!pendentes.length) return null
  const fatura = tx?.faturaMonthYear || faturaDaData(tx?.date, closingDay)
  return pendentes.find(o => o.fatura === fatura) || pendentes[0]
}

// Previsto × realizado no registro da ocorrência (registered_meta): a baixa é sempre pelo valor
// do lançamento (o do cartão); o previsto fica para conferência. As já pagas não mudam.
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
export const metaBaixaComValor = (meta, previsto, realizado) =>
  ({ ...(meta || {}), valor_previsto: r2(previsto), valor_realizado: r2(realizado) })

// Baixa pelo valor do lançamento. `atualizarFuturas` (opção do usuário, ex.: assinatura em dólar):
// o valor base do agendamento passa a ser o realizado — vale só para as ocorrências pendentes
// sem valor próprio; as já pagas guardam o delas no meta.
export function baixarPeloValor(s, { occurrenceDate, meta, previsto, realizado, atualizarFuturas = false }) {
  const baixado = aplicarBaixa(s, occurrenceDate, metaBaixaComValor(meta, previsto, realizado))
  return atualizarFuturas ? { ...baixado, amount: r2(realizado) } : baixado
}

// Baixa UMA ocorrência: mesma transição do markScheduleRegistered (registered + avanço de
// next_occurrence), mais o meta quando informado.
export function aplicarBaixa(s, occurrenceDate, meta = null) {
  const next = registerAndAdvance(s, [...(s.registered || []).filter(d => d !== occurrenceDate), occurrenceDate])
  if (!meta) return next
  return { ...next, registeredMeta: { ...(s.registeredMeta || {}), [occurrenceDate]: meta } }
}

// Desfaz a baixa de UMA ocorrência: reabre a data, apaga o meta dela e recua next_occurrence
// quando a âncora já tinha avançado. Mesma regra do estorno de um lançamento vinculado a
// agendamento (deleteTransaction).
export function desfazerBaixa(s, occurrenceDate) {
  const registered = (s.registered || []).filter(r => r !== occurrenceDate)
  if (registered.length === (s.registered || []).length) return s
  const registeredMeta = { ...(s.registeredMeta || {}) }
  delete registeredMeta[occurrenceDate]
  if ((s.frequency || 'once') === 'once') return { ...s, registered, registeredMeta, confirmado: false }
  const nextOccurrence = (s.nextOccurrence && s.nextOccurrence <= occurrenceDate) ? s.nextOccurrence : occurrenceDate
  return { ...s, registered, registeredMeta, nextOccurrence, confirmado: false }
}

// Ocorrências que uma importação baixou (importado / ja_no_cartao / coberta_parcela).
export function baixasDaImportacao(s, importId) {
  if (!importId) return []
  return Object.entries(s.registeredMeta || {})
    .filter(([, m]) => m?.import_id === importId && TIPOS_DE_IMPORTACAO.has(m.tipo))
    .map(([date]) => date)
}

// ── Regra C: rede de segurança dos relatórios ───────────────────────────────

// Regra C é mais exigente que a importação: ela só SINALIZA ("Duplicado – já no cartão") a partir
// do que já está gravado, sem uma linha de fatura dizendo qual compra é qual — casar só por
// (cartão, fatura, valor) marcava como duplicada qualquer compra de mesmo valor na fatura
// (ex.: "CABELOS FILHOS" R$ 120 × "Hering Kids 2/2" R$ 119,99). Exige TODOS:
//   cartão + fatura + valor ±R$ 0,05 + data a ±3 dias + 1 palavra significativa em comum +
//   lançamento livre. Empate → menor distância de data.
// Exceção da data: parcela 2..N de agendamento PARCELADO fica no dia financeiro (15) e o
// agendamento no dia de vencimento dele (30) — ali a fatura é a única âncora confiável.
export const COBERTURA_JANELA_DIAS = 3

const PALAVRA_RE = /[A-Z0-9]+/g
// Palavras de 3+ letras que aparecem em qualquer razão social e não identificam a compra.
const PALAVRAS_GENERICAS = new Set(['DOS', 'DAS', 'COM', 'PARA', 'LTDA', 'EIRELI', 'CIA', 'PARC', 'PARCELA', 'PAG', 'PGTO'])
export function palavrasSignificativas(...textos) {
  const out = new Set()
  for (const t of textos) {
    for (const w of normText(stripParcelaSuffix(t)).match(PALAVRA_RE) || []) {
      if (w.length > 2 && !/^\d+$/.test(w) && !PALAVRAS_GENERICAS.has(w)) out.add(w)
    }
  }
  return out
}

const diasEntre = (a, b) => Math.round(Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000)

// Lançamento do cartão que cobre a ocorrência e ainda está livre (não vinculado a outra
// ocorrência nem `usados` por outra cobertura).
export function txCobrindoOcorrencia(schedule, dataOcorrencia, txsCartao, { closingDay = 14, usados = null } = {}) {
  const cardId = cartaoDoAgendamento(schedule)
  if (!cardId || !ehAgendamentoDeCartao(schedule, cardId)) return null
  const ef = occEfetiva(schedule, dataOcorrencia)
  const dataOcc = String(ef.date).slice(0, 10)
  const fatura = faturaDaData(dataOcc, closingDay)
  const palavras = palavrasSignificativas(schedule.description, schedule.payee)
  if (palavras.size === 0) return null
  const parcelado = schedule.occurrenceType === 'installment'
  let best = null, bestDist = Infinity
  for (const t of txsCartao || []) {
    if ((t.type || 'expense') !== 'expense' || t.scheduleId) continue
    if (t.accountId !== schedule.accountId && t.accountId !== schedule.cardId) continue
    if (usados?.has(t.id) || !valorProximo(t.amount, ef.amount)) continue
    if (faturaDoLancamento(t, closingDay) !== fatura) continue
    const dist = t.date ? diasEntre(String(t.date).slice(0, 10), dataOcc) : Infinity
    const isentoData = parcelado && Number(t.installmentNum) > 1
    if (!isentoData && !(dist <= COBERTURA_JANELA_DIAS)) continue
    const daTx = palavrasSignificativas(t.description, t.payee)
    if (![...palavras].some(w => daTx.has(w))) continue
    if (dist < bestDist) { best = t; bestDist = dist }
  }
  return best
}

export function isOcorrenciaCobertaPorCartao(schedule, dataOcorrencia, txsCartao, opts) {
  return !!txCobrindoOcorrencia(schedule, dataOcorrencia, txsCartao, opts)
}

// Índice de cobertura de TODOS os agendamentos de cartão: Map(scheduleId → Map(dataOcorrência →
// id do lançamento que a cobre)). 1:1 — um lançamento cobre uma ocorrência só.
export function mapaCobertura({ schedules = [], transactions = [], accounts = [], limite = 36 }) {
  const cards = new Map(accounts.filter(a => a.type === 'credit').map(a => [a.id, a]))
  const usados = lancamentosVinculados(schedules, transactions)
  const buckets = new Map() // cardId|fatura → txs
  for (const t of transactions) {
    const card = cards.get(t.accountId)
    if (!card || (t.type || 'expense') !== 'expense') continue
    const k = `${card.id}|${faturaDoLancamento(t, card.closingDay || 14)}`
    if (!buckets.has(k)) buckets.set(k, [])
    buckets.get(k).push(t)
  }
  const out = new Map()
  for (const s of schedules) {
    const card = cards.get(cartaoDoAgendamento(s)) || cards.get(s.accountId)
    if (!card || !ehAgendamentoDeCartao(s, card.id)) continue
    const closingDay = card.closingDay || 14
    for (const o of ocorrenciasPendentes(s, closingDay, limite)) {
      const t = txCobrindoOcorrencia(s, o.date, buckets.get(`${card.id}|${o.fatura}`), { closingDay, usados })
      if (!t) continue
      usados.add(t.id)
      if (!out.has(s.id)) out.set(s.id, new Map())
      out.get(s.id).set(o.date, t.id)
    }
  }
  return out
}

// Ocorrências pendentes para PROJEÇÃO (fluxos, previstos): as de computeOccurrences menos as
// cobertas pelo cartão.
export function ocorrenciasProjetadas(schedule, count, cobertura) {
  const cobertas = cobertura?.get(schedule.id)
  if (!cobertas?.size) return computeOccurrences(schedule, count)
  return computeOccurrences(schedule, count + cobertas.size).filter(d => !cobertas.has(d)).slice(0, count)
}
