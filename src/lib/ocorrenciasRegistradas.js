// Histórico das ocorrências JÁ CONSUMIDAS de um agendamento (pagas, puladas, baixadas) — "Ver
// ocorrências registradas" do Editar Agendamento. Função PURA sobre o estado em memória (o motor de
// ocorrências é todo do front); sem endpoint.
//
// Fontes:
//   • schedule.registered  — datas baixadas (em geral a data-base; às vezes a data efetiva/paga,
//                             como o 18/06 do TV PAPAI). É a verdade da baixa.
//   • schedule.skipped     — datas puladas.
//   • schedule.registeredMeta[data] = { tipo, lancamento_id } — como a baixa foi feita (só as recentes).
//   • lancamentos com scheduleId === schedule.id.
//
// Cada data consumida (registered ∪ skipped), em ordem cronológica, ocupa uma parcela (1/N, 2/N…).
// Vencimento da consumida: a data teórica da série (desde a Data de Início) mais próxima dela, a até
// meio período; longe de qualquer data da série (ex.: Data de Início movida para depois da baixa),
// vale a própria data gravada — a edição da série nunca "muda" o vencimento de uma baixada.
// Casamento lançamento ↔ data registrada, nesta ordem:
//   a) registeredMeta[data].lancamento_id (pode ser lançamento de cartão, sem scheduleId);
//   b) lançamento com scheduleId mais próximo da data REGISTRADA, ainda não usado, dentro de ±1
//      período da frequência (mensal = 31 dias);
//   c) fora da janela → não casa (a data fica "Baixada").
// Lançamentos com scheduleId que sobram entram no fim como "Avulso vinculado".
import { computeOccurrences, datasDaSerie, diaVencimentoDe } from './occurrences.js'
import { occEfetiva } from './fluxoCaixa.js'
import { lancamentosVinculados } from './scheduleBaixa.js'
import { casaCategoria } from './filtroCategoria.js'
import { ehParcelado, parcelasDaSerie } from './parcelasOcorrencia.js'
import { liquidoDosAjustes } from './ajusteResgate.js'

export const STATUS_OCORRENCIA = { PAGA: 'paga', PULADA: 'pulada', BAIXADA: 'baixada', AVULSO: 'avulso' }

// Janela de casamento = 1 período da frequência, em dias.
export const JANELA_DIAS = {
  daily: 1, weekly: 7, biweekly: 14, monthly: 31, bimonthly: 62, quarterly: 92,
  quadrimestral: 123, semiannual: 184, annual: 366, once: 31,
}

// Recorrência parcelada: as parcelas são mensais, seja qual for a frequência das ocorrências.
export const janelaDaSerie = (s) => (ehParcelado(s) ? JANELA_DIAS.monthly : (JANELA_DIAS[s?.frequency] ?? 31))

// Total de "x de N" do histórico: parcelas somadas (recorrência parcelada com fim) ou ocorrências.
const totalDaSerie = (s, continua) => {
  if (continua) return null
  if (ehParcelado(s)) return parcelasDaSerie(s).length || null
  return Number(s?.installments) || null
}

const MOTIVO_BAIXA = {
  ja_no_cartao: 'já no cartão',
  importado: 'importada',
  coberta_parcela: 'coberta por parcela',
  pago_fora: 'pago fora do Finup',
}
// Baixas que, por desenho, não têm lançamento do agendamento: o dinheiro está no cartão/importação.
const BAIXA_DE_IMPORTACAO = new Set(['ja_no_cartao', 'importado', 'coberta_parcela'])

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const dia = (d) => String(d || '').slice(0, 10)
const distDias = (a, b) => Math.abs(new Date(`${dia(a)}T12:00:00`) - new Date(`${dia(b)}T12:00:00`)) / 86400000

// Quantas ocorrências já foram consumidas (registradas + puladas) e se há algo a mostrar — barato,
// para o rótulo do botão sem montar o histórico.
export function resumoRegistradas(schedule, transactions = []) {
  const registradas = new Set((schedule?.registered || []).map(dia)).size
  const puladas = new Set((schedule?.skipped || []).map(dia)).size
  const vinculados = (transactions || []).some(t => t.scheduleId === schedule?.id)
  const continua = (schedule?.occurrenceType || 'continuous') !== 'installment'
  return {
    registradas, puladas, continua,
    total: totalDaSerie(schedule, continua),
    temAlgo: registradas + puladas > 0 || vinculados,
  }
}

