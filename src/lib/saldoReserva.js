// ── Saldo de uma função de reserva — FÓRMULA ÚNICA ──────────────────────────────────────────────
// Saldo(até D) = Saldo Inicial + Entradas − Saídas + Ajuste + Rendimentos, contando do início do
// período vigente em D (reserve_periods de data_inicio mais recente <= D) até D, inclusive.
// Nada com data posterior a D entra (ajuste futuro não mexe no saldo antes da data).
// Usada pelo Resumo (D = hoje), Razão Diário (D = cada dia), rateio de rendimentos (D = data do
// rendimento), prévia e virada (D = último dia do mês financeiro). Pura: roda na tela e no servidor.
//
// Precisão: o saldo inicial pode ter mais de 2 casas (ex.: 361,6667 de um rateio antigo); o saldo
// é devolvido sem arredondar a centavo, para que a SOMA das funções feche com a conta (arredonde
// só ao exibir ou ao somar: round2(Σ saldo)). Entradas, saídas, ajustes e rendimentos são
// valores em centavos e saem arredondados a 2 casas.

export const INICIO_SEM_PERIODO = '0001-01-01'

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const round6 = (n) => Math.round((Number(n) || 0) * 1e6) / 1e6
const dia = (v) => (v ? String(v).slice(0, 10) : '')

// Classificação de um lançamento como movimento de reserva. reservaAccId = conta da função.
//   • receita NA conta da reserva            → entrada
//   • transferência ENTRANDO na conta        → entrada (depósito)
//   • transferência SAINDO da conta          → saída  (resgate)
//   • despesa (cartão ou não) vinculada      → nada: é provisão/justificativa, não movimento
export function reserveMovOf(tx, reservaAccId) {
  const amount = Number(tx.amount) || 0
  if (tx.type === 'income' && tx.accountId === reservaAccId) return { entrada: amount, saida: 0 }
  if (tx.type === 'transfer') {
    if (tx.toAccountId === reservaAccId) return { entrada: amount, saida: 0 }
    if (tx.accountId === reservaAccId) return { entrada: 0, saida: amount }
  }
  return { entrada: 0, saida: 0 }
}

// Ajuste vindo do rateio de um rendimento (coluna "Rendimentos", fora da coluna "Ajuste").
export const ehAjusteDeRendimento = (a) => !!a?.lancamento_id

// Índice por função (uma passada só sobre cada lista) — evita O(funções × lançamentos) por dia.
export function indexarReserva({ periods = [], adjustments = [], transactions = [] } = {}) {
  const periodos = new Map()
  for (const p of periods || []) {
    if (!p?.function_id || !p.data_inicio) continue
    const item = { ...p, data_inicio: dia(p.data_inicio) }
    if (!periodos.has(p.function_id)) periodos.set(p.function_id, [])
    periodos.get(p.function_id).push(item)
  }
  for (const lista of periodos.values()) lista.sort((a, b) => (a.data_inicio < b.data_inicio ? -1 : a.data_inicio > b.data_inicio ? 1 : 0))
  const ajustes = new Map()
  for (const a of adjustments || []) {
    if (!a?.function_id || !a.data) continue
    if (!ajustes.has(a.function_id)) ajustes.set(a.function_id, [])
    ajustes.get(a.function_id).push({ ...a, data: dia(a.data) })
  }
  const lancamentos = new Map()
  for (const t of transactions || []) {
    if (!t?.reservaFuncaoId || !t.date) continue
    if (!lancamentos.has(t.reservaFuncaoId)) lancamentos.set(t.reservaFuncaoId, [])
    lancamentos.get(t.reservaFuncaoId).push(t)
  }
  return { periodos, ajustes, lancamentos }
}

// Período vigente na data (último com data_inicio <= data), ou null.
export function periodoVigente(lista, data) {
  let achado = null
  for (const p of lista || []) {
    if (p.data_inicio <= data) achado = p
    else break
  }
  return achado
}

// Componentes do saldo da função até `ate` (inclusive). `idx` = indexarReserva(...).
// opts.ignorarLancamentoId: deixa de fora os ajustes de um rendimento (refazer o rateio dele).
export function saldoDaFuncao(fn, ate, idx, { ignorarLancamentoId = null } = {}) {
  const per = periodoVigente(idx.periodos.get(fn.id), ate)
  const inicio = per ? per.data_inicio : INICIO_SEM_PERIODO
  const saldoInicial = per ? (Number(per.saldo_inicial) || 0) : (Number(fn.saldoInicial) || 0)
  const conta = fn.accountId || null
  let entradas = 0
  let saidas = 0
  for (const tx of idx.lancamentos.get(fn.id) || []) {
    if (tx.date < inicio || tx.date > ate) continue
    const m = reserveMovOf(tx, conta)
    entradas += m.entrada
    saidas += m.saida
  }
  let ajuste = 0
  let rendimentos = 0
  const ajs = idx.ajustes.get(fn.id) || []
  if (ajs.length > 0) {
    for (const a of ajs) {
      if (a.data < inicio || a.data > ate) continue
      if (ignorarLancamentoId && a.lancamento_id === ignorarLancamentoId) continue
      if (ehAjusteDeRendimento(a)) rendimentos += Number(a.valor) || 0
      else ajuste += Number(a.valor) || 0
    }
  } else if (fn.ajusteOverride && typeof fn.ajusteOverride === 'object') {
    // Legado: ajuste_override { 'YYYY-MM': { valor } } de funções sem nenhum registro em
    // reserve_adjustments. Só tem mês: vale a partir do dia 1º dele.
    for (const [mes, item] of Object.entries(fn.ajusteOverride)) {
      const d = `${mes}-01`
      if (!/^\d{4}-\d{2}-01$/.test(d) || d < inicio || d > ate) continue
      ajuste += Number(item?.valor) || 0
    }
  }
  entradas = round2(entradas)
  saidas = round2(saidas)
  ajuste = round2(ajuste)
  rendimentos = round2(rendimentos)
  return {
    functionId: fn.id,
    inicio,
    periodoId: per?.id ?? null,
    saldoInicial,
    entradas,
    saidas,
    ajuste,
    rendimentos,
    saldo: round6(saldoInicial + entradas - saidas + ajuste + rendimentos),
  }
}

// Atalho para quem tem as listas soltas (sem índice pronto).
export function saldosDasFuncoes({ functions = [], periods, adjustments, transactions, ate, ignorarLancamentoId = null }) {
  const idx = indexarReserva({ periods, adjustments, transactions })
  return (functions || []).map(f => saldoDaFuncao(f, ate, idx, { ignorarLancamentoId }))
}

// Soma de saldos sem arredondar linha a linha (o total fecha com a conta).
export const somaSaldos = (itens) => round2((itens || []).reduce((s, x) => s + (Number(x?.saldo ?? x) || 0), 0))
