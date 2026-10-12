// Despesas por categoria — fonte ÚNICA de "Maiores Despesas" (pizza), "Ranking por Categoria" e da
// lista do clique (CategoriaLancamentos). Os três chamam esta função com o mesmo período e modo,
// então o total da lista é sempre o valor do bloco.
//
// modo:
//   'cheio'   → soma das despesas da categoria, sem descontar resgate de reserva (bate com o KPI
//               "Despesas do Mês").
//   'liquido' → despesa menos o resgate de reserva (receita de compensação, perna _r) da mesma
//               categoria — a regra que a pizza usava.
// Despesas sem categoria viram a categoria SEM_CATEGORIA_ID ("Sem categoria").
// Base do % (`base`) — as fatias somam sempre 100%:
//   'cheio'   → total de despesas do período (= KPI).
//   'liquido' → total líquido do período (despesas − resgates de reserva), somando só as
//               categorias com líquido > 0 (as que aparecem).
import { addDays } from 'date-fns'
import { isInvestAutoOrigin } from './origins.js'
import { periodoStr } from './receitasDespesas.js'

export const SEM_CATEGORIA_ID = '__sem_categoria'

export const MODOS_DESPESA = ['cheio', 'liquido']
export const MODO_DESPESA_PADRAO = 'cheio'

// Opções dos seletores dos blocos (Painel e mobile).
export const PERIOD_OPTS = [
  { value: 'current', label: 'Mês atual' },
  { value: 'prev', label: 'Mês anterior' },
  { value: '3m', label: 'Últimos 3m' },
]
export const MODO_OPTS = [
  { value: 'cheio', label: 'Cheio', title: 'Soma as despesas sem descontar resgate de reserva (bate com Despesas do Mês)' },
  { value: 'liquido', label: 'Líquido', title: 'Despesa menos o resgate de reserva da mesma categoria' },
]

const r2 = (n) => Math.round(n * 100) / 100

// transactions: lançamentos do perfil (relatório). periodo: { start, end } 'YYYY-MM-DD'.
// cls: { isExpenseTx, isResgateReservaSombra } — a mesma classificação do KPI.
// → { categorias: [{ categoryId, cheio, resgate, liquido, valor, pct, despesas, resgates }],
//     totalDespesas, base }  (categorias com valor > 0, ordenadas por valor desc; base = do %)
export function despesasPorCategoria(transactions, periodo, cls, modo = MODO_DESPESA_PADRAO) {
  const { isExpenseTx, isResgateReservaSombra } = cls
  const noPeriodo = (tx) => tx.date >= periodo.start && tx.date <= periodo.end && !isInvestAutoOrigin(tx)
  const porCat = new Map()
  let totalDespesas = 0

  for (const tx of transactions || []) {
    if (!noPeriodo(tx) || !isExpenseTx(tx)) continue
    totalDespesas += tx.amount
    const id = tx.categoryId || SEM_CATEGORIA_ID
    let c = porCat.get(id)
    if (!c) porCat.set(id, (c = { categoryId: id, cheio: 0, resgate: 0, despesas: [], resgates: [] }))
    c.cheio += tx.amount
    c.despesas.push(tx)
  }
  // Resgate de reserva: só em categoria que tem despesa no período.
  for (const tx of transactions || []) {
    if (!noPeriodo(tx) || tx.type !== 'income' || !isResgateReservaSombra(tx)) continue
    const c = porCat.get(tx.categoryId || SEM_CATEGORIA_ID)
    if (!c) continue
    c.resgate += tx.amount
    c.resgates.push(tx)
  }

  totalDespesas = r2(totalDespesas)
  const categorias = [...porCat.values()]
    .map(c => {
      const cheio = r2(c.cheio)
      const resgate = r2(c.resgate)
      const liquido = r2(cheio - resgate)
      return { ...c, cheio, resgate, liquido, valor: modo === 'liquido' ? liquido : cheio }
    })
    .filter(c => c.valor > 0)
    .sort((a, b) => b.valor - a.valor)
  const base = modo === 'liquido' ? r2(categorias.reduce((s, c) => s + c.valor, 0)) : totalDespesas
  for (const c of categorias) c.pct = base > 0 ? (c.valor / base) * 100 : 0
  return { categorias, totalDespesas, base }
}