export function historicoOcorrencias(schedule, transactions = []) {
  if (!schedule) return { linhas: [], totalPago: 0, totalPrevisto: 0, previstoDaSerie: false, previstoPagas: 0, diferenca: 0, nPagas: 0, nSemLancamento: 0, totalSemLancamento: 0 }
  const s = schedule
  const continua = (s.occurrenceType || 'continuous') !== 'installment'
  const total = totalDaSerie(s, continua)
  const registradas = [...new Set((s.registered || []).map(dia))]
  const cobertas = new Set(Array.isArray(s.overrides?._resgateCobertas) ? s.overrides._resgateCobertas : [])
  const puladas = new Set((s.skipped || []).map(dia).filter(d => !cobertas.has(d)))
  const eventos = [...new Set([...registradas, ...puladas])].sort()
  const vencimentos = vencimentosDasConsumidas(s, eventos)

  const txById = new Map((transactions || []).map(t => [t.id, t]))
  const vinculados = (transactions || []).filter(t => t.scheduleId === s.id)
  const usados = new Set()
  const meta = s.registeredMeta || {}
  const casado = new Map() // data registrada → lançamento

  // a) lancamento_id do registered_meta (reserva antes do casamento por proximidade).
  for (const d of registradas) {
    const id = meta[d]?.lancamento_id
    const tx = id ? txById.get(id) : null
    if (tx && !usados.has(tx.id)) { casado.set(d, tx); usados.add(tx.id) }
  }
  // b) mais próximo da data registrada, ainda não usado, dentro da janela. Ordem cronológica.
  const janela = janelaDaSerie(s)
  for (const d of [...registradas].sort()) {
    if (casado.has(d)) continue
    let melhor = null
    let melhorDist = Infinity
    for (const t of vinculados) {
      if (usados.has(t.id)) continue
      const dist = distDias(t.date, d)
      if (dist > janela) continue
      if (dist < melhorDist || (dist === melhorDist && dia(t.date) < dia(melhor.date))) { melhor = t; melhorDist = dist }
    }
    if (melhor) { casado.set(d, melhor); usados.add(melhor.id) }
  }

  const linhas = eventos.map((d, i) => {
    const valorOriginal = r2(occEfetiva(s, d).amount)
    const base = {
      parcela: i + 1, total, vencimento: (s.agendamentoVinculadoId ? d : vencimentos.get(d)) || d, dataRegistro: d, valorOriginal,
      pagoEm: null, valorPago: null, diferenca: null, accountId: null, payee: null, txId: null, motivo: null,
      semLancamento: false, pagoFora: false,
    }
    if (puladas.has(d) && !registradas.includes(d)) return { ...base, status: STATUS_OCORRENCIA.PULADA }
    const tx = casado.get(d)
    if (tx) {
      // Resgate ligado: complementar/devolução da ocorrência (lib/ajusteResgate) → valor pago líquido.
      const ajuste = s.agendamentoVinculadoId ? liquidoDosAjustes(s, d, transactions) : 0
      const valorPago = r2(Number(tx.amount) + ajuste)
      return {
        ...base, status: STATUS_OCORRENCIA.PAGA, pagoEm: dia(tx.date), valorPago, ajuste: ajuste || null,
        diferenca: r2(valorPago - valorOriginal), accountId: tx.accountId || null, payee: tx.payee || null, txId: tx.id,
      }
    }
    const tipo = meta[d]?.tipo
    return {
      ...base, status: STATUS_OCORRENCIA.BAIXADA, motivo: MOTIVO_BAIXA[tipo] || 'sem lançamento',
      semLancamento: !BAIXA_DE_IMPORTACAO.has(tipo), pagoFora: tipo === 'pago_fora',
    }
  })

  // Lançamentos vinculados que sobraram (pagamento fora de qualquer data registrada).
  for (const t of vinculados.filter(t => !usados.has(t.id)).sort((a, b) => dia(a.date).localeCompare(dia(b.date)))) {
    linhas.push({
      parcela: null, total, vencimento: null, dataRegistro: null, valorOriginal: null,
      pagoEm: dia(t.date), valorPago: r2(t.amount), diferenca: null,
      accountId: t.accountId || null, payee: t.payee || null, txId: t.id, motivo: null,
      status: STATUS_OCORRENCIA.AVULSO,
    })
  }

  const pagas = linhas.filter(l => l.status === STATUS_OCORRENCIA.PAGA)
  // Total pago = soma dos lançamentos vinculados (pagas + avulsos).
  const totalPago = r2(linhas.reduce((acc, l) => acc + (l.valorPago || 0), 0))
  const previstoPagas = r2(pagas.reduce((acc, l) => acc + l.valorOriginal, 0))
  const totalPagoPagas = r2(pagas.reduce((acc, l) => acc + l.valorPago, 0))
  // Total previsto = valor original de TODAS as ocorrências da série (consumidas + pendentes), fora
  // as puladas. Série contínua (sem fim): só as consumidas.
  const consumidasNaoPuladas = linhas.filter(l => l.dataRegistro && l.status !== STATUS_OCORRENCIA.PULADA)
  let totalPrevisto = consumidasNaoPuladas.reduce((acc, l) => acc + l.valorOriginal, 0)
  const previstoDaSerie = !!total
  if (previstoDaSerie) {
    for (const d of computeOccurrences(s, total)) totalPrevisto += Number(occEfetiva(s, d).amount) || 0
  }
  const semLanc = linhas.filter(l => l.semLancamento && !l.pagoFora)
  return {
    linhas, totalPago, totalPrevisto: r2(totalPrevisto), previstoDaSerie,
    previstoPagas, diferenca: r2(totalPagoPagas - previstoPagas), nPagas: pagas.length,
    nSemLancamento: semLanc.length, totalSemLancamento: r2(semLanc.reduce((acc, l) => acc + l.valorOriginal, 0)),
  }
}

