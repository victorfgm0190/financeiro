// Filtro por TIPO da tela Agendamentos (Todos · Entradas · Saídas · Transferências). Soma com os
// demais filtros: recorta a lista que eles já produziram. Lembrado por aparelho (localStorage).
// Item: agendamento (transactionType), linha paga (transactionType) ou fatura a pagar (sempre saída).
// "Pagamentos de cartão" (critério único de src/lib/rotuloMovimento.js) é um tipo À PARTE na tela:
// o pagamento de fatura conta e aparece SÓ nele — não em "Transferências" nem em "Saídas" (a fatura a
// pagar da aba Cartão). Só exibição: por dentro ele continua transferência (saldos e totais iguais).
import { ehPagamentoDeCartao } from './rotuloMovimento.js'

export const TIPOS_AGENDAMENTO = [
  { id: 'todos', label: 'Todos' },
  { id: 'entradas', label: 'Entradas' },
  { id: 'saidas', label: 'Saídas' },
  { id: 'transferencias', label: 'Transferências' },
  { id: 'pagamentos_cartao', label: 'Pagamentos de cartão' },
]
const IDS = new Set(TIPOS_AGENDAMENTO.map(t => t.id))
const CHAVE = 'finup:agendamentos:tipo'

export function tipoDoItem(item) {
  const t = item?.transactionType ?? item?.type
  if (t === 'income') return 'entradas'
  if (t === 'transfer' || t === 'credit_payment') return 'transferencias'
  return 'saidas'
}

// Pagamento de fatura? Linha paga (aba Pagos) olha o agendamento dela.
// Fatura a pagar do contas_a_pagar (aba Cartão: cartaoId + mesAno) também é pagamento de cartão.
export const itemEhPagamentoCartao = (item, contas) =>
  !!(item?.cartaoId && item?.mesAno && !item.transactionType)
  || !!item?.pagamentoCartao
  || ehPagamentoDeCartao(item?.schedule && !item.toAccountId ? item.schedule : item, contas)

// Tipo mostrado na tela: pagamento de cartão primeiro; senão o tipo do movimento.
export const tipoNaTela = (item, tipoDe = tipoDoItem, contas = []) => (itemEhPagamentoCartao(item, contas) ? 'pagamentos_cartao' : tipoDe(item))

export const filtrarPorTipo = (lista, tipo, tipoDe = tipoDoItem, contas = []) => {
  if (!tipo || tipo === 'todos') return lista || []
  return (lista || []).filter(i => tipoNaTela(i, tipoDe, contas) === tipo)
}

// { todos, entradas, saidas, transferencias, pagamentos_cartao } sobre a lista JÁ filtrada pelos
// outros filtros. Cada item conta num tipo só; a soma dos tipos é o todos.
export function contarPorTipo(lista, tipoDe = tipoDoItem, contas = []) {
  const c = { todos: 0, entradas: 0, saidas: 0, transferencias: 0, pagamentos_cartao: 0 }
  for (const i of lista || []) {
    c.todos++
    c[tipoNaTela(i, tipoDe, contas)]++
  }
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
  pagamentos_cartao: 'Agendamentos (pagamentos de cartão)',
}
export const ARQUIVO_TIPO = {
  todos: 'a-pagar-e-receber',
  entradas: 'a-receber',
  saidas: 'a-pagar',
  transferencias: 'transferencias',
  pagamentos_cartao: 'pagamentos-de-cartao',
}
