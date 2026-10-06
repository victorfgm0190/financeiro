import { ehFontePrevista, resolverFontePrevista } from './gerencialPrevistos'

const round2 = n => Math.round(n * 100) / 100

// Resgate de cartão = agendamento resgate_reserva (um por conta-origem × fatura, do MESMO mês da
// fatura). É o tipo — não o texto da descrição — que identifica a linha como resgate.
export function ehResgateDeCartao(schedule) {
  return schedule?.tipo === 'resgate_reserva'
}

// Composição per-gasto de um resgate_reserva, via schedule.sourceExpenseIds. Duas espécies de fonte:
//   • lançamento de cartão já efetivado (id comum) — resolvido em transactions;
//   • despesa agendada ainda pendente (id 'sch:<agendamento>@<data>') — resolvida em schedules.
// Realizados primeiro, depois previstos, cada bloco em ordem de data. `diferenca` = total − amount
// do resgate: o invariante é fechar em zero. `semFontes` = resgate antigo/manual, sem rastreio.
export function composicaoResgate(schedule, transactions = [], schedules = [], getOccurrences) {
  const fontes = schedule?.sourceExpenseIds || []
  const txById = new Map((transactions || []).map(t => [t.id, t]))
  const porData = (a, b) => (a.date || '').localeCompare(b.date || '')

  const realizados = fontes
    .filter(id => !ehFontePrevista(id))
    .map(id => txById.get(id))
    .filter(Boolean)
    .map(t => ({
      key: t.id, date: t.date, description: t.description || '—',
      categoryId: t.categoryId, valor: Number(t.amount) || 0, previsto: false, orfao: false,
    }))
    .sort(porData)

  const previstos = fontes
    .filter(ehFontePrevista)
    .map(id => resolverFontePrevista(id, schedules, getOccurrences))
    .filter(Boolean)
    .map(p => ({
      key: p.id, date: p.date,
      // Agendamento apagado depois de o resgate ser executado: a linha fica, dizendo o que é.
      description: p.description || '(agendamento removido)',
      categoryId: p.categoryId, valor: p.valor, previsto: true, orfao: !p.schedule,
    }))
    .sort(porData)

  const gastos = [...realizados, ...previstos]
  const total = round2(gastos.reduce((s, g) => s + g.valor, 0))
  const amountResgate = round2(Number(schedule?.amount) || 0)
  const diferenca = round2(total - amountResgate)
  return {
    gastos,
    total,
    amountResgate,
    diferenca,
    fecha: Math.abs(diferenca) <= 0.005,
    qtdPrevistos: previstos.length,
    semFontes: fontes.length === 0,
  }
}

// Item de SAÍDA do Fluxo Futuro (Reservas) para uma ocorrência de transferência saindo da reserva.
// Só o resgate de cartão carrega `resgateScheduleId` — é o que torna a linha clicável no modal da
// célula; transferência comum/provisão fica sem ele e continua só texto.
export function itemSaidaFluxo(schedule, date, amount) {
  const item = { date, label: schedule?.description || 'Resgate', amount }
  if (ehResgateDeCartao(schedule)) item.resgateScheduleId = schedule.id
  return item
}

export function itemAbreComposicao(item) {
  return !!item?.resgateScheduleId
}
