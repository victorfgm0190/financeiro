import { describe, it, expect } from 'vitest'
import { resumoSelecao, classificarAgendamento } from './resumoSelecao'

const accounts = [
  { id: 'itau', apelido: 'Itau' },
  { id: 'ca', apelido: 'CA', isReserva: true },
  { id: 'nu', name: 'Nubank' },
  { id: 'rx', name: 'Reserva X', isReserva: true },
]
const apl = (id, from, to) => ({ id, transactionType: 'transfer', accountId: from, toAccountId: to })
const desp = (id) => ({ id, transactionType: 'expense', accountId: 'itau' })
const rec = (id) => ({ id, transactionType: 'income', accountId: 'itau' })

describe('classificarAgendamento', () => {
  it('aplicação, resgate, transferência comum, fatura', () => {
    expect(classificarAgendamento(apl('a', 'itau', 'ca'), accounts)).toBe('aplicacao')
    expect(classificarAgendamento(apl('b', 'ca', 'itau'), accounts)).toBe('resgate')
    expect(classificarAgendamento(apl('c', 'itau', 'nu'), accounts)).toBe('transferencia')
    expect(classificarAgendamento({ tipo: 'pagamento_fatura', transactionType: 'transfer' }, accounts)).toBe('fatura')
  })
})

describe('resumoSelecao', () => {
  it('mista: líquido de resgate CA → Itau, despesa fora do líquido', () => {
    const r = resumoSelecao([
      { schedule: apl('1', 'itau', 'ca'), amount: 4373 },
      { schedule: apl('2', 'ca', 'itau'), amount: 6000 },
      { schedule: apl('3', 'ca', 'itau'), amount: 510.06 },
      { schedule: desp('4'), amount: 100 },
    ], accounts)
    expect(r.g.aplicacao.total).toBe(4373)
    expect(r.g.resgate.total).toBe(6510.06)
    expect(r.liquidoReserva).toBe(2137.06)
    expect(r.pares).toHaveLength(1)
    expect(r.pares[0]).toMatchObject({ sentido: 'resgate', liquido: 2137.06, origemNome: 'CA', destinoNome: 'Itau', nAplicacoes: 1, nResgates: 2 })
    expect(r.impactoPorConta).toEqual([
      { accountId: 'itau', nome: 'Itau', delta: 2137.06 },
      { accountId: 'ca', nome: 'CA', delta: -2137.06 },
    ])
    expect(r.g.despesa.total).toBe(100)
    expect(r.saldo).toBe(2037.06)
  })

  it('só aplicações: aplicação líquida Itau → CA', () => {
    const r = resumoSelecao([{ schedule: apl('1', 'itau', 'ca'), amount: 50 }], accounts)
    expect(r.pares[0]).toMatchObject({ sentido: 'aplicacao', liquido: -50, origemNome: 'Itau', destinoNome: 'CA' })
    expect(r.showSaldo).toBe(false)
  })

  it('pares distintos e empate', () => {
    const r = resumoSelecao([
      { schedule: apl('1', 'itau', 'ca'), amount: 10 },
      { schedule: apl('2', 'ca', 'itau'), amount: 10 },
      { schedule: apl('3', 'rx', 'nu'), amount: 7 },
      { schedule: rec('4'), amount: 'x' },
    ], accounts)
    expect(r.pares.map(p => p.sentido)).toEqual(['zero', 'resgate'])
    expect(r.pares[1]).toMatchObject({ origemNome: 'Reserva X', destinoNome: 'Nubank', liquido: 7 })
    expect(r.g.receita.total).toBe(0)
  })
})
