// Núcleo do Fluxo de Caixa por Conta — fonte ÚNICA da projeção de saldo de um conjunto de
// contas dentro de um período. Usado pelo relatório (Reports/FluxoCaixaPorConta) e pelos KPIs
// FINAL CICLO / PROJETADO do Painel Geral, garantindo que ambos calculem do MESMO jeito.
//
// Modelo (ancorado no saldo REAL das contas — account.balance):
//   saldoAnterior = Σ balance − Σ(transações reais com data >= start)   [saldo na véspera de start]
//   saldoFinal    = saldoAnterior + Σ(movimentos do período: transações + agendamentos + envelopes)
//   PROJETADO     = saldoFinal (já com os envelopes restantes subtraídos)
//   FINAL CICLO   = saldoFinal + envelopesTotal (mesma projeção SEM subtrair os envelopes)

import { isReservaShadowOrigin, isPatrimonioOrigin, isInvestAutoOrigin } from './origins'

const round2 = n => Math.round(n * 100) / 100

// Ciclos de um envelope (dueDay D: período de D+1 de um mês até D do mês seguinte) que se
// SOBREPÕEM ao intervalo [start, end] — sobreposição quando ciclo.from <= end E ciclo.to >= start.
export function envelopeCyclesOverlapping(dueDay, start, end) {
  const startD = new Date(start + 'T00:00:00')
  const endD = new Date(end + 'T00:00:00')
  const cycles = []
  let cur = new Date(startD.getFullYear(), startD.getMonth() - 1, 1)
  const stop = new Date(endD.getFullYear(), endD.getMonth() + 2, 1)
  while (cur < stop) {
    const y = cur.getFullYear(), mo = cur.getMonth()
    const to = new Date(y, mo, dueDay)
    const from = new Date(y, mo - 1, dueDay + 1)
    if (from <= endD && to >= startD) {
      const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      cycles.push({ from: fmt(from), to: fmt(to) })
    }
    cur = new Date(y, mo + 1, 1)
  }
  return cycles
}

// Aplica o override de uma ocorrência específica do agendamento. Os overrides ficam em
// schedule.overrides[dataOriginal] = { date?, amount? }. Devolve a data e o valor EFETIVOS.
// (Chaves não-data, como _gerencialKey, nunca casam com 'YYYY-MM-DD' e são ignoradas.)
export function occEfetiva(schedule, dataOriginal) {
  const ov = schedule.overrides?.[dataOriginal]
  if (!ov || typeof ov !== 'object') return { date: dataOriginal, amount: schedule.amount }
  return {
    date: ov.date || dataOriginal,
    amount: ov.amount != null ? Number(ov.amount) : schedule.amount,
  }
}

