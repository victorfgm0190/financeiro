// Despesas AGENDADAS de cartão como fonte do resgate_reserva ("previstos").
//
// Por que um id sintético em vez de somar um número solto no amount do resgate:
// o resgate é PER-GASTO. Seu `amount` é a soma dos `sourceExpenseIds`, e o detalhamento
// (schedule_reserva_funcoes) grava uma linha por fonte, sob o invariante documentado no motor —
// "a soma das linhas de uma origem = numberedByAccount[origem] = amount do resgate_reserva →
// diferença zero". Um previsto sem id quebraria esse fechamento. Com `sch:<scheduleId>@<data>`
// ele atravessa sourceExpenseIds e o detalhamento como qualquer lançamento, e o invariante vale.
//
// O id também é o que impede resgate em dobro: quando a ocorrência é registrada, ela vira um
// lançamento com scheduleId + date, e isResgatePagoParaGasto reconstrói esta mesma chave para
// descobrir que aquele gasto JÁ foi coberto por um resgate executado.

import { occEfetiva } from './fluxoCaixa.js'
import { contaPrincipalDe, nomeSubcontaGer } from './provisaoGerencial.js'

export const PREVISTO_PREFIX = 'sch:'

export const fontePrevistoId = (scheduleId, date) =>
  `${PREVISTO_PREFIX}${scheduleId}@${String(date).slice(0, 10)}`

export function parseFontePrevisto(id) {
  if (typeof id !== 'string' || !id.startsWith(PREVISTO_PREFIX)) return null
  const resto = id.slice(PREVISTO_PREFIX.length)
  // lastIndexOf: o id do agendamento pode conter '@'; a data nunca contém.
  const at = resto.lastIndexOf('@')
  if (at < 1 || at === resto.length - 1) return null
  return { scheduleId: resto.slice(0, at), date: resto.slice(at + 1) }
}

export const ehFontePrevista = (id) => typeof id === 'string' && id.startsWith(PREVISTO_PREFIX)

// Agendamentos que o próprio motor gerencial cria. Nunca são "gasto previsto": tratá-los como
// tal realimentaria o motor com o que ele acabou de escrever.
export const TIPOS_GERIDOS = new Set(['pagamento_fatura', 'gerencial_devolucao', 'resgate_reserva'])

// Despesa agendada MANUAL num cartão — a única coisa que vira previsto de fatura.
export const ehGastoPrevistoDeCartao = (s, cardId) =>
  !!s && s.transactionType === 'expense' && !!s.accountId && s.accountId === cardId &&
  !TIPOS_GERIDOS.has(s.tipo)

// Ocorrências PENDENTES das despesas agendadas de `cardId` que caem na fatura `faturaMesAno`.
//
// `getOccurrences(s, n)` é computeOccurrences: já exclui as datas em registered/skipped — é o
// "is_pending" deste schema, que não tem coluna is_paid. Uma parcela efetivada some daqui no
// mesmo instante em que aparece como lançamento, então o total do resgate não muda na transição
// e não há dupla contagem.
//
// `faturaDe(data)` devolve o YYYY-MM da fatura em que aquela data cai (fecha pelo closingDay).
export function previstosDaFatura({
  schedules = [], cardId, faturaMesAno, getOccurrences, faturaDe, limite = 24,
}) {
  const out = []
  if (!cardId || !faturaMesAno || typeof getOccurrences !== 'function' || typeof faturaDe !== 'function') {
    return out
  }
  const vistos = new Set()
  for (const s of schedules) {
    if (!ehGastoPrevistoDeCartao(s, cardId)) continue
    for (const original of getOccurrences(s, limite)) {
      // occEfetiva respeita overrides[dataOriginal] — valor E data da ocorrência. Sem isto, editar
      // uma ocorrência específica deixaria o resgate com o valor/mês antigos.
      const { date, amount } = occEfetiva(s, String(original).slice(0, 10))
      const dia = String(date).slice(0, 10)
      if (faturaDe(dia) !== faturaMesAno) continue
      const valor = Math.round((Number(amount) || 0) * 100) / 100
      if (!(valor > 0)) continue
      const id = fontePrevistoId(s.id, dia)
      if (vistos.has(id)) continue // duas ocorrências reescritas para o mesmo dia
      vistos.add(id)
      out.push({
        id,
        scheduleId: s.id,
        date: dia,
        valor,
        grupoGerencial: s.grupoGerencial || null,
        reservaFuncaoId: s.reservaFuncaoId || null,
      })
    }
  }
  return out
}

