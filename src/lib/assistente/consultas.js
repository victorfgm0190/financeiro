// Assistente IA — regras PURAS das consultas 🟢 (o app calcula; a IA só escolhe os filtros).
// Os números vêm das mesmas funções das telas (ver src/components/Assistente/respostas.jsx).

const somaDias = (ymd, n) => {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const ddmm = (ymd) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`

// Período de vencimentos → { ini, fim, rotulo } (YYYY-MM-DD). Semana = segunda a domingo.
export function intervaloVencimento(periodo, hoje) {
  switch (periodo) {
    case 'atrasados': return { ini: '0000-01-01', fim: somaDias(hoje, -1), rotulo: 'em atraso' }
    case 'hoje': return { ini: hoje, fim: hoje, rotulo: 'hoje' }
    case 'amanha': { const d = somaDias(hoje, 1); return { ini: d, fim: d, rotulo: 'amanhã' } }
    case 'semana': {
      const dow = new Date(`${hoje}T12:00:00Z`).getUTCDay() // 0 = domingo
      const ini = somaDias(hoje, dow === 0 ? -6 : 1 - dow)
      const fim = somaDias(ini, 6)
      return { ini, fim, rotulo: `nesta semana (${ddmm(ini)} a ${ddmm(fim)})` }
    }
    case 'mes': {
      const ini = `${hoje.slice(0, 7)}-01`
      const d = new Date(`${ini}T12:00:00Z`)
      d.setUTCMonth(d.getUTCMonth() + 1)
      d.setUTCDate(0)
      return { ini, fim: d.toISOString().slice(0, 10), rotulo: 'neste mês' }
    }
    case 'proximos_30': return { ini: hoje, fim: somaDias(hoje, 29), rotulo: 'nos próximos 30 dias' }
    case 'proximos_7':
    default: return { ini: hoje, fim: somaDias(hoje, 6), rotulo: 'nos próximos 7 dias' }
  }
}

// Grupos da agenda (classificarAgendamento) → lado. Transferências ficam fora de pagar/receber.
const PAGAR = new Set(['despesa', 'fatura', 'aplicacao'])
const RECEBER = new Set(['receita', 'resgate'])
export const ladoDoGrupo = (grupo) => (PAGAR.has(grupo) ? 'pagar' : RECEBER.has(grupo) ? 'receber' : 'outro')

export function filtrarVencimentos(itens, tipo) {
  const lista = (itens || []).filter(i => tipo === 'todos' || ladoDoGrupo(i.grupo) === tipo)
  return [...lista].sort((a, b) => a.data.localeCompare(b.data) || b.amount - a.amount)
}

export function totaisVencimentos(itens) {
  let pagar = 0
  let receber = 0
  for (const i of itens || []) {
    if (ladoDoGrupo(i.grupo) === 'pagar') pagar += Number(i.amount) || 0
    else if (ladoDoGrupo(i.grupo) === 'receber') receber += Number(i.amount) || 0
  }
  return { pagar: Math.round(pagar * 100) / 100, receber: Math.round(receber * 100) / 100 }
}

// Gastos de uma categoria no resultado de despesasPorCategoria (0 quando não houve gasto).
export function gastoDaCategoria(resultado, categoryId) {
  const c = (resultado?.categorias || []).find(x => x.categoryId === categoryId)
  return { valor: c?.valor || 0, pct: c?.pct || 0, despesas: c?.despesas || [] }
}
