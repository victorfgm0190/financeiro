import { ehFontePrevista, resolverFontePrevista } from './gerencialPrevistos'

const round2 = n => Math.round(n * 100) / 100

// Parte de UMA função de reserva num agendamento (resgate/depósito) — a regra de rateio que o Fluxo
// Futuro usa para montar Dep/Res por função, e que a composição do resgate reaproveita para recortar
// os gastos da linha clicada. Fonte única: não duplicar esta conta em outro lugar.
//
//   • Com detalhamento (`det` = linhas de schedule_reserva_funcoes do agendamento): o motor grava
//     1 linha por gasto da fatura com o reserva_funcao_id DO PRÓPRIO GASTO (lançamento, ou o
//     agendamento de onde veio o previsto). A parte da função = soma das linhas dela; os gastos
//     dela = source_lancamento_id (ou source_ids, no modelo antigo agregado) dessas linhas.
//     Linha com reserva_funcao_id null (gasto sem função) não cai em função nenhuma.
//   • Sem detalhamento: o agendamento inteiro vai para schedule.reservaFuncaoId. `fonteIds: null`
//     = todas as fontes do agendamento.
export function parteDaFuncao(schedule, det, functionId) {
  if (det && det.length > 0) {
    let valor = 0
    const fonteIds = new Set()
    for (const srf of det) {
      if (srf.reservaFuncaoId !== functionId) continue
      valor = round2(valor + (Number(srf.valor) || 0))
      if (srf.sourceLancamentoId) fonteIds.add(srf.sourceLancamentoId)
      for (const id of (srf.sourceIds || [])) fonteIds.add(id)
    }
    return { valor, fonteIds }
  }
  if (schedule?.reservaFuncaoId === functionId) return { valor: schedule.amount || 0, fonteIds: null }
  return { valor: 0, fonteIds: new Set() }
}

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
//
// `recorte` (opcional, vindo do Fluxo Futuro) = { functionId, det, valor }: mantém só as fontes da
// parte daquela função (parteDaFuncao, a mesma regra que montou a linha) e valida contra `valor`
// (o valor da LINHA), não contra o amount total do agendamento.
export function composicaoResgate(schedule, transactions = [], schedules = [], getOccurrences, recorte = null) {
  const todas = schedule?.sourceExpenseIds || []
  const fonteIdsParte = recorte ? parteDaFuncao(schedule, recorte.det, recorte.functionId).fonteIds : null
  const fontes = fonteIdsParte ? todas.filter(id => fonteIdsParte.has(id)) : todas
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
  const amountResgate = round2(Number(recorte ? recorte.valor : schedule?.amount) || 0)
  const diferenca = round2(total - amountResgate)
  return {
    gastos,
    total,
    amountResgate,
    diferenca,
    fecha: Math.abs(diferenca) <= 0.005,
    qtdPrevistos: previstos.length,
    semFontes: todas.length === 0,
  }
}

// Item de SAÍDA do Fluxo Futuro (Reservas) para uma ocorrência de transferência saindo da reserva.
// Só o resgate de cartão carrega `resgateScheduleId` — é o que torna a linha clicável no modal da
// célula; transferência comum/provisão fica sem ele e continua só texto.
// `functionId` = função da célula: a composição recorta os gastos pela parte dela (amount = parte).
export function itemSaidaFluxo(schedule, date, amount, functionId) {
  const item = { date, label: schedule?.description || 'Resgate', amount }
  if (ehResgateDeCartao(schedule)) {
    item.resgateScheduleId = schedule.id
    item.functionId = functionId
  }
  return item
}

export function itemAbreComposicao(item) {
  return !!item?.resgateScheduleId
}
