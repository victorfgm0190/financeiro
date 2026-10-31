// Filtro por TIPO da tela Agendamentos (Todos · Entradas · Saídas · Transferências). Soma com os
// demais filtros: recorta a lista que eles já produziram. Lembrado por aparelho (localStorage).
// Item: agendamento (transactionType), linha paga (transactionType) ou fatura a pagar (sempre saída).

export const TIPOS_AGENDAMENTO = [
  { id: 'todos', label: 'Todos' },
  { id: 'entradas', label: 'Entradas' },
  { id: 'saidas', label: 'Saídas' },
  { id: 'transferencias', label: 'Transferências' },
]
const IDS = new Set(TIPOS_AGENDAMENTO.map(t => t.id))
const CHAVE = 'finup:agendamentos:tipo'

export function tipoDoItem(item) {
  const t = item?.transactionType ?? item?.type
  if (t === 'income') return 'entradas'
  if (t === 'transfer' || t === 'credit_payment') return 'transferencias'
  return 'saidas'
}

export const filtrarPorTipo = (lista, tipo, tipoDe = tipoDoItem) =>
  (!tipo || tipo === 'todos') ? (lista || []) : (lista || []).filter(i => tipoDe(i) === tipo)

// { todos, entradas, saidas, transferencias } sobre a lista JÁ filtrada pelos outros filtros.
export function contarPorTipo(lista, tipoDe = tipoDoItem) {
  const c = { todos: 0, entradas: 0, saidas: 0, transferencias: 0 }
  for (const i of lista || []) { c.todos++; c[tipoDe(i)]++ }
  return c
}

export function lerTipoAgendamento() {
  try {
    const v = globalThis.localStorage?.getItem(CHAVE)
    return IDS.has(v) ? v : 'todos'
  } catch {
    return 'todos'
  }
}
export function salvarTipoAgendamento(tipo) {
  try { globalThis.localStorage?.setItem(CHAVE, IDS.has(tipo) ? tipo : 'todos') } catch { /* sem armazenamento: só não lembra */ }
}

// Relatório exportado: título e trecho do nome do arquivo conforme o tipo.
export const TITULO_RELATORIO_TIPO = {
  todos: 'Agendamentos (a pagar e a receber)',
  entradas: 'Agendamentos (a receber)',
  saidas: 'Agendamentos (a pagar)',
  transferencias: 'Agendamentos (transferências)',
}
export const ARQUIVO_TIPO = {
  todos: 'a-pagar-e-receber',
  entradas: 'a-receber',
  saidas: 'a-pagar',
  transferencias: 'transferencias',
}
