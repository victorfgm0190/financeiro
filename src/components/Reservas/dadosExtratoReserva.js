import { useCallback, useMemo } from 'react'
import { useApp } from '../../context/AppContext'
import { isoLocal } from '../../lib/hoje'
import { indexarReserva, saldoDaFuncao } from '../../lib/saldoReserva'
import { funcoesReservaNoPerfil } from '../../lib/fluxoReservaTotais'
import { realizadosDaFuncao } from '../../lib/extratoReserva'
import { buildFluxoWindow, computeScheduledByFunction } from '../../lib/fluxoReservaProjecao'
import { mesDaData, somarMeses, periodoDaPreferencia, janelaDoPeriodo } from '../../lib/fluxoPeriodo'
import { estadoBoasVindas } from '../../lib/boasVindasApi'

// Dados do Extrato da função (ExtratoReservaModal) para quem NÃO está dentro de Reservas › Fluxo
// Futuro — o card "Fluxo de Caixa da Reserva" do menu Relatórios. Mesmas entradas e mesmas funções
// do ReservasPanel/FluxoTab (fonte única em lib/): saldo de hoje por saldoDaFuncao, filtro de perfil
// por funcoesReservaNoPerfil (função "Sem vínculo" com todos os lançamentos e agendamentos), previstos
// por computeScheduledByFunction na mesma janela, realizados por realizadosDaFuncao. Os valores são
// os mesmos dos dois caminhos (teste em ExtratoReserva.test.jsx).
export function useDadosExtratoReserva() {
  const {
    reserveFunctions = [], profileTransactions: transactions = [], profileSchedules: schedules = [], scheduleReservaFuncoes,
    getFinancialPeriod, getOccurrencesProjecao: getNextOccurrences, reservePeriods, reserveAdjustments,
    accounts: todasContas = [], profiles, activeProfileId, transactions: todosLancamentos = [], schedules: todosAgendamentos = [],
  } = useApp()
  const hoje = isoLocal(new Date())

  const reservaIdx = useMemo(
    () => indexarReserva({ periods: reservePeriods, adjustments: reserveAdjustments, transactions }),
    [reservePeriods, reserveAdjustments, transactions],
  )
  const reservaIdxTodos = useMemo(
    () => (activeProfileId ? indexarReserva({ periods: reservePeriods, adjustments: reserveAdjustments, transactions: todosLancamentos }) : reservaIdx),
    [activeProfileId, reservePeriods, reserveAdjustments, todosLancamentos, reservaIdx],
  )
  const semVinculoIds = useMemo(() => funcoesReservaNoPerfil(reserveFunctions, todasContas, profiles, null).semVinculo, [reserveFunctions, todasContas, profiles])
  const idxDe = useCallback((f) => (semVinculoIds.has(f.id) ? reservaIdxTodos : reservaIdx), [semVinculoIds, reservaIdxTodos, reservaIdx])
  const agendamentosSemVinculo = activeProfileId ? todosAgendamentos : schedules

  const funcoes = useMemo(() => {
    const efetivas = reserveFunctions.map(f => ({ ...f, saldo: saldoDaFuncao(f, hoje, idxDe(f)).saldo }))
    return funcoesReservaNoPerfil(efetivas, todasContas, profiles, activeProfileId).funcoes.filter(f => f.accountId)
  }, [reserveFunctions, hoje, idxDe, todasContas, profiles, activeProfileId])
  const contas = useMemo(() => todasContas.filter(a => a.type !== 'credit'), [todasContas])

  // Mesmo ponto de partida do FluxoTab (saldosAtualizados = saldo da função até hoje).
  const saldoInicialDe = useCallback((f) => f.saldo ?? 0, [])
  const atual = mesDaData(getFinancialPeriod().start)
  const periodoInicial = useMemo(() => periodoDaPreferencia(estadoBoasVindas()?.progresso?.fluxoPeriodo ?? null, atual), [atual])
  const inicioJanela = somarMeses(mesDaData(new Date()), -1)

  const previstosDoPeriodo = useCallback((p) => {
    const jan = janelaDoPeriodo(p, inicioJanela)
    const win = buildFluxoWindow(jan.meses)
    const sched = {
      ...computeScheduledByFunction(funcoes.filter(f => !semVinculoIds.has(f.id)), contas, schedules, scheduleReservaFuncoes, getNextOccurrences, win),
      ...computeScheduledByFunction(funcoes.filter(f => semVinculoIds.has(f.id)), contas, agendamentosSemVinculo, scheduleReservaFuncoes, getNextOccurrences, win),
    }
    return { win, ini: jan.primeiro, sched }
  }, [inicioJanela, funcoes, semVinculoIds, contas, schedules, agendamentosSemVinculo, scheduleReservaFuncoes, getNextOccurrences])

  const realizadosDe = useCallback((f, desde) => realizadosDaFuncao(f, desde, hoje, idxDe(f)), [hoje, idxDe])

  return { funcoes, saldoInicialDe, previstosDoPeriodo, realizadosDe, periodoInicial, atual, hoje }
}