// Faturas (YYYY-MM) tocadas pelas ocorrências pendentes de um agendamento num cartão. Usada para
// saber o que reconciliar quando o agendamento muda.
export function faturasDoAgendamento({ schedule, cardId, getOccurrences, faturaDe, datasExtras = [], limite = 24 }) {
  const faturas = new Set()
  if (!ehGastoPrevistoDeCartao(schedule, cardId)) return faturas
  for (const original of getOccurrences(schedule, limite)) {
    const { date } = occEfetiva(schedule, String(original).slice(0, 10))
    const fmy = faturaDe(String(date).slice(0, 10))
    if (fmy) faturas.add(fmy)
  }
  // A ocorrência recém-registrada/pulada SOME de getOccurrences — a fatura dela precisa entrar por
  // fora, senão justamente o mês que mudou fica sem recálculo.
  for (const d of [schedule.startDate, ...datasExtras]) {
    if (!d) continue
    const fmy = faturaDe(String(d).slice(0, 10))
    if (fmy) faturas.add(fmy)
  }
  return faturas
}

// Resolve uma fonte prevista ('sch:<agendamento>@<data>') de volta ao agendamento que a originou,
// para a UI conseguir exibir a composição do resgate. Devolve null se o id não for previsto.
//
// O valor é o EFETIVO da ocorrência (occEfetiva), não schedule.amount: um override de valor numa
// ocorrência específica foi o que entrou no resgate, e é ele que precisa aparecer na tabela para
// a soma fechar. Como o id guarda a data EFETIVA, procuramos a ocorrência cuja data efetiva casa.
//
// `schedule: null` quando o agendamento foi apagado depois de o resgate ser executado — a linha
// ainda precisa aparecer, senão a soma da tabela deixa de bater com o amount do resgate sem que
// nada na tela explique a diferença.
export function resolverFontePrevista(id, schedules = [], getOccurrences, limite = 24) {
  const parsed = parseFontePrevisto(id)
  if (!parsed) return null
  const schedule = (schedules || []).find(s => s.id === parsed.scheduleId) || null
  let valor = Number(schedule?.amount) || 0
  if (schedule && typeof getOccurrences === 'function') {
    for (const original of getOccurrences(schedule, limite)) {
      const ef = occEfetiva(schedule, String(original).slice(0, 10))
      if (String(ef.date).slice(0, 10) === parsed.date) {
        valor = Math.round((Number(ef.amount) || 0) * 100) / 100
        break
      }
    }
  }
  return {
    id,
    scheduleId: parsed.scheduleId,
    date: parsed.date,
    valor,
    description: schedule?.description || null,
    categoryId: schedule?.categoryId || null,
    schedule,
  }
}

// ── Etapa A PREVISTA (Grupo G) no Fluxo de Caixa ─────────────────────────────
// A etapa A real (tx_gerA_<gasto>, Conta Principal → Ger.<apelido>) só nasce quando o gasto vira
// lançamento. Até lá, cada ocorrência pendente de despesa agendada de cartão do Grupo G já
// compromete a Conta Principal na data dela — o fluxo precisa mostrar essa saída. Só em memória:
// nada é gravado, e o id sintético é determinístico para servir de chave de linha (exclusão
// temporária, data provisória).
export const ETAPA_A_PREVISTA_PREFIX = 'schgerA:'
export const etapaAPrevistaId = (scheduleId, date) =>
  `${ETAPA_A_PREVISTA_PREFIX}${scheduleId}@${String(date).slice(0, 10)}`

// Projeções da etapa A das ocorrências pendentes. `getOccurrences` deve ser o das projeções
// (exclui as ocorrências já cobertas por lançamento do cartão — essas já têm etapa A real).
export function projecoesEtapaA({
  schedules = [], transactions = [], accounts = [], gerencialGroups = [], getOccurrences, limite = 400,
}) {
  const out = []
  const g1 = (gerencialGroups || []).find(g => g.number === 1)
  if (!g1 || typeof getOccurrences !== 'function') return out
  const contaPrincipal = contaPrincipalDe(accounts || [])
  if (!contaPrincipal) return out
  const accById = new Map((accounts || []).map(a => [a.id, a]))
  const txIds = new Set((transactions || []).map(t => t.id))
  // Ocorrência já efetivada com etapa A real: o lançamento leva scheduleId + date.
  const efetivadas = new Set((transactions || [])
    .filter(t => t.scheduleId && txIds.has(`tx_gerA_${t.id}`))
    .map(t => `${t.scheduleId}|${String(t.date).slice(0, 10)}`))
  for (const s of schedules || []) {
    if (s.grupoGerencial !== g1.id) continue
    const card = accById.get(s.accountId)
    if (card?.type !== 'credit' || !ehGastoPrevistoDeCartao(s, card.id)) continue
    const nomeSub = nomeSubcontaGer(card)
    const subconta = (accounts || []).find(a => a.name === nomeSub) || null
    const vistos = new Set()
    for (const original of getOccurrences(s, limite)) {
      const origDate = String(original).slice(0, 10)
      const { date, amount } = occEfetiva(s, origDate)
      const dia = String(date).slice(0, 10)
      const valor = Math.round((Number(amount) || 0) * 100) / 100
      if (!(valor > 0)) continue
      if (efetivadas.has(`${s.id}|${dia}`) || efetivadas.has(`${s.id}|${origDate}`)) continue
      const id = etapaAPrevistaId(s.id, dia)
      if (vistos.has(id)) continue
      vistos.add(id)
      out.push({
        id, scheduleId: s.id, origDate, date: dia, amount: valor,
        fromAccountId: contaPrincipal.id, toAccountId: subconta?.id || null,
        description: `${nomeSub} — ${s.description || 'agendamento'}`,
        categoryId: s.categoryId || null,
      })
    }
  }
  return out
}