// Computa as linhas e os saldos do fluxo de caixa de `accountIds` no período [start, end].
// Devolve { rows, saldoAnterior, saldoFinal, saldoFinalSemEnvelopes, totalEntrada, totalSaida,
// envelopesTotal }. saldoFinal = PROJETADO (com envelopes); saldoFinalSemEnvelopes = FINAL CICLO.
export function computeFluxoCaixa({
  accountIds,
  currentBalance,
  start,
  end,
  transactions = [],
  schedules = [],
  envelopes = [],
  reserveFunctions = [],
  getNextOccurrences,
  includeSchedules = true,
  hideReserva = false,
  hidePatrimonio = false,
  reservaSet = new Set(),
  patrimonioSet = new Set(),
}) {
  const empty = {
    rows: [], saldoAnterior: currentBalance,
    saldoAnteriorRealizado: currentBalance, saldoAnteriorComAgendamentos: currentBalance,
    saldoFinal: currentBalance,
    saldoFinalSemEnvelopes: currentBalance, totalEntrada: 0, totalSaida: 0, envelopesTotal: 0,
  }
  if (!accountIds || accountIds.size === 0 || !start || !end || start > end) return empty

  const funcById = new Map((reserveFunctions || []).map(f => [f.id, f]))
  const out = []

  const tocaReserva = (from, to) => hideReserva && (reservaSet.has(from) || reservaSet.has(to))
  const tocaPatrimonio = (from, to) => hidePatrimonio && (patrimonioSet.has(from) || patrimonioSet.has(to))
  const oculto = (from, to) => tocaReserva(from, to) || tocaPatrimonio(from, to)

  // Entrada/saída de um movimento em relação ao conjunto. Transferência interna (ambos no
  // conjunto) é neutralizada.
  const classify = (type, fromAcc, toAcc, amount) => {
    const fromIn = accountIds.has(fromAcc)
    const toIn = accountIds.has(toAcc)
    if (!fromIn && !toIn) return null
    if (type === 'transfer' && fromIn && toIn) return null
    if (type === 'income' && fromIn) return { entrada: amount, saida: 0 }
    if (type === 'expense' && fromIn) return { entrada: 0, saida: amount }
    if (type === 'transfer') {
      if (toIn && !fromIn) return { entrada: amount, saida: 0 }
      if (fromIn && !toIn) return { entrada: 0, saida: amount }
    }
    return null
  }

  // 1. Transações reais dentro do período → "Registrada".
  transactions.forEach(tx => {
    if (tx.date < start || tx.date > end) return
    if (oculto(tx.accountId, tx.toAccountId)) return
    const m = classify(tx.type, tx.accountId, tx.toAccountId, tx.amount)
    if (!m) return
    out.push({
      date: tx.date, description: tx.description || '(sem descrição)', type: tx.type,
      fromAccountId: tx.accountId, toAccountId: tx.toAccountId,
      categoryId: tx.categoryId || tx.reservaExpenseCategoryId || null,
      reservaFuncaoId: tx.reservaFuncaoId || null,
      entrada: m.entrada, saida: m.saida, status: 'Registrada', real: true, _key: tx.id,
    })
  })

  // 2. Agendamentos pendentes (ocorrências não registradas). Os que caem DENTRO do período viram
  // linhas; os ANTERIORES a `start` (a pagar/provisões vencidas ainda não registradas) somam-se ao
  // "saldo anterior c/ agendamentos" (agendamentosAntes) — sem virar linha do período.
  let agendamentosAntes = 0
  if (includeSchedules) {
    schedules.forEach(s => {
      // Provisão de despesa COM reserva vinculada (não efetivada): projeta DUAS linhas por
      // ocorrência — resgate (reserva → principal) + despesa (principal → externo).
      const provFunc = (s.isProvisao && !s.provisaoEfetivada && s.transactionType === 'expense' && s.reservaFuncaoId)
        ? funcById.get(s.reservaFuncaoId) : null
      const reservaAccId = provFunc?.accountId || null
      if (reservaAccId) {
        const principalId = s.accountId
        if (!accountIds.has(principalId) && !accountIds.has(reservaAccId)) return
        getNextOccurrences(s, 400).forEach(origDate => {
          const { date, amount } = occEfetiva(s, origDate)
          if (date > end) return
          const antes = date < start
          if (!oculto(reservaAccId, principalId)) {
            const m1 = classify('transfer', reservaAccId, principalId, amount)
            if (m1) {
              if (antes) agendamentosAntes = round2(agendamentosAntes + m1.entrada - m1.saida)
              else out.push({
                date, description: `Resgate reserva — ${s.description || 'provisão'}`, type: 'transfer',
                fromAccountId: reservaAccId, toAccountId: principalId, categoryId: null,
                reservaFuncaoId: s.reservaFuncaoId || null,
                entrada: m1.entrada, saida: m1.saida, status: 'Projetado', real: false,
                _key: s.id + '_resg_' + origDate,
              })
            }
          }
          if (!oculto(principalId, null)) {
            const m2 = classify('expense', principalId, null, amount)
            if (m2) {
              if (antes) agendamentosAntes = round2(agendamentosAntes + m2.entrada - m2.saida)
              else out.push({
                date, description: s.description || '(agendamento)', type: 'expense',
                fromAccountId: principalId, toAccountId: null,
                categoryId: s.categoryId || s.reservaExpenseCategoryId || null,
                reservaFuncaoId: s.reservaFuncaoId || null,
                entrada: m2.entrada, saida: m2.saida, status: 'Projetado', real: false,
                _key: s.id + '_desp_' + origDate,
              })
            }
          }
        })
        return
      }

      if (!accountIds.has(s.accountId) && !accountIds.has(s.toAccountId)) return
      if (oculto(s.accountId, s.toAccountId)) return
      getNextOccurrences(s, 400).forEach(origDate => {
        const { date, amount } = occEfetiva(s, origDate)
        if (date > end) return
        const m = classify(s.transactionType, s.accountId, s.toAccountId, amount)
        if (!m) return
        if (date < start) { agendamentosAntes = round2(agendamentosAntes + m.entrada - m.saida); return }
        out.push({
          date, description: s.description || '(agendamento)', type: s.transactionType,
          fromAccountId: s.accountId, toAccountId: s.toAccountId,
          categoryId: s.categoryId || s.reservaExpenseCategoryId || null,
          reservaFuncaoId: s.reservaFuncaoId || null,
          entrada: m.entrada, saida: m.saida,
          status: m.entrada > 0 ? 'A receber' : 'A pagar', real: false, _key: s.id + '_' + origDate,
        })
      })
    })

    // 3. Envelopes: por ciclo de envelope que se sobrepõe a [start, end], o restante
    // (limite − gasto no ciclo), datado no fim do ciclo (vencimento).
    const isEnvExpense = (tx) =>
      tx.type === 'expense' && !tx.reservaAuto &&
      !isReservaShadowOrigin(tx) && !isPatrimonioOrigin(tx) && !isInvestAutoOrigin(tx)

    ;(envelopes || []).forEach(env => {
      if (!env.accountId || !accountIds.has(env.accountId)) return
      if (oculto(env.accountId, null)) return
      for (const cyc of envelopeCyclesOverlapping(env.dueDay || 1, start, end)) {
        let spent = 0
        for (const tx of transactions) {
          if (!isEnvExpense(tx)) continue
          if (!env.categoryIds?.includes(tx.categoryId)) continue
          if (!tx.date || tx.date < cyc.from || tx.date > cyc.to) continue
          spent += tx.amount
        }
        const restante = round2(Math.max(0, (env.limitAmount || 0) - spent))
        if (restante <= 0) continue
        out.push({
          date: cyc.to, description: `Envelope: ${env.name || '(envelope)'}`, type: 'expense',
          fromAccountId: env.accountId, toAccountId: null,
          entrada: 0, saida: restante, _envelope: true,
          status: 'Projetado', real: false, _key: 'env_' + env.id + '_' + cyc.to,
        })
      }
    })
  }

  out.sort((a, b) => a.date.localeCompare(b.date) || (a.real === b.real ? 0 : a.real ? -1 : 1))

  // saldoAnterior = saldo na véspera de `start`. O balance reflete TODAS as transações reais;
  // subtraímos o efeito líquido das reais com data >= start. (Ocultos seguem a mesma regra.)
  let efeitoDesdeStart = 0
  transactions.forEach(tx => {
    if (tx.date < start) return
    if (oculto(tx.accountId, tx.toAccountId)) return
    const m = classify(tx.type, tx.accountId, tx.toAccountId, tx.amount)
    if (!m) return
    efeitoDesdeStart = round2(efeitoDesdeStart + m.entrada - m.saida)
  })
  // Saldo anterior REALIZADO: só transações reais (o balance reflete apenas elas) na véspera de start.
  const saldoAnterior = round2(currentBalance - efeitoDesdeStart)
  // Saldo anterior C/ AGENDAMENTOS: realizado + agendamentos pendentes/provisões com data < start.
  const saldoAnteriorComAgendamentos = round2(saldoAnterior + agendamentosAntes)

  // O acumulador do período parte do saldo anterior C/ AGENDAMENTOS (inclui as pendências vencidas).
  let bal = saldoAnteriorComAgendamentos
  let envelopesTotal = 0
  out.forEach(r => {
    if (r._envelope) envelopesTotal = round2(envelopesTotal + r.saida)
    bal = round2(bal + r.entrada - r.saida)
    r.saldo = bal
  })
  const saldoFinal = out.length ? out[out.length - 1].saldo : saldoAnteriorComAgendamentos
  const totalEntrada = round2(out.reduce((s, r) => s + r.entrada, 0))
  const totalSaida = round2(out.reduce((s, r) => s + r.saida, 0))

  return {
    rows: out,
    saldoAnterior,                               // = realizado (mantido p/ retrocompat)
    saldoAnteriorRealizado: saldoAnterior,
    saldoAnteriorComAgendamentos,
    saldoFinal,                                  // PROJETADO (com envelopes subtraídos)
    saldoFinalSemEnvelopes: round2(saldoFinal + envelopesTotal), // FINAL CICLO (sem envelopes)
    totalEntrada,
    totalSaida,
    envelopesTotal,
  }
}
