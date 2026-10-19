// Ocorrências a registrar — funções PURAS (sem React), extraídas para teste direto.
//
// Regra da ocorrência com data alterada na prévia (overrides[dataOriginal].date):
//   • quem decide se ela venceu é a data EFETIVA (occEfetiva), não a original;
//   • o lançamento é gravado na data efetiva;
//   • `registered` recebe a chave ORIGINAL — é ela que identifica a ocorrência na série
//     (computeOccurrences / skipped / overrides são todos chaveados pela original).
import { computePendingUpTo } from './occurrences.js'
import { occEfetiva } from './fluxoCaixa.js'
import { lancamentosVinculados } from './scheduleBaixa.js'
import { ORIGIN } from './origins.js'

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/

// Ocorrências PENDENTES do agendamento cuja data EFETIVA já chegou (<= hojeStr).
// Devolve [{ occurrenceDate, date, amount }]: occurrenceDate = chave original (vai para
// registered), date/amount = efetivos (vão para o lançamento).
//
// A busca vai além de hoje até a maior chave de override: uma ocorrência de 15/10 antecipada
// para 08/10 tem chave futura e computePendingUpTo(hoje) não a veria. As que foram adiadas para
// depois de hoje ficam de fora mesmo com a chave original já vencida.
export function ocorrenciasVencidas(schedule, hojeStr) {
  const chavesOverride = Object.keys(schedule.overrides || {}).filter(k => DATA_RE.test(k))
  const horizonte = chavesOverride.reduce((max, k) => (k > max ? k : max), hojeStr)
  return computePendingUpTo(schedule, horizonte)
    .map(occurrenceDate => {
      const ef = occEfetiva(schedule, occurrenceDate)
      return { occurrenceDate, date: ef.date, amount: Number(ef.amount) || 0 }
    })
    .filter(o => o.date <= hojeStr)
}

// Execução das transferências do modal de início de mês. registerScheduleOccurrence é a fonte
// ÚNICA: cria a transferência (com scheduleId, valor e data efetivos) e marca a ocorrência em
// registered. O modal chamava também addTransaction com a mesma transferência — saía em dobro,
// e a cópia sem scheduleId nem era estornada junto com a ocorrência.
export function executarTransferenciasInicioMes(list, { getNextOccurrences, registerScheduleOccurrence }) {
  for (const sch of list) {
    const occurrenceDate = getNextOccurrences(sch, 1)[0]
    if (!occurrenceDate) continue
    registerScheduleOccurrence(sch.id, occEfetiva(sch, occurrenceDate).date, occurrenceDate)
  }
}

// ── Proteções do auto-registro ───────────────────────────────────────────────────────────────────
// 1. Nunca em cartão de crédito (qualquer ponta): lançamento de cartão entra pelo Importar Fatura.
// 2. Possível duplicado: antes de criar, procura um lançamento que já pareça ser esta ocorrência —
//    mesma conta (qualquer ponta), mesmo valor (±R$ 0,01), data ou data do cartão a até ±5 dias,
//    sem vínculo com agendamento nenhum, e descrição parecida (palavra em comum) OU vindo de
//    importação (extrato, fatura, Dindin, importação padrão), cuja descrição o banco escreve do seu
//    jeito. Achou → não cria; a ocorrência fica pendente com o selo "possível duplicado — confira".

export function tocaCartao(schedule, accounts = []) {
  if (schedule?.accountType === 'credit') return true
  const tipo = (id) => (id ? (accounts || []).find(a => a.id === id)?.type : null)
  return tipo(schedule?.accountId) === 'credit' || tipo(schedule?.toAccountId) === 'credit'
}

export const JANELA_DUPLICADO_DIAS = 5
const ORIGENS_IMPORTADAS = new Set([
  ORIGIN.IMPORTACAO_FATURA, ORIGIN.RECONCILIACAO_FATURA, ORIGIN.IMPORTACAO_DINDIN, ORIGIN.IMPORTACAO_PADRAO,
])

const dia = (d) => String(d || '').slice(0, 10)
const distDias = (a, b) => Math.abs(new Date(`${dia(a)}T12:00:00`) - new Date(`${dia(b)}T12:00:00`)) / 86400000

// Palavras com mais de 3 letras, sem acento e sem as só de números ("PIX", "2026" ficam de fora).
export function palavrasSignificativas(...textos) {
  const out = new Set()
  for (const t of textos) {
    for (const w of String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/)) {
      if (w.length > 3 && !/^\d+$/.test(w)) out.add(w)
    }
  }
  return out
}

// Lançamento que já parece ser a ocorrência (o mais perto da data), ou null. `vinculados`: ids
// já ligados a alguma baixa (lancamentosVinculados) — passado pronto para não recalcular por ocorrência.
export function buscarPossivelDuplicado(schedule, ocorrencia, transactions, { vinculados = new Set() } = {}) {
  const alvo = Math.abs(Number(ocorrencia?.amount) || 0)
  const contas = new Set([schedule?.accountId, schedule?.toAccountId].filter(Boolean))
  if (!contas.size || !ocorrencia?.date) return null
  const doAgendamento = palavrasSignificativas(schedule.description, schedule.payee)
  let melhor = null
  for (const t of transactions || []) {
    if (!t || t.scheduleId || vinculados.has(t.id) || t.reservaAuto) continue
    if (!contas.has(t.accountId) && !contas.has(t.toAccountId)) continue
    if (Math.abs(Math.abs(Number(t.amount) || 0) - alvo) > 0.01) continue
    const dist = Math.min(
      t.date ? distDias(t.date, ocorrencia.date) : Infinity,
      t.dateCartao ? distDias(t.dateCartao, ocorrencia.date) : Infinity,
    )
    if (dist > JANELA_DUPLICADO_DIAS) continue
    const doLancamento = palavrasSignificativas(t.description, t.payee)
    const parecido = [...doAgendamento].some(w => doLancamento.has(w))
    if (!parecido && !ORIGENS_IMPORTADAS.has(t.origin)) continue
    if (!melhor || dist < melhor.dist) melhor = { tx: t, dist }
  }
  return melhor?.tx || null
}

// Ocorrências vencidas dos agendamentos automáticos que o auto-registro NÃO vai criar por terem um
// possível duplicado. Map(scheduleId → Map(occurrenceDate → id do lançamento parecido)) — mesma forma
// do mapa de cobertura do cartão, para o selo em Agendamentos e o aviso em Alertas.
export function mapaPossiveisDuplicados({ schedules = [], transactions = [], accounts = [], hojeStr }) {
  const mapa = new Map()
  const auto = (schedules || []).filter(s => s?.autoRegister && !tocaCartao(s, accounts))
  if (!auto.length) return mapa
  const vinculados = lancamentosVinculados(schedules, transactions)
  for (const s of auto) {
    for (const o of ocorrenciasVencidas(s, hojeStr)) {
      const tx = buscarPossivelDuplicado(s, o, transactions, { vinculados })
      if (!tx) continue
      if (!mapa.has(s.id)) mapa.set(s.id, new Map())
      mapa.get(s.id).set(o.occurrenceDate, tx.id)
    }
  }
  return mapa
}
