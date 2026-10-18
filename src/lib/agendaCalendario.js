// Visão CALENDÁRIO da tela de Agendamentos. Sem React — testável. Só exibição: parte das MESMAS
// linhas da lista (buildScheduleGroups) e dos mesmos valores efetivos (occEfetiva); nada aqui grava.
//
// Item do calendário:
//   { key, data, amount, grupo, schedule?, row?, fatura?, pago, proxima, ocorrencia, antesDe, atrasado, semLancamento }
//   grupo     — classificarAgendamento: despesa | fatura | receita | aplicacao | resgate | transferencia
//   proxima   — é a próxima pendente do agendamento (ações completas); as seguintes são só leitura
//   antesDe   — nas seguintes: data da próxima pendente ("Antes, efetive a de dd/mm")
//   original  — data ORIGINAL da ocorrência (chave estável: overrides, UID do feed .ics)
import { occEfetiva } from './fluxoCaixa.js'
import { classificarAgendamento } from './resumoSelecao.js'

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const pad = (n) => String(n).padStart(2, '0')
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`

export const NOMES_MES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
export const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// 'YYYY-MM' ± n meses.
export function somarMeses(ym, n) {
  const [y, m] = ym.split('-').map(Number)
  const t = y * 12 + (m - 1) + n
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`
}

export function limitesDoMes(ym) {
  const [y, m] = ym.split('-').map(Number)
  return [iso(y, m, 1), iso(y, m, new Date(y, m, 0).getDate())]
}

// Semanas do mês (domingo a sábado), com os dias dos meses vizinhos completando a 1ª e a última.
// → [[{ data, doMes }] × 7]
export function gradeDoMes(ym) {
  const [y, m] = ym.split('-').map(Number)
  const primeiro = new Date(y, m - 1, 1)
  const ultimoDia = new Date(y, m, 0).getDate()
  const inicio = new Date(y, m - 1, 1 - primeiro.getDay())
  const fimGrade = new Date(y, m - 1, ultimoDia + (6 - new Date(y, m - 1, ultimoDia).getDay()))
  const semanas = []
  for (let d = new Date(inicio); d <= fimGrade; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    if (d.getDay() === 0) semanas.push([])
    semanas[semanas.length - 1].push({ data: iso(d.getFullYear(), d.getMonth() + 1, d.getDate()), doMes: d.getMonth() === m - 1 })
  }
  return semanas
}

// Agrupamento das cores do dia: vermelho (saídas: despesa + fatura), verde (receita) e cinza
// (movimentos entre contas: transferência, aplicação, resgate — fora dos totais do mês).
export function ladoDoGrupo(grupo) {
  if (grupo === 'despesa' || grupo === 'fatura') return 'saida'
  if (grupo === 'receita') return 'entrada'
  return 'neutro'
}

// Chave cartão|YYYY-MM de uma fatura: do contas_a_pagar ({ cartaoId, mesAno }) ou do agendamento
// pagamento_fatura (cardId/_gerencial.cardId/toAccountId + faturaRef "MM/YYYY" ou o id
// fsch_<card>_<yyyymm>_pagamento_fatura). null quando não dá para saber.
export function chaveFatura(x) {
  if (!x) return null
  if (x.cartaoId && x.mesAno) return `${x.cartaoId}|${x.mesAno}`
  const g = x.overrides?._gerencial || {}
  const card = x.cardId || g.cardId || x.toAccountId
  const ref = g.faturaRef || x.faturaRef
  if (card && ref && /^\d{2}\/\d{4}$/.test(ref)) {
    const [mm, yyyy] = ref.split('/')
    return `${card}|${yyyy}-${mm}`
  }
  const m = String(x.id || '').match(/_(\d{4})(\d{2})_pagamento_fatura$/)
  return card && m ? `${card}|${m[1]}-${m[2]}` : null
}