// Vencimento de cada data consumida (Map data → vencimento): a data teórica da série mais próxima,
// ainda não usada, a até meio período; senão a própria data gravada.
function vencimentosDasConsumidas(s, eventos) {
  const out = new Map()
  if (!eventos.length) return out
  const ultimo = eventos[eventos.length - 1]
  const inicio = String(s.startDate || '').slice(0, 10)
  let teoricas = []
  if (inicio && !ehParcelado(s)) {
    const limite = s.occurrenceType === 'installment' ? Math.max(Number(s.installments) || 0, eventos.length) : 600
    teoricas = datasDaSerie(inicio, s.frequency || 'once', limite, diaVencimentoDe(s)).filter(d => d <= somaDias(ultimo, janelaDaSerie(s)))
  } else if (inicio) {
    teoricas = computeOccurrences({ ...s, nextOccurrence: null, registered: [], skipped: [], efetivacoes: [] }, Math.max(eventos.length, 1))
  }
  const meia = janelaDaSerie(s) / 2
  const usadas = new Set()
  for (const d of eventos) {
    let melhor = null
    let melhorDist = Infinity
    for (const t of teoricas) {
      if (usadas.has(t)) continue
      const dist = distDias(t, d)
      if (dist <= meia && dist < melhorDist) { melhor = t; melhorDist = dist }
    }
    if (melhor) usadas.add(melhor)
    out.set(d, melhor || d)
  }
  return out
}
const somaDias = (d, n) => {
  const x = new Date(`${dia(d)}T12:00:00`)
  x.setDate(x.getDate() + Math.ceil(n))
  return x.toISOString().slice(0, 10)
}

// Aba "Pagos" (Agendamentos): UMA linha por ocorrência PAGA de qualquer agendamento — inclusive das
// séries em andamento —, pelos lançamentos vinculados avulsos e pelas BAIXADAS sem lançamento
// (`semLancamento: true`, fora do total). Mesmo casamento do histórico acima. Puladas NÃO entram.
// Mais recente primeiro.
// Dados do LANÇAMENTO (data, conta, favorecido, valor, categoria, tipo); o agendamento completa o
// que o lançamento não tiver.
export function pagamentosDosAgendamentos(schedules = [], transactions = []) {
  const txById = new Map((transactions || []).map(t => [t.id, t]))
  const out = []
  for (const s of schedules || []) {
    for (const l of historicoOcorrencias(s, transactions).linhas) {
      if (l.status === STATUS_OCORRENCIA.BAIXADA) {
        // Baixada sem lançamento casado: aparece com o selo, data = data baixada, conta e valor do
        // agendamento. Não entra no total pago.
        out.push({
          key: `${s.id}_baixa_${l.dataRegistro}`, scheduleId: s.id, schedule: s, txId: null, avulso: false,
          semLancamento: true, motivo: l.motivo,
          dataPagamento: l.dataRegistro, vencimento: l.vencimento, parcela: l.parcela, total: l.total,
          description: s.description || '', payee: s.payee || '', categoryId: s.categoryId || null,
          tipoDocumentoId: s.tipoDocumentoId || null, tipo: s.tipo || null,
          accountId: s.accountId || null, amount: l.valorOriginal, transactionType: s.transactionType,
        })
        continue
      }
      if (l.status !== STATUS_OCORRENCIA.PAGA && l.status !== STATUS_OCORRENCIA.AVULSO) continue
      const tx = txById.get(l.txId) || {}
      out.push({
        key: `${s.id}_${l.txId}`, scheduleId: s.id, schedule: s, txId: l.txId, avulso: l.status === STATUS_OCORRENCIA.AVULSO,
        dataPagamento: l.pagoEm, vencimento: l.vencimento, parcela: l.parcela, total: l.total,
        description: tx.description || s.description || '', payee: tx.payee || s.payee || '',
        categoryId: tx.categoryId || s.categoryId || null,
        tipoDocumentoId: tx.tipoDocumentoId || s.tipoDocumentoId || null, tipo: s.tipo || null,
        accountId: l.accountId, amount: l.valorPago, transactionType: tx.type || s.transactionType,
      })
    }
  }
  return out.sort((a, b) => (b.dataPagamento || '').localeCompare(a.dataPagamento || '') || a.description.localeCompare(b.description))
}

