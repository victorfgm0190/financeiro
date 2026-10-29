// ⚠ FUNÇÃO PROTEGIDA (ver CLAUDE.md): calcularSaldoPrincipalBreakdown é o corpo de
// getSaldoPrincipalBreakdown() do AppContext, extraído como função pura para ser testável. Não
// modificar (nem refatorar, renomear ou "só ajustar um detalhe") sem pedido explícito do usuário.
// O wrapper do AppContext só repassa os dados; a regra mora toda aqui. Ver docs/saldo-principal.md.
import { occEfetiva } from './fluxoCaixa.js'
import { isReservaShadowOrigin, isPatrimonioOrigin, isInvestAutoOrigin } from './origins.js'
import { escopoFluxoPrincipal, agendamentoNoFluxoPrincipal, valorNoFluxoPrincipal } from './fluxoPrincipal.js'

const rb = v => Math.round(v * 100) / 100

// Breakdown detalhado ("Como chegamos aqui") do Saldo Principal agregado sobre o pool de
// contas FC (fluxoCaixaPrincipal) do perfil ativo (ou de todos, em Tudo). Devolve, por seção,
// os componentes e itens (agendamentos, envelopes, lançamentos fora do ciclo) que somam cada saldo.
//
// profileId: perfil ativo (null = Tudo). getNextOccurrences(schedule, n) e getFinancialPeriod(ref)
// vêm do AppContext, para usar exatamente as mesmas ocorrências e o mesmo ciclo da tela.
export function calcularSaldoPrincipalBreakdown({
  accounts, transactions, schedules, envelopes, settings, gerencialGroups,
  profileId, getNextOccurrences, getFinancialPeriod,
}, referenceDate = new Date()) {
  const toStr = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
  const period = getFinancialPeriod(referenceDate)
  const cycleStartStr = toStr(period.start)
  const cycleEndStr = toStr(period.end)
  const calEnd = new Date(period.end.getFullYear(), period.end.getMonth() + 1, 0)
  const calendarEndStr = toStr(calEnd)
  const mode = settings.financialMonthMode || 'custom'
  const isCustom = mode === 'custom'
  const startDay = settings.financialMonthStartDay || 1

  // Pool = contas FC (fluxoCaixaPrincipal), nunca cartão, recortadas pelo perfil ativo. MESMA regra
  // em Tudo e em cada perfil: os pools dos perfis particionam o de Tudo, e todo valor abaixo é
  // aditivo (transferência entre pools se anula), então Tudo = Σ perfis quando toda conta FC tem perfil.
  const pool = accounts.filter(a => a.fluxoCaixaPrincipal && a.type !== 'credit' && (!profileId || a.profileId === profileId))
  const poolIds = new Set(pool.map(a => a.id))
  // Alcance do "Considerar no Fluxo de Caixa principal?" do agendamento (considerarFluxoPrincipal),
  // no mesmo perfil do pool. Ver src/lib/fluxoPrincipal.js (29/10/2026, pedido explícito).
  const fluxo = escopoFluxoPrincipal(accounts, poolIds, profileId)

  // Contas Ger. (subcontas do grupo G) — para separar transferências gerenciais.
  const grupoG = gerencialGroups?.find(g => g.number === 1)
  const gerIds = new Set(
    accounts.filter(a => (grupoG && a.grupoGerencial === grupoG.id) || /^Ger\. /.test(a.name || '')).map(a => a.id)
  )

  const signedTx = (tx) => {
    if (tx.type === 'income' && poolIds.has(tx.accountId)) return tx.amount
    if (tx.type === 'expense' && poolIds.has(tx.accountId) && tx.accountType !== 'credit') return -tx.amount
    if (tx.type === 'transfer') {
      return (poolIds.has(tx.toAccountId) ? tx.amount : 0) - (poolIds.has(tx.accountId) ? tx.amount : 0)
    }
    if (tx.type === 'credit_payment' && poolIds.has(tx.fromAccountId)) return -tx.amount
    return 0
  }
  const isGerencialTransfer = (tx) =>
    tx.type === 'transfer' && (tx.grupoGerencial || gerIds.has(tx.accountId) || gerIds.has(tx.toAccountId))

  // Saldo Atual = abertura + transações efetivadas até o fim do ciclo.
  const baseAbertura = pool.reduce((s, a) => s + rb(a.initialBalance ?? 0), 0)
  let txAteCiclo = 0, gerencialAteCiclo = 0, txAlemCiclo = 0
  const itensAlemCiclo = []
  for (const tx of transactions) {
    if (!tx.date) continue
    const v = signedTx(tx)
    if (v === 0) continue
    if (tx.date <= cycleEndStr) {
      txAteCiclo += v
      if (isGerencialTransfer(tx)) gerencialAteCiclo += v
    } else if (isCustom && tx.date <= calendarEndStr) {
      txAlemCiclo += v
      itensAlemCiclo.push({ description: tx.description || '(sem descrição)', amount: rb(v) })
    }
  }
  const saldoAtual = rb(baseAbertura + txAteCiclo)
  const saldoBase = rb(saldoAtual - gerencialAteCiclo) // base = atual − transferências gerenciais

  // Decomposição informativa do Saldo base por conta do pool (badge FC). Reparte o
  // saldoBase entre as contas usando as MESMAS regras (abertura + lançamentos
  // efetivados não-gerenciais até o fim do ciclo). Loop separado e aditivo, para não
  // alterar a lógica de cálculo agregada acima — a soma das contas reproduz o saldoBase.
  const contaBaseMap = new Map(pool.map(a => [a.id, rb(a.initialBalance ?? 0)]))
  const addContaLeg = (tx) => {
    if (tx.type === 'income' && poolIds.has(tx.accountId)) contaBaseMap.set(tx.accountId, contaBaseMap.get(tx.accountId) + tx.amount)
    else if (tx.type === 'expense' && poolIds.has(tx.accountId) && tx.accountType !== 'credit') contaBaseMap.set(tx.accountId, contaBaseMap.get(tx.accountId) - tx.amount)
    else if (tx.type === 'transfer') {
      if (poolIds.has(tx.toAccountId)) contaBaseMap.set(tx.toAccountId, contaBaseMap.get(tx.toAccountId) + tx.amount)
      if (poolIds.has(tx.accountId)) contaBaseMap.set(tx.accountId, contaBaseMap.get(tx.accountId) - tx.amount)
    }
    else if (tx.type === 'credit_payment' && poolIds.has(tx.fromAccountId)) contaBaseMap.set(tx.fromAccountId, contaBaseMap.get(tx.fromAccountId) - tx.amount)
  }
  for (const tx of transactions) {
    if (!tx.date || tx.date > cycleEndStr) continue
    if (isGerencialTransfer(tx)) continue
    addContaLeg(tx)
  }
  const contasBase = pool.map(a => ({ id: a.id, name: a.apelido || a.name, saldo: rb(contaBaseMap.get(a.id) ?? 0) }))

  // Agendamentos pendentes (ocorrências não registradas) no intervalo [início do ciclo,
  // dateStr] — inclui os vencidos não registrados do ciclo (alinha com getAccountSaldos e
  // com o relatório Fluxo de Caixa por Conta).
  const collectSched = (endStr) => {
    const items = []
    let total = 0
    for (const s of schedules) {
      if (!agendamentoNoFluxoPrincipal(s, fluxo)) continue
      // Pertence ao ciclo pela data EFETIVA (override de data da ocorrência), não pela data-base:
      // a ocorrência de 28/09 movida para 16/10 conta no ciclo que contém 16/10 (2026-10-16,
      // pedido explícito do usuário). Mesma regra do getAccountSaldos e do Fluxo de Caixa.
      const occs = getNextOccurrences(s, 120)
        .map(dt => occEfetiva(s, dt))
        .filter(ef => ef.date >= cycleStartStr && ef.date <= endStr)
      if (occs.length === 0) continue
      // Uma entrada POR OCORRÊNCIA, cada uma com a sua data e o seu valor EFETIVO (respeita
      // overrides[dataOriginal].amount). Antes as ocorrências eram somadas numa linha só, com
      // um "(3×)" no rótulo — e aí a lista não tinha como ser ordenada por dia, porque uma
      // linha representava três dias diferentes.
      //
      // O valor sai de occEfetiva, não de uma divisão do total pelo número de ocorrências:
      // ratear daria número errado em toda série com override em alguma parcela.
      const doAgendamento = []
      let bruto = 0
      for (const { date: dt, amount: val } of occs) {
        const v = valorNoFluxoPrincipal(s, val, fluxo)
        if (v === 0) continue
        bruto += v
        doAgendamento.push({ description: s.description || '(agendamento)', amount: rb(v), date: dt })
      }
      if (doAgendamento.length === 0) continue
      // (X/N) contado sobre o que É EXIBIDO: ocorrência de valor nulo não entra na lista, e
      // incluí-la no denominador deixaria a série com um número que ninguém vê.
      doAgendamento.forEach((it, i) => {
        it.occurrenceNumber = i + 1
        it.totalOccurrences = doAgendamento.length
      })
      items.push(...doAgendamento)
      // `total` continua sendo rb() da soma BRUTA do agendamento inteiro, como antes.
      // Arredondar ocorrência a ocorrência e somar mudaria centavos no Saldo Final Ciclo —
      // que o card do Painel Geral também exibe. Aqui só a apresentação muda.
      total += rb(bruto)
    }
    // Cronológica. 'YYYY-MM-DD' ordena lexicograficamente; new Date(iso) interpretaria como
    // UTC e voltaria um dia no fuso do Brasil, bagunçando a ordem na virada do mês.
    items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    return { items, total: rb(total) }
  }
  const schedCiclo = collectSched(cycleEndStr)
  const saldoFinalCiclo = rb(saldoAtual + schedCiclo.total)

  // Envelopes do ciclo vinculados a contas do pool: restante (limite − gasto na competência).
  const competenciaKeyOf = (ds) => {
    const [y, m, dd] = ds.split('-').map(Number)
    let year = y, month0 = m - 1
    if (dd < startDay) { const p = new Date(y, m - 2, 1); year = p.getFullYear(); month0 = p.getMonth() }
    return year * 12 + month0
  }
  const currentComp = referenceDate.getDate() >= startDay
    ? referenceDate.getFullYear() * 12 + referenceDate.getMonth()
    : (() => { const p = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1); return p.getFullYear() * 12 + p.getMonth() })()
  const envItems = []
  let envTotal = 0
  for (const env of (envelopes || [])) {
    if (!poolIds.has(env.accountId)) continue
    let spent = 0
    for (const tx of transactions) {
      if (tx.type !== 'expense' || tx.reservaAuto || isReservaShadowOrigin(tx) || isPatrimonioOrigin(tx) || isInvestAutoOrigin(tx)) continue
      if (!env.categoryIds?.includes(tx.categoryId)) continue
      if (!tx.date || competenciaKeyOf(tx.date) !== currentComp) continue
      spent += tx.amount
    }
    const restante = Math.max(0, rb((env.limitAmount || 0) - spent))
    if (restante <= 0) continue
    envItems.push({ name: env.name || '(envelope)', restante: rb(restante) })
    envTotal += restante
  }
  envTotal = rb(envTotal)
  const saldoProjetado = rb(saldoFinalCiclo - envTotal)

  // Calendário (só modo custom).
  const saldoAtualCalendario = isCustom ? rb(saldoAtual + txAlemCiclo) : null
  const schedCal = isCustom ? collectSched(calendarEndStr) : { items: [], total: 0 }
  const saldoFinalCalendario = isCustom ? rb(saldoAtualCalendario + schedCal.total) : null

  return {
    mode, cycleStart: cycleStartStr, cycleEnd: cycleEndStr, calendarEnd: calendarEndStr,
    saldoAtual: { base: saldoBase, contas: contasBase, gerencialTransfers: rb(gerencialAteCiclo), total: saldoAtual },
    finalCiclo: { saldoAtual, agendamentos: schedCiclo.items, agendamentosTotal: schedCiclo.total, total: saldoFinalCiclo },
    projetado: { finalCiclo: saldoFinalCiclo, envelopes: envItems, envelopesTotal: envTotal, total: saldoProjetado },
    atualCalendario: isCustom ? { saldoAtual, lancamentos: itensAlemCiclo, lancamentosTotal: rb(txAlemCiclo), total: saldoAtualCalendario } : null,
    finalCalendario: isCustom ? { atualCalendario: saldoAtualCalendario, agendamentos: schedCal.items, agendamentosTotal: schedCal.total, total: saldoFinalCalendario } : null,
  }
}
