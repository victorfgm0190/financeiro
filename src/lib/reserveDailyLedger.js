// ── Razão diário das funções de reserva ──────────────────────────────────────
//
// Constrói, dia a dia, o histórico de cada função: movimentação do dia e saldo acumulado, mais o
// saldo da conta de reserva naquele dia. É a base de conferência da virada de saldo.
//
// Desde a virada assistida (06/11/2026) o razão é calculado no SERVIDOR, com os dados gravados no
// banco (api/_viradaReservaServidor.js): o saldo de cada função vem da fórmula única
// (src/lib/saldoReserva.js) e o saldo da conta vem dos lançamentos (initial_balance + efeitos até o
// dia, src/lib/saldos.js) — nada do navegador (o "Saldo Real" digitado em finup_reserve_balances
// não entra). Assim o razão é o mesmo em qualquer aparelho.

import { reserveMovOf, indexarReserva, saldoDaFuncao, round2 } from './saldoReserva.js'
import { efeitoNaConta } from './saldos.js'

export { reserveMovOf }

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

const MAX_BACKFILL_DAYS = 400

/**
 * Linhas do razão diário de TODAS as funções, de `rangeStart` até `today`.
 *
 * Cada linha: movimentação do dia (dentro do período vigente), saldo acumulado da função ao fim do
 * dia (fórmula única — viradas encadeadas reiniciam o saldo no saldo_inicial do período novo) e o
 * saldo da conta no dia. `desde` (opcional) limita as linhas gravadas sem mudar os valores.
 *
 * @returns { rows, rangeStart, rangeEnd, days }
 */
export function buildDailyLedgerRows({
  functions = [],
  periods = [],
  adjustments = [],
  transactions = [],
  accounts = [],
  today = localDateStr(new Date()),
  desde = null,
} = {}) {
  if (functions.length === 0) return { rows: [], rangeStart: null, rangeEnd: today, days: 0 }

  const idx = indexarReserva({ periods, adjustments, transactions })
  const accById = new Map(accounts.map(a => [a.id, a]))

  // Início de cada função: o primeiro período dela; sem nenhum, o primeiro lançamento vinculado
  // (é de onde a tela acumula, já que sem período o piso é 0001-01-01).
  const startOf = {}
  for (const f of functions) {
    const lista = idx.periodos.get(f.id)
    const primeiroTx = (idx.lancamentos.get(f.id) || []).reduce((m, t) => (!m || t.date < m ? t.date : m), null)
    startOf[f.id] = lista?.length ? lista[0].data_inicio : (primeiroTx || today)
  }

  // Janela: do início mais antigo até hoje, limitada a MAX_BACKFILL_DAYS (e ao `desde`, se veio).
  const floor = addDays(today, -MAX_BACKFILL_DAYS)
  let rangeStart = today
  for (const f of functions) if (startOf[f.id] < rangeStart) rangeStart = startOf[f.id]
  if (desde && desde > rangeStart) rangeStart = desde
  if (rangeStart < floor) rangeStart = floor
  if (rangeStart > today) rangeStart = today
  const days = eachDay(rangeStart, today)

  // Saldo da conta ao fim de cada dia, a partir dos lançamentos (initial_balance + efeitos com
  // data <= dia) — a mesma regra do balance (src/lib/saldos.js). Cartão fica de fora.
  const linkedAccIds = [...new Set(functions.map(f => f.accountId).filter(Boolean))]
  const saldoContaDia = {}
  for (const accId of linkedAccIds) {
    const acc = accById.get(accId)
    if (!acc || acc.type === 'credit' || acc.initialBalance === undefined) continue
    let base = Number(acc.initialBalance) || 0
    const efeitoDia = {}
    for (const tx of transactions) {
      const e = efeitoNaConta(tx, accId)
      if (!e || !tx.date) continue
      if (tx.date < rangeStart) base += e
      else efeitoDia[tx.date] = (efeitoDia[tx.date] || 0) + e
    }
    const serie = {}
    let corrente = base
    for (const d of days) {
      corrente += efeitoDia[d] || 0
      serie[d] = round2(corrente)
    }
    saldoContaDia[accId] = serie
  }

  // Movimentação do DIA por função (só dentro do período vigente no dia).
  const movDia = (f, d, inicio) => {
    let entrada = 0
    let saida = 0
    for (const tx of idx.lancamentos.get(f.id) || []) {
      if (tx.date !== d || d < inicio) continue
      const m = reserveMovOf(tx, f.accountId || null)
      entrada += m.entrada
      saida += m.saida
    }
    let ajuste = 0
    const ajs = idx.ajustes.get(f.id) || []
    for (const a of ajs) if (a.data === d && d >= inicio) ajuste += Number(a.valor) || 0
    if (!ajs.length && f.ajusteOverride && d.endsWith('-01') && d >= inicio) ajuste += Number(f.ajusteOverride[d.slice(0, 7)]?.valor) || 0
    return { entrada: round2(entrada), saida: round2(saida), ajuste: round2(ajuste) }
  }

  const rows = []
  for (const d of days) {
    for (const f of functions) {
      if (startOf[f.id] > d) continue
      const s = saldoDaFuncao(f, d, idx)
      const mov = movDia(f, d, s.inicio)
      const acumulado = round2(s.saldo)
      const real = f.accountId ? saldoContaDia[f.accountId]?.[d] : undefined
      rows.push({
        function_id: f.id,
        snapshot_date: d,
        account_id: f.accountId || null,
        periodo_id: s.periodoId,
        entrada_dia: mov.entrada,
        saida_dia: mov.saida,
        ajuste_dia: mov.ajuste,
        saldo_acumulado: acumulado,
        // Sem reescala (29/10): o Saldo Atualizado é o próprio saldo; a diferença para a conta é o
        // "saldo a distribuir", visível na tela e na prévia da virada.
        saldo_atualizado: acumulado,
        saldo_real_conta: real ?? null,
        fator_rateio: null,
        divergencia: 0,
        divergencia_pct: acumulado !== 0 ? clampPct(0) : null,
      })
    }
  }

  return { rows, rangeStart, rangeEnd: today, days: days.length }
}
