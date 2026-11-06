// O que os agendamentos preveem para cada função de reserva numa janela de datas. Fonte única do Fluxo
// Futuro, do plano de venda do consórcio e do aviso de caixa da reserva.
//   deposito: transferência entrando na conta de reserva, na parte da função (entrada prevista);
//   resgate:  transferência saindo da conta de reserva, na parte da função;
//   provisao: provisão de despesa ligada à função, a próxima ainda não efetivada (saída prevista).
// Cada item: { tipo, date, amount, label, schedule, itemFluxo }. Em ordem de data.
import { occEfetiva } from './fluxoCaixa.js'
import { parteDaFuncao, parteDaFuncaoNaOcorrencia, itemSaidaFluxo } from './resgateComposicao.js'

export function previsoesDasFuncoes(funcoes, { accounts = [], schedules = [], scheduleReservaFuncoes = [], getNextOccurrences }, { ini, fim }) {
  const accById = new Map(accounts.map(a => [a.id, a]))
  const detBySchedule = new Map()
  for (const srf of scheduleReservaFuncoes || []) {
    if (!detBySchedule.has(srf.scheduleId)) detBySchedule.set(srf.scheduleId, [])
    detBySchedule.get(srf.scheduleId).push(srf)
  }
  const transfers = (schedules || []).filter(s => s.transactionType === 'transfer' && (s.reservaFuncaoId || detBySchedule.has(s.id)))
  const provisoes = (schedules || []).filter(s => s.isProvisao && !s.provisaoEfetivada && s.transactionType === 'expense' && s.reservaFuncaoId)
  const out = {}
  for (const f of funcoes) {
    const itens = []
    for (const p of provisoes) {
      if (p.reservaFuncaoId !== f.id) continue
      const occs = getNextOccurrences(p, 24)
      const until = p.provisaoEfetivadaUntil || null
      // `until` compara datas-base (chave); a janela e o valor usam a ocorrência EFETIVA.
      const base = until ? occs.find(dd => dd > until) : occs[0]
      if (!base) continue
      const ef = occEfetiva(p, base)
      const amount = Number(ef.amount) || 0
      if (!amount || ef.date < ini || ef.date > fim) continue
      const label = p.description || 'Resgate (provisão)'
      itens.push({ tipo: 'provisao', date: ef.date, amount, label, schedule: p, itemFluxo: { date: ef.date, label, amount } })
    }
    for (const s of transfers) {
      const isDep = !!accById.get(s.toAccountId)?.isReserva
      const isRes = !isDep && !!accById.get(s.accountId)?.isReserva
      if (!isDep && !isRes) continue
      // Regra de rateio por função em parteDaFuncao, a mesma da composição do resgate, aplicada à
      // ocorrência EFETIVA (data e valor do override).
      const det = detBySchedule.get(s.id)
      if (!parteDaFuncao(s, det, f.id).valor) continue
      for (const base of getNextOccurrences(s, 140)) {
        const { date, valor: amount } = parteDaFuncaoNaOcorrencia(s, det, f.id, base)
        if (!amount || date < ini || date > fim) continue
        const label = s.description || (isDep ? 'Depósito' : 'Resgate')
        itens.push(isDep
          ? { tipo: 'deposito', date, amount, label, schedule: s, itemFluxo: { date, label, amount } }
          : { tipo: 'resgate', date, amount, label, schedule: s, itemFluxo: itemSaidaFluxo(s, date, amount, f.id) })
      }
    }
    out[f.id] = itens.sort((a, b) => a.date.localeCompare(b.date))
  }
  return out
}
