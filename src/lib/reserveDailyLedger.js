// ── Razão diário das funções de reserva ──────────────────────────────────────
//
// Constrói, dia a dia, o histórico de cada função: movimentação do dia, saldo acumulado
// e Saldo Atualizado (saldo rateado pelo saldo real da conta). É o que permite uma virada
// retroativa saber qual era o Saldo Atualizado numa data passada — a tela só sabe o de hoje.
//
// POR QUE ISSO RODA NO CLIENTE, e não numa serverless que lê o banco:
//   1. Entradas/Saídas não são colunas: saem dos lançamentos, filtrados pela janela do
//      período ativo e pelas regras de reserva (receita NA conta / transferência entrando
//      ou saindo; despesa de cartão é provisão, não movimento). Só o app conhece a regra.
//   2. entradas_override/saidas_override ainda existem no banco mas são IGNORADAS pela tela
//      desde a Etapa 2 — recalcular por elas devolveria números diferentes dos exibidos.
//   3. O saldo real da conta pode vir de um override em localStorage ('finup_reserve_balances'),
//      que o servidor não tem como ler.
// Logo: o cliente calcula com a MESMA fórmula da tela e grava; o servidor só persiste.

const round2 = (n) => Math.round(n * 100) / 100

// Percentual dentro do que NUMERIC(9,4) aceita (±99999,9999).
const clampPct = (n) => {
  const v = Math.round(n * 1e4) / 1e4
  if (!Number.isFinite(v)) return null
  return Math.max(-99999.9999, Math.min(99999.9999, v))
}

// Data local 'YYYY-MM-DD' (evita o shift de fuso do toISOString).
export function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return localDateStr(new Date(y, m - 1, d + n))
}

function eachDay(startStr, endStr) {
  const out = []
  let cur = startStr
  // Guarda dura: nunca mais que ~3 anos de dias, mesmo com datas malformadas.
  for (let i = 0; cur <= endStr && i < 1200; i++) {
    out.push(cur)
    cur = addDays(cur, 1)
  }
  return out
}

// Classificação de um lançamento como movimento de reserva. Fonte ÚNICA da regra — usada
// tanto pelo cálculo de Entradas/Saídas da tela quanto por este razão diário, para os dois
// nunca divergirem. reservaAccId = conta vinculada à função do lançamento.
//   • receita NA conta da reserva            → entrada
//   • transferência ENTRANDO na conta        → entrada (depósito)
//   • transferência SAINDO da conta          → saída  (resgate)
//   • despesa (cartão) vinculada à função    → nada: é provisão/justificativa, não movimento
export function reserveMovOf(tx, reservaAccId) {
  if (tx.type === 'income' && tx.accountId === reservaAccId) return { entrada: tx.amount, saida: 0 }
  if (tx.type === 'transfer') {
    if (tx.toAccountId === reservaAccId) return { entrada: tx.amount, saida: 0 }
    if (tx.accountId === reservaAccId) return { entrada: 0, saida: tx.amount }
  }
  return { entrada: 0, saida: 0 }
}

// Efeito de um lançamento sobre o saldo de uma conta comum (não-cartão). Mesma regra que o
// AppContext aplica ao mutar contas.balance — usada para reconstruir o saldo real da conta
// em datas passadas, andando para trás a partir do saldo de hoje.
function accountEffect(tx, accId) {
  if (tx.type === 'income' && tx.accountId === accId) return tx.amount
  if (tx.type === 'expense' && tx.accountId === accId) return -tx.amount
  if (tx.type === 'transfer') {
    if (tx.toAccountId === accId) return tx.amount
    if (tx.accountId === accId) return -tx.amount
  }
  return 0
}

// Período ativo de cada função = registro de data_inicio MAIS RECENTE.
export function activePeriodByFunction(periods) {
  const m = {}
  for (const p of (periods || [])) {
    if (!p.data_inicio) continue
    const cur = m[p.function_id]
    if (!cur || p.data_inicio > cur.data_inicio) m[p.function_id] = p
  }
  return m
}

