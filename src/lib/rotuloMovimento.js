// RÓTULO do tipo de um movimento (lançamento ou agendamento) — fonte ÚNICA para todas as telas.
// SÓ EXIBIÇÃO: o pagamento de fatura de cartão continua sendo uma TRANSFERÊNCIA por dentro (mesmo
// type no banco, mesmos saldos, fatura, Saldo Principal, Fluxo, relatórios e totais). Ele não é
// despesa: as compras já contaram como despesa quando entraram no cartão.
//
// Como o Finup já reconhece um pagamento de fatura (as três regras existentes):
//   1. transferência cujo DESTINO é um cartão de crédito (toAccountId → conta type 'credit') — a forma
//      atual (Pagar fatura, agendamento manual "transferência para o cartão"; em geral com
//      faturaMonthYear) e a mais confiável: só existe transferência para cartão para pagá-lo;
//   2. lançamento type 'credit_payment' (formato antigo do "Pagar fatura");
//   3. agendamento tipo 'pagamento_fatura' (gerado pelo motor da fatura).
// PURO (sem React). `contas`: array de contas ou Map(id → conta).

export const ROTULO_PAGAMENTO_CARTAO = 'Pagamento de cartão'
export const ROTULO_TIPO = { income: 'Receita', expense: 'Despesa', transfer: 'Transferência', credit_payment: ROTULO_PAGAMENTO_CARTAO }

const contaPorId = (contas, id) => {
  if (!id || !contas) return null
  if (contas instanceof Map) return contas.get(id) || null
  return contas.find?.(c => c?.id === id) || null
}

// Cartões de TODOS os perfis (o AppContext registra a cada carga): muitas telas passam só as contas
// do perfil ativo, e o pagamento feito de uma conta deste perfil para o cartão de OUTRO perfil
// deixava de ser reconhecido. A lista passada vale primeiro; o cadastro completo só completa.
let cartoesConhecidos = new Set()
export function registrarContas(todas) {
  cartoesConhecidos = new Set((todas || []).filter(c => c?.type === 'credit').map(c => c.id))
}

export const contaEhCartao = (contas, id) => {
  const c = contaPorId(contas, id)
  if (c) return c.type === 'credit'
  return !!id && cartoesConhecidos.has(id)
}

// Tipo do movimento: lançamento usa `type`; agendamento, `transactionType`.
export const tipoDoMovimento = (mov) => mov?.type || mov?.transactionType || null

export function ehPagamentoDeCartao(mov, contas) {
  if (!mov) return false
  if (mov.type === 'credit_payment' || mov.tipo === 'pagamento_fatura') return true
  return tipoDoMovimento(mov) === 'transfer' && contaEhCartao(contas, mov.toAccountId)
}

// 'pagamento_cartao' | 'income' | 'expense' | 'transfer' — para escolher ícone/cor na tela.
export const tipoVisual = (mov, contas) => (ehPagamentoDeCartao(mov, contas) ? 'pagamento_cartao' : tipoDoMovimento(mov))

// "Pagamento de cartão" | o rótulo de sempre ("Transferência", "Receita", "Despesa").
export function rotuloDoTipo(mov, contas) {
  if (ehPagamentoDeCartao(mov, contas)) return ROTULO_PAGAMENTO_CARTAO
  return ROTULO_TIPO[tipoDoMovimento(mov)] || 'Despesa'
}
