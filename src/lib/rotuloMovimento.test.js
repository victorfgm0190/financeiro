import { describe, it, expect } from 'vitest'
import { ehPagamentoDeCartao, rotuloDoTipo, tipoVisual, contaEhCartao, ROTULO_PAGAMENTO_CARTAO, registrarContas } from './rotuloMovimento'
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

describe('filtro de Agendamentos: pagamento de cartão conta SÓ em "Pagamentos de cartão"', () => {
  const lista = [
    { id: 'a', transactionType: 'transfer', accountId: 'cc', toAccountId: 'card' },
    { id: 'b', transactionType: 'transfer', accountId: 'cc', toAccountId: 'poup' },
    { id: 'c', transactionType: 'expense', accountId: 'cc' },
    { id: 'd', transactionType: 'income', accountId: 'cc' },
  ]
  it('Transferências fica só com as comuns; o pagamento de fatura conta e aparece só em "Pagamentos de cartão"', () => {
    expect(filtrarPorTipo(lista, 'transferencias', undefined, contas).map(i => i.id)).toEqual(['b'])
    expect(filtrarPorTipo(lista, 'pagamentos_cartao', undefined, contas).map(i => i.id)).toEqual(['a'])
    expect(contarPorTipo(lista, undefined, contas)).toEqual({ todos: 4, entradas: 1, saidas: 1, transferencias: 1, pagamentos_cartao: 1 })
    // Por dentro continua transferência (só a tela muda).
    expect(tipoDoItem(lista[0])).toBe('transferencias')
  })
  it('fatura a pagar do cartão (aba Cartão) não conta em Saídas', () => {
    const fatura = { id: 'f', cartaoId: 'card', mesAno: '2026-11', amount: 100 }
    expect(contarPorTipo([fatura, lista[2]], undefined, contas)).toEqual({ todos: 2, entradas: 0, saidas: 1, transferencias: 0, pagamentos_cartao: 1 })
    expect(filtrarPorTipo([fatura, lista[2]], 'saidas', undefined, contas).map(i => i.id)).toEqual(['c'])
  })
  it('25 faturas: "Transferências 0" e "Pagamentos de cartão 25" (antes apareciam 25 nos dois)', () => {
    const faturas = Array.from({ length: 25 }, (_, k) => ({ id: `p${k}`, transactionType: 'transfer', accountId: 'cc', toAccountId: 'card' }))
    const c = contarPorTipo(faturas, undefined, contas)
    expect([c.transferencias, c.pagamentos_cartao, c.todos]).toEqual([0, 25, 25])
  })
  it('cartão de OUTRO perfil: reconhecido mesmo com só as contas do perfil ativo na mão', () => {
    registrarContas([...contas, { id: 'card_pj', type: 'credit', profileId: 'pj' }])
    const pg = { type: 'transfer', accountId: 'cc', toAccountId: 'card_pj' }
    expect(ehPagamentoDeCartao(pg, contas)).toBe(true)
    expect(rotuloDoTipo(pg, contas)).toBe(ROTULO_PAGAMENTO_CARTAO)
    expect(contarPorTipo([{ ...pg, transactionType: 'transfer' }], undefined, contas).pagamentos_cartao).toBe(1)
    registrarContas([])
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