// Faturas do contas_a_pagar que NÃO têm agendamento pagamento_fatura da mesma fatura (o agendamento
// é a fonte de verdade): sem isto o mesmo vencimento apareceria duas vezes no dia (card + linha).
export function faturasSemAgendamento(faturas, agendamentosFatura) {
  const chaves = new Set((agendamentosFatura || []).map(chaveFatura).filter(Boolean))
  return (faturas || []).filter(p => !chaves.has(chaveFatura(p)))
}

// Ocorrências PENDENTES de `rows` (buildScheduleGroups) com data em [ini, fim]. Por linha: a
// principal (displayDate, valor efetivo do nextDate — o que a lista mostra), os futureItems da
// lista e, para recorrentes, as seguintes pela MESMA getNextOccurrences/occEfetiva até `fim`.
export function ocorrenciasPendentes(rows, getNextOccurrences, { ini, fim, hoje, accounts = [] }) {
  const out = []
  const push = (it) => { if (it.data && it.data >= ini && it.data <= fim) out.push(it) }
  for (const row of rows || []) {
    const s = row.schedule
    if (!row.nextDate || !row.displayDate) continue
    const grupo = classificarAgendamento(s, accounts)
    const base = { schedule: s, row, grupo, pago: false }
    push({ ...base, key: `${s.id}@${row.nextDate}`, data: row.displayDate, amount: r2(occEfetiva(s, row.nextDate).amount),
      proxima: true, ocorrencia: row.nextDate, original: row.nextDate, antesDe: null, atrasado: row.displayDate < hoje })
    const futuras = row.futureItems || []
    futuras.forEach((f, i) => push({ ...base, key: `${s.id}#${i + 1}`, data: f.date, amount: r2(f.amount),
      proxima: false, ocorrencia: null, original: f.base || null, antesDe: row.displayDate, atrasado: false }))
    // Recorrente além das ocorrências que a lista lista: segue a mesma série até o fim do mês.
    if ((s.frequency || 'once') === 'once' || row.isSerie) continue
    const ultima = futuras.length ? futuras[futuras.length - 1].date : row.displayDate
    if (ultima >= fim) continue
    let n = futuras.length + 1
    let occs = []
    while (n < 2000) {
      n = Math.max(n * 2, 24)
      occs = getNextOccurrences(s, n)
      const ult = occs[occs.length - 1]
      if (occs.length < n || !ult || occEfetiva(s, ult).date > fim) break
    }
    occs.slice(futuras.length + 1).forEach((o, j) => {
      const e = occEfetiva(s, o)
      push({ ...base, key: `${s.id}#${futuras.length + 1 + j}`, data: e.date, amount: r2(e.amount),
        proxima: false, ocorrencia: null, original: o, antesDe: row.displayDate, atrasado: false })
    })
  }
  return out
}

// Faturas do contas_a_pagar (cards da aba Cartão) pelo vencimento. Pendentes só.
export function ocorrenciasFaturas(faturas, { ini, fim, hoje }) {
  return (faturas || [])
    .filter(p => p.status === 'pending' && p.dueDate >= ini && p.dueDate <= fim)
    .map(p => ({ key: `cap:${p.id}`, fatura: p, data: p.dueDate, amount: r2(p.amount), grupo: 'fatura',
      pago: false, proxima: true, ocorrencia: null, antesDe: null, atrasado: p.dueDate < hoje }))
}

// Pagos (linhas da aba Pagos — pagamentosDosAgendamentos) pela data do PAGAMENTO. Baixa sem
// lançamento aparece, mas não soma (mesma regra do total pago da aba).
export function ocorrenciasPagas(linhas, { ini, fim, accounts = [] }) {
  return (linhas || [])
    .filter(l => l.dataPagamento && l.dataPagamento >= ini && l.dataPagamento <= fim)
    .map(l => ({ key: `pago:${l.key}`, schedule: l.schedule, linhaPaga: l, data: l.dataPagamento, amount: r2(l.amount),
      grupo: classificarAgendamento(l.schedule, accounts), pago: true, semLancamento: !!l.semLancamento,
      proxima: false, ocorrencia: null, antesDe: null, atrasado: false }))
}