// Filtros da barra sobre as linhas da aba Pagos. Data = data do PAGAMENTO; valor = valor pago.
// `agenda`: '' | 'sim' | 'nao', pelo agendamento da linha; lançamento sem agendamento não sincroniza.
export function filtrarPagamentos(linhas, { desc = '', payee = '', categoryId = '', from = '', to = '', min = null, max = null, valores = null, agenda = '' } = {}) {
  const d = desc.trim().toLowerCase()
  const p = payee.trim().toLowerCase()
  return (linhas || []).filter(l => {
    if (d && !l.description.toLowerCase().includes(d)) return false
    if (p && !l.payee.toLowerCase().includes(p)) return false
    if (!casaCategoria(l.categoryId, categoryId)) return false
    if (agenda) {
      const sincroniza = !!l.schedule && l.schedule.sincronizarAgenda !== false
      if ((agenda === 'sim') !== sincroniza) return false
    }
    if (from && (l.dataPagamento || '') < String(from).slice(0, 10)) return false
    if (to && (l.dataPagamento || '') > String(to).slice(0, 10)) return false
    if (min != null && !Number.isNaN(min) && l.amount < min) return false
    if (max != null && !Number.isNaN(max) && l.amount > max) return false
    if (valores && valores.size > 0 && !valores.has(r2(l.amount))) return false
    return true
  })
}

// Totais do rodapé da aba Pagos: pagos (com lançamento) somam; "sem lançamento" só conta.
export function totaisPagamentos(linhas) {
  const pagos = (linhas || []).filter(l => !l.semLancamento)
  return {
    nPagos: pagos.length,
    totalPago: r2(pagos.reduce((acc, l) => acc + (Number(l.amount) || 0), 0)),
    nSemLancamento: (linhas || []).length - pagos.length,
  }
}

// "Vincular a lançamento existente": lançamentos SEM vínculo que podem ser o pagamento da ocorrência
// `data` (data baixada ou a vencer) de `schedule`. Mesma conta, mesmo tipo, valor do efetivo da
// ocorrência ±R$ 0,05, data a ±1 período da frequência; fora os já vinculados (schedule_id ou
// registered_meta.lancamento_id de outra baixa) e as sombras automáticas. Mais perto da data primeiro.
export function candidatosVinculo(schedule, data, ctx = {}) {
  return lancamentosLivresDaJanela(schedule, data, ctx)
    .filter(c => Math.abs(c.diferenca) <= 0.05)
    .sort((a, b) => a.dias - b.dias || dia(a.tx.date).localeCompare(dia(b.tx.date)))
    .map(c => c.tx)
}

// "Mostrar outros valores": os mesmos lançamentos livres (mesma conta, mesmo tipo, ±1 período) cujo
// valor fica FORA dos ±R$ 0,05. Menor diferença primeiro; `diferenca` = lançamento − previsto.
export function outrosValoresVinculo(schedule, data, ctx = {}) {
  return lancamentosLivresDaJanela(schedule, data, ctx)
    .filter(c => Math.abs(c.diferenca) > 0.05)
    .sort((a, b) => Math.abs(a.diferenca) - Math.abs(b.diferenca) || a.dias - b.dias)
    .map(({ tx, diferenca }) => ({ tx, diferenca }))
}

function lancamentosLivresDaJanela(schedule, data, { transactions = [], schedules = [] } = {}) {
  if (!schedule || !data) return []
  const alvo = Number(occEfetiva(schedule, dia(data)).amount) || 0
  const janela = JANELA_DIAS[schedule.frequency] ?? 31
  const vinculados = lancamentosVinculados(schedules, transactions)
  const tipo = schedule.transactionType || 'expense'
  return (transactions || [])
    .filter(t => !vinculados.has(t.id) && !t.scheduleId && !t.reservaAuto
      && t.accountId === schedule.accountId && (t.type || 'expense') === tipo
      && distDias(t.date, data) <= janela)
    .map(t => ({ tx: t, dias: distDias(t.date, data), diferenca: r2((Number(t.amount) || 0) - alvo) }))
}