// ── Top N + "Outras" e cores ──────────────────────────────────────────────────────────────────
// Pizza: as 6 maiores + "Outras (N)". Legenda e ranking: as 5 primeiras + "Ver todas (N)".
export const FATIAS_PIZZA = 6
export const TOP_CATEGORIAS = 5
export const OUTRAS_ID = '__outras'
export const COR_OUTRAS = '#6b7280'
export const COR_SEM_CATEGORIA = '#4b5563'
// Cores das 6 fatias da pizza (as de sempre); as demais saem de corDaCategoria.
export const CORES_TOP = ['#6366f1', '#f97316', '#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b']

// Modo fechado: as N maiores + uma fatia "Outras" com a soma do resto (membros = as categorias
// dentro dela, já ordenadas). Com N categorias ou menos não há "Outras". A soma das fatias é
// sempre a soma de todas as categorias (a pizza representa 100% do que ela mostra).
// Sem `n` (modo "Ver todas"): todas as categorias, sem "Outras".
// base: a base do % (despesasPorCategoria(...).base).
export function agruparTopN(categorias, base, n = TOP_CATEGORIAS) {
  const lista = categorias || []
  if (n == null || lista.length <= n) return { fatias: lista, outras: null }
  const membros = lista.slice(n)
  const valor = r2(membros.reduce((s, c) => s + c.valor, 0))
  const outras = {
    categoryId: OUTRAS_ID,
    outras: true,
    valor,
    pct: base > 0 ? (valor / base) * 100 : 0,
    membros,
  }
  return { fatias: [...lista.slice(0, n), outras], outras }
}

// Os três recortes dos blocos a partir de UM resultado de despesasPorCategoria — pizza, legenda
// e ranking nunca recalculam nada, então o valor de uma categoria é o mesmo nos três.
//   pizza   → 6 maiores + "Outras" (agruparTopN)
//   lista   → legenda e ranking: 5 primeiras, ou todas (`todas`), em ordem de valor desc
export function montarBlocos(categorias, base, todas = false) {
  const lista = categorias || []
  return {
    pizza: agruparTopN(lista, base, FATIAS_PIZZA),
    lista: todas ? lista : lista.slice(0, TOP_CATEGORIAS),
    total: lista.length,
  }
}

// Cor: "Outras" → cinza; "Sem categoria" → cinza escuro; posição < 6 → cor fixa da pizza; demais →
// tom determinístico pelo id da categoria (mesma categoria = mesma cor em qualquer tela).
export function corDaCategoria(categoryId, indice) {
  if (categoryId === OUTRAS_ID) return COR_OUTRAS
  if (categoryId === SEM_CATEGORIA_ID) return COR_SEM_CATEGORIA
  if (indice != null && indice < CORES_TOP.length) return CORES_TOP[indice]
  let h = 0
  for (const ch of String(categoryId)) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return `hsl(${h % 360}, 55%, ${48 + (h % 3) * 6}%)`
}

// Filtro de período dos blocos → { start, end } em MESES FINANCEIROS (getFinancialPeriod do
// AppContext): 'current' = mês atual, 'prev' = mês anterior, '3m' = os 3 últimos (inclui o atual).
export function periodoDoFiltro(filtro, getFinancialPeriod) {
  const atual = getFinancialPeriod()
  if (filtro === 'current' || !filtro) return periodoStr(atual)
  const anterior = getFinancialPeriod(addDays(atual.start, -1))
  if (filtro === 'prev') return periodoStr(anterior)
  const retrasado = getFinancialPeriod(addDays(anterior.start, -1))
  return periodoStr({ start: retrasado.start, end: atual.end })
}