// Todos os períodos de cada função, em ordem crescente de data_inicio. O razão precisa do
// histórico COMPLETO, não só do ativo: num dia passado vale o período vigente NAQUELE dia.
// É isso que faz viradas encadeadas se acumularem certo — cada corte reinicia o saldo a
// partir do seu próprio saldo_inicial, sem contaminar os dias do período anterior.
function periodsByFunction(periods) {
  const m = {}
  for (const p of (periods || [])) {
    if (!p.data_inicio || !p.function_id) continue
    ;(m[p.function_id] = m[p.function_id] || []).push(p)
  }
  for (const list of Object.values(m)) list.sort((a, b) => (a.data_inicio < b.data_inicio ? -1 : 1))
  return m
}

// Último período com data_inicio <= d (o vigente no dia d), ou null.
function periodAt(list, d) {
  let found = null
  for (const p of (list || [])) {
    if (p.data_inicio <= d) found = p
    else break
  }
  return found
}

const MAX_BACKFILL_DAYS = 400

/**
 * Monta as linhas do razão diário de TODAS as funções, de `rangeStart` até hoje.
 *
 * O saldo acumulado do primeiro dia emitido já inclui tudo que veio antes dele (o saldo
 * é semeado com saldo_inicial + movimentos anteriores à janela), então recortar a janela
 * não distorce os valores — só limita quantas linhas são gravadas.
 *
 * @returns { rows, rangeStart, rangeEnd, days }
 */