// Soma a etapa A prevista POR FORA do breakdown do Saldo Principal (calcularSaldoPrincipalBreakdown
// é protegida e não conhece a projeção). Mesma regra de agendamento do breakdown: ocorrência no
// ciclo [cycleStart, fim] com ponta no pool, pelo líquido (destino no pool ? +v : 0) − (origem no
// pool ? v : 0). O pool é o que o próprio breakdown devolveu (saldoAtual.contas). Os itens entram na
// lista do Final Ciclo para o modal "Como chegamos aqui" continuar fechando com o total.
export function somarEtapaAPrevistaNoSaldoPrincipal(b, previstas = []) {
  if (!b || !previstas?.length) return b
  const poolIds = new Set((b.saldoAtual?.contas || []).map(c => c.id))
  if (poolIds.size === 0) return b
  const rb = (v) => Math.round(v * 100) / 100
  const itensAte = (fim) => {
    const itens = []
    for (const p of previstas) {
      if (!p?.date || p.date < b.cycleStart || p.date > fim) continue
      const v = (poolIds.has(p.toAccountId) ? p.amount : 0) - (poolIds.has(p.fromAccountId) ? p.amount : 0)
      if (v === 0) continue
      itens.push({ description: p.description, amount: rb(v), date: p.date, scheduleId: p.scheduleId, _etapaAPrevista: true })
    }
    const porAgendamento = new Map()
    for (const it of itens) porAgendamento.set(it.scheduleId, [...(porAgendamento.get(it.scheduleId) || []), it])
    for (const lista of porAgendamento.values()) {
      lista.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0))
      lista.forEach((it, i) => { it.occurrenceNumber = i + 1; it.totalOccurrences = lista.length })
    }
    return { itens, total: rb(itens.reduce((s, it) => s + it.amount, 0)) }
  }
  const ordenar = (lista) => [...lista].sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0))
  const ciclo = itensAte(b.cycleEnd)
  const out = { ...b }
  if (ciclo.itens.length) {
    const finalCiclo = rb(b.finalCiclo.total + ciclo.total)
    out.finalCiclo = {
      ...b.finalCiclo,
      agendamentos: ordenar([...b.finalCiclo.agendamentos, ...ciclo.itens]),
      agendamentosTotal: rb(b.finalCiclo.agendamentosTotal + ciclo.total),
      total: finalCiclo,
    }
    out.projetado = { ...b.projetado, finalCiclo, total: rb(b.projetado.total + ciclo.total) }
  }
  if (b.finalCalendario && b.calendarEnd) {
    const cal = itensAte(b.calendarEnd)
    if (cal.itens.length) {
      out.finalCalendario = {
        ...b.finalCalendario,
        agendamentos: ordenar([...b.finalCalendario.agendamentos, ...cal.itens]),
        agendamentosTotal: rb(b.finalCalendario.agendamentosTotal + cal.total),
        total: rb(b.finalCalendario.total + cal.total),
      }
    }
  }
  return out
}

// Efeito líquido da etapa A prevista numa conta, para ocorrências com data em [de, ate]: a Conta
// Principal perde, a subconta Ger. ganha. Usado nos saldos por conta (getAccountSaldos).
export function deltaEtapaAPrevistaNaConta(previstas = [], accountId, de, ate) {
  if (!accountId) return 0
  let acc = 0
  for (const p of previstas || []) {
    if (!p?.date || p.date < de || p.date > ate || p.fromAccountId === p.toAccountId) continue
    if (p.fromAccountId === accountId) acc -= p.amount
    else if (p.toAccountId === accountId) acc += p.amount
  }
  return Math.round(acc * 100) / 100
}
