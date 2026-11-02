import { describe, it, expect } from 'vitest'
import { ehPagamentoDeCartao, rotuloDoTipo, tipoVisual, contaEhCartao, ROTULO_PAGAMENTO_CARTAO } from './rotuloMovimento'
import { filtrarPorTipo, contarPorTipo, tipoDoItem } from './agendamentosTipo'
import { eventoDoItem } from './agendaFeed'
import { rotuloTipo } from './assistente/loteApp'

// Contas FICTÍCIAS.
const contas = [
  { id: 'cc', name: 'Conta Exemplo', type: 'checking' },
  { id: 'poup', name: 'Poupança Exemplo', type: 'savings' },
  { id: 'card', name: 'Cartão Exemplo', type: 'credit' },
]

describe('rótulo do tipo (só exibição)', () => {
  it('transferência comum continua "Transferência"', () => {
    const t = { type: 'transfer', accountId: 'cc', toAccountId: 'poup' }
    expect(rotuloDoTipo(t, contas)).toBe('Transferência')
    expect(ehPagamentoDeCartao(t, contas)).toBe(false)
    expect(tipoVisual(t, contas)).toBe('transfer')
  })
  it('transferência para conta de cartão vira "Pagamento de cartão" (lançamento e agendamento)', () => {
    expect(rotuloDoTipo({ type: 'transfer', accountId: 'cc', toAccountId: 'card', faturaMonthYear: '2026-11' }, contas)).toBe(ROTULO_PAGAMENTO_CARTAO)
    expect(rotuloDoTipo({ transactionType: 'transfer', accountId: 'cc', toAccountId: 'card' }, contas)).toBe('Pagamento de cartão')
    expect(tipoVisual({ type: 'transfer', toAccountId: 'card' }, new Map(contas.map(c => [c.id, c])))).toBe('pagamento_cartao')
  })
  it('regras antigas também: credit_payment e agendamento pagamento_fatura', () => {
    expect(rotuloDoTipo({ type: 'credit_payment', accountId: 'card', fromAccountId: 'cc' }, contas)).toBe(ROTULO_PAGAMENTO_CARTAO)
    expect(rotuloDoTipo({ transactionType: 'transfer', tipo: 'pagamento_fatura', toAccountId: 'cc' }, contas)).toBe(ROTULO_PAGAMENTO_CARTAO)
  })
  it('outros tipos não mudam (despesa no cartão, receita, transferência saindo do cartão)', () => {
    expect(rotuloDoTipo({ type: 'expense', accountId: 'card' }, contas)).toBe('Despesa')
    expect(rotuloDoTipo({ type: 'income', accountId: 'card' }, contas)).toBe('Receita')
    expect(rotuloDoTipo({ type: 'transfer', accountId: 'card', toAccountId: 'cc' }, contas)).toBe('Transferência')
    expect(rotuloDoTipo({ type: 'transfer', toAccountId: 'inexistente' }, contas)).toBe('Transferência')
    expect(contaEhCartao(contas, 'cc')).toBe(false)
  })
})

describe('filtro de Agendamentos: pagamento de cartão continua em Transferências', () => {
  const lista = [
    { id: 'a', transactionType: 'transfer', accountId: 'cc', toAccountId: 'card' },
    { id: 'b', transactionType: 'transfer', accountId: 'cc', toAccountId: 'poup' },
    { id: 'c', transactionType: 'expense', accountId: 'cc' },
    { id: 'd', transactionType: 'income', accountId: 'cc' },
  ]
  it('Transferências inclui o pagamento; "Pagamentos de cartão" é um recorte', () => {
    expect(filtrarPorTipo(lista, 'transferencias').map(i => i.id)).toEqual(['a', 'b'])
    expect(filtrarPorTipo(lista, 'pagamentos_cartao', undefined, contas).map(i => i.id)).toEqual(['a'])
    expect(contarPorTipo(lista, undefined, contas)).toEqual({ todos: 4, entradas: 1, saidas: 1, transferencias: 2, pagamentos_cartao: 1 })
    expect(tipoDoItem(lista[0])).toBe('transferencias')
  })
  it('linha paga (aba Pagos) e fatura a pagar do cartão', () => {
    const paga = { key: 'x', schedule: lista[0], transactionType: 'transfer' }
    const fatura = { id: 'f', cartaoId: 'card', mesAno: '2026-11', amount: 100 }
    expect(filtrarPorTipo([paga, fatura, lista[1]], 'pagamentos_cartao', undefined, contas)).toEqual([paga, fatura])
  })
})

describe('outros pontos que usam a regra', () => {
  it('título do evento na agenda do celular (.ics)', () => {
    const s = { id: 's1', description: 'Fatura Cartão Exemplo', transactionType: 'transfer', accountId: 'cc', toAccountId: 'card', amount: 300 }
    expect(eventoDoItem({ schedule: s, data: '2026-11-10', amount: 300 }, { accounts: contas }).titulo).toBe('Pagamento de cartão: Fatura Cartão Exemplo — R$ 300,00')
    const comum = { ...s, toAccountId: 'poup', description: 'Guardar' }
    expect(eventoDoItem({ schedule: comum, data: '2026-11-10', amount: 300 }, { accounts: contas }).titulo).toBe('Guardar — R$ 300,00')
  })
  it('lote do Assistente', () => {
    expect(rotuloTipo({ tipo: 'transferencia', conta_destino_id: 'card' }, 'registrar_lancamento', contas)).toBe('Pagamento de cartão')
    expect(rotuloTipo({ tipo: 'transferencia', conta_destino_id: 'poup' }, 'registrar_lancamento', contas)).toBe('Transferência')
  })
})