export function buildDailyLedgerRows({
  functions = [],
  periods = [],
  adjustments = [],
  transactions = [],
  accounts = [],
  accountBalances = {},
  today = localDateStr(new Date()),
} = {}) {
  if (functions.length === 0) return { rows: [], rangeStart: null, rangeEnd: today, days: 0 }

  const periodsOf = periodsByFunction(periods)
  const accById = new Map(accounts.map(a => [a.id, a]))

  // ── Início efetivo de cada função ──────────────────────────────────────────
  // Com períodos: a data_inicio do PRIMEIRO deles (o razão cobre a era em que houve
  // viradas). Sem nenhum: a data do primeiro lançamento vinculado — é de onde a tela
  // acumula, já que sem período ela usa '0001-01-01' como piso.
  const firstTxOf = {}
  for (const tx of transactions) {
    const fid = tx.reservaFuncaoId
    if (!fid || !tx.date) continue
    if (!firstTxOf[fid] || tx.date < firstTxOf[fid]) firstTxOf[fid] = tx.date
  }
  const startOf = {}
  for (const f of functions) {
    const list = periodsOf[f.id]
    startOf[f.id] = list?.length ? list[0].data_inicio : (firstTxOf[f.id] || today)
  }

  // Janela global: do início mais antigo até hoje, limitada a MAX_BACKFILL_DAYS.
  const floor = addDays(today, -MAX_BACKFILL_DAYS)
  let rangeStart = today
  for (const f of functions) if (startOf[f.id] < rangeStart) rangeStart = startOf[f.id]
  if (rangeStart < floor) rangeStart = floor
  if (rangeStart > today) rangeStart = today
  const days = eachDay(rangeStart, today)

  // ── Movimentos e ajustes por função e por dia ──────────────────────────────
  const movByFnDay = {}   // fid → date → { entrada, saida }
  for (const tx of transactions) {
    const fid = tx.reservaFuncaoId
    if (!fid || !startOf[fid] || !tx.date) continue
    if (tx.date < startOf[fid] || tx.date > today) continue
    const fn = functions.find(f => f.id === fid)
    if (!fn) continue
    const { entrada, saida } = reserveMovOf(tx, fn.accountId || null)
    if (entrada === 0 && saida === 0) continue
    const byDay = (movByFnDay[fid] = movByFnDay[fid] || {})
    const slot = (byDay[tx.date] = byDay[tx.date] || { entrada: 0, saida: 0 })
    slot.entrada += entrada
    slot.saida += saida
  }

  const adjByFnDay = {}   // fid → date → valor
  const hasAdj = {}
  for (const a of (adjustments || [])) {
    if (!a.function_id || !a.data) continue
    hasAdj[a.function_id] = true
    if (a.data < (startOf[a.function_id] || today) || a.data > today) continue
    const byDay = (adjByFnDay[a.function_id] = adjByFnDay[a.function_id] || {})
    byDay[a.data] = (byDay[a.data] || 0) + (Number(a.valor) || 0)
  }
  // Fallback legado: funções SEM nenhum registro em reserve_adjustments ainda podem ter o
  // ajuste_override JSONB { 'YYYY-MM': { valor } }. Ele não tem dia, só mês — atribuímos ao
  // dia 1º do mês, a única informação de data que o registro carrega.
  for (const f of functions) {
    if (hasAdj[f.id] || !f.ajusteOverride) continue
    for (const [monthKey, item] of Object.entries(f.ajusteOverride)) {
      const valor = Number(item?.valor) || 0
      if (!valor) continue
      const day = `${monthKey}-01`
      if (day < (startOf[f.id] || today) || day > today) continue
      const byDay = (adjByFnDay[f.id] = adjByFnDay[f.id] || {})
      byDay[day] = (byDay[day] || 0) + valor
    }
  }

  // ── Saldo real de cada conta, dia a dia (caminhando para trás a partir de hoje) ──
  // saldoReal(d) = saldoReal(hoje) − Σ efeito dos lançamentos da conta com data > d.
  // Cartões ficam de fora: o balance deles é dívida, com regra própria (fatura), e conta
  // de reserva nunca é cartão. Sem saldo real → sem rateio (fator null).
  const linkedAccIds = [...new Set(functions.map(f => f.accountId).filter(Boolean))]
  const saldoRealByAccDay = {}
  for (const accId of linkedAccIds) {
    const acc = accById.get(accId)
    if (!acc || acc.type === 'credit') continue
    const hoje = accountBalances[accId] !== undefined ? Number(accountBalances[accId]) : (Number(acc.balance) || 0)
    // Efeito por dia, só dos lançamentos da conta dentro (ou depois) da janela.
    const effByDay = {}
    for (const tx of transactions) {
      if (!tx.date || tx.date <= rangeStart) continue
      const e = accountEffect(tx, accId)
      if (e !== 0) effByDay[tx.date] = (effByDay[tx.date] || 0) + e
    }
    const series = {}
    let running = hoje
    for (let i = days.length - 1; i >= 0; i--) {
      const d = days[i]
      series[d] = round2(running)          // saldo ao FIM do dia d
      running -= (effByDay[d] || 0)        // remove o dia d → saldo ao fim de d-1
    }
    saldoRealByAccDay[accId] = series
  }

  // ── Varredura dia a dia ────────────────────────────────────────────────────
  // Saldo acumulado corrente por função. Semente = saldo_inicial do período vigente no
  // primeiro dia da janela, mais os movimentos entre o início desse período e a janela —
  // assim recortar a janela limita quantas linhas são gravadas, mas não muda os valores.
  const saldo = {}
  for (const f of functions) {
    const p0 = periodAt(periodsOf[f.id], rangeStart)
    const desde = p0 ? p0.data_inicio : (startOf[f.id] || rangeStart)
    let base = p0 ? (Number(p0.saldo_inicial) || 0) : (Number(f.saldoInicial) || 0)
    for (const [d, m] of Object.entries(movByFnDay[f.id] || {})) {
      if (d >= desde && d < rangeStart) base += m.entrada - m.saida
    }
    for (const [d, v] of Object.entries(adjByFnDay[f.id] || {})) {
      if (d >= desde && d < rangeStart) base += v
    }
    saldo[f.id] = round2(base)
  }

  const byAccount = {}
  for (const f of functions) {
    if (!f.accountId) continue
    ;(byAccount[f.accountId] = byAccount[f.accountId] || []).push(f)
  }

  // Índice dos dias em que cada função abre um período novo → naquele dia o saldo REINICIA
  // no saldo_inicial da virada, antes de aplicar a movimentação do próprio dia (a tela
  // acumula entradas/saídas a partir de data_inicio, inclusive).
  const resetOf = {}
  for (const [fid, list] of Object.entries(periodsOf)) {
    for (const p of list) {
      if (p.data_inicio > rangeStart && p.data_inicio <= today) {
        (resetOf[fid] = resetOf[fid] || {})[p.data_inicio] = { saldo: Number(p.saldo_inicial) || 0, id: p.id || null }
      }
    }
  }

  // Período vigente por função, atualizado a cada reinício — vai no periodo_id da linha.
  const curPeriodId = {}
  for (const f of functions) curPeriodId[f.id] = periodAt(periodsOf[f.id], rangeStart)?.id || null

  const rows = []
  for (const d of days) {
    // 1. Aplica a movimentação do dia ao saldo acumulado de cada função.
    const movToday = {}
    for (const f of functions) {
      const reinicio = resetOf[f.id]?.[d]
      if (reinicio !== undefined) {
        saldo[f.id] = round2(reinicio.saldo)
        curPeriodId[f.id] = reinicio.id
      }
      const m = (movByFnDay[f.id] || {})[d] || { entrada: 0, saida: 0 }
      const a = (adjByFnDay[f.id] || {})[d] || 0
      const entrada = round2(m.entrada)
      const saida = round2(m.saida)
      movToday[f.id] = { entrada, saida, ajuste: round2(a) }
      saldo[f.id] = round2((saldo[f.id] || 0) + entrada - saida + a)
    }

    // 2. Rateio por conta — MESMA fórmula do ReservasPanel (saldosAtualizados).
    const atualizado = {}
    const fatorOf = {}
    const realOf = {}
    for (const [accId, fns] of Object.entries(byAccount)) {
      const ativos = fns.filter(f => startOf[f.id] <= d)
      const totalSaldo = ativos.reduce((s, f) => s + (saldo[f.id] || 0), 0)
      const serie = saldoRealByAccDay[accId]
      const saldoReal = serie ? serie[d] : undefined
      for (const f of ativos) {
        if (saldoReal === undefined) { atualizado[f.id] = saldo[f.id]; continue }
        realOf[f.id] = saldoReal
        fatorOf[f.id] = totalSaldo === 0 ? 0 : saldoReal / totalSaldo
        atualizado[f.id] = totalSaldo === 0
          ? 0
          : round2((saldo[f.id] || 0) * (saldoReal / totalSaldo))
      }
    }

    // 3. Emite uma linha por função já iniciada.
    for (const f of functions) {
      if (startOf[f.id] > d) continue
      const acumulado = saldo[f.id] || 0
      const atual = f.accountId ? (atualizado[f.id] ?? acumulado) : acumulado
      const divergencia = round2(atual - acumulado)
      rows.push({
        function_id: f.id,
        snapshot_date: d,
        account_id: f.accountId || null,
        periodo_id: curPeriodId[f.id] || null,
        entrada_dia: movToday[f.id].entrada,
        saida_dia: movToday[f.id].saida,
        ajuste_dia: movToday[f.id].ajuste,
        saldo_acumulado: acumulado,
        saldo_atualizado: atual,
        saldo_real_conta: realOf[f.id] ?? null,
        fator_rateio: fatorOf[f.id] != null ? Math.round(fatorOf[f.id] * 1e8) / 1e8 : null,
        divergencia,
        // NUMERIC(9,4) → |valor| < 100000. Um saldo perto de zero produz percentual enorme;
        // sem o clamp um único dia estouraria o INSERT do lote inteiro.
        divergencia_pct: acumulado !== 0 ? clampPct((divergencia / acumulado) * 100) : null,
      })
    }
  }

  return { rows, rangeStart, rangeEnd: today, days: days.length }
}