const totaisVazios = () => ({
  aPagar: { saida: 0, entrada: 0, neutro: 0 },
  pago: { saida: 0, entrada: 0, neutro: 0 },
  qtd: 0, atrasados: 0,
})

// Totais de uma lista de itens, com "pago" e "a pagar" SEMPRE separados.
export function totaisDe(itens) {
  const t = totaisVazios()
  for (const it of itens) {
    t.qtd++
    if (it.atrasado) t.atrasados++
    if (it.semLancamento) continue
    const alvo = it.pago ? t.pago : t.aPagar
    const lado = ladoDoGrupo(it.grupo)
    alvo[lado] = r2(alvo[lado] + it.amount)
  }
  return t
}

// itens → Map(data → { itens (ordenados), totais }).
export function porDia(itens) {
  const m = new Map()
  for (const it of itens) {
    if (!m.has(it.data)) m.set(it.data, [])
    m.get(it.data).push(it)
  }
  const out = new Map()
  for (const [d, lista] of m) {
    // Atrasado e pendente antes; pagos por último; depois o maior valor.
    lista.sort((a, b) => Number(a.pago) - Number(b.pago) || Number(b.proxima) - Number(a.proxima) || b.amount - a.amount)
    out.set(d, { itens: lista, totais: totaisDe(lista) })
  }
  return out
}

// Visão do mês inteira: { ini, fim, semanas, dias: Map, totais }. `status`: 'apagar' | 'provisoes' |
// 'resgates' (só pendentes), 'pagos' (só pagos) ou 'todos' (os dois, totais separados).
export function montarCalendario({ ym, status, rows, faturas = [], pagosLinhas = [], getNextOccurrences, hoje, accounts = [] }) {
  const [ini, fim] = limitesDoMes(ym)
  const semanas = gradeDoMes(ym)
  // A grade mostra também os dias dos meses vizinhos: os itens deles entram (esmaecidos), mas o
  // total do mês conta só o mês.
  const gIni = semanas[0][0].data
  const gFim = semanas[semanas.length - 1][6].data
  const comPendentes = status !== 'pagos'
  const comPagos = status === 'pagos' || status === 'todos'
  const itens = [
    ...(comPendentes ? ocorrenciasPendentes(rows, getNextOccurrences, { ini: gIni, fim: gFim, hoje, accounts }) : []),
    ...(comPendentes ? ocorrenciasFaturas(faturas, { ini: gIni, fim: gFim, hoje }) : []),
    ...(comPagos ? ocorrenciasPagas(pagosLinhas, { ini: gIni, fim: gFim, accounts }) : []),
  ]
  return { ini, fim, semanas, dias: porDia(itens), totais: totaisDe(itens.filter(i => i.data >= ini && i.data <= fim)) }
}

// Escolha Lista | Calendário, por usuário. Storage pode faltar (aba anônima, bloqueio): só não lembra.
export const VISAO_AGENDA_KEY = 'finup.agendamentos.visao.v1'
export function lerVisaoAgenda(usuarioId) {
  try {
    const v = JSON.parse(localStorage.getItem(VISAO_AGENDA_KEY) || '{}')?.[usuarioId || '_']
    return v === 'calendario' ? 'calendario' : 'lista'
  } catch { return 'lista' }
}
export function salvarVisaoAgenda(usuarioId, visao) {
  try {
    const todos = JSON.parse(localStorage.getItem(VISAO_AGENDA_KEY) || '{}') || {}
    todos[usuarioId || '_'] = visao
    localStorage.setItem(VISAO_AGENDA_KEY, JSON.stringify(todos))
  } catch { /* storage indisponível */ }
}
