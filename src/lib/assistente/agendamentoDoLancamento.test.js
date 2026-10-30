import { describe, it, expect } from 'vitest'
import { agendamentosDoLancamento, nomesParecidos, valorVariavel, criterioDoLancamento } from './agendamentoDoLancamento.js'
import { computeOccurrences } from '../occurrences.js'

const accounts = [
  { id: 'cc', name: 'Conta Corrente', type: 'checking' },
  { id: 'cartao', name: 'Cartão', type: 'credit' },
  { id: 'cartao2', name: 'Outro cartão', type: 'credit' },
]
const getNextOccurrences = (s, n) => computeOccurrences(s, n)
const ag = (extra) => ({
  id: 'vivo', description: 'Conta Vivo', payee: 'Vivo', transactionType: 'expense', accountId: 'cc', amount: 216,
  frequency: 'monthly', startDate: '2026-09-27', occurrenceType: 'continuous', registered: ['2026-09-27'], skipped: [], overrides: {}, ...extra,
})
// "Compra aprovada de R$ 216,00 em CONTA VIVO, 27/10 ... final 2122" → lançamento no cartão.
const sms = { type: 'expense', amount: 216, date: '2026-10-27', accountId: 'cartao', payee: 'CONTA VIVO', description: 'CONTA VIVO' }
const buscar = (lanc, schedules, transactions = []) => agendamentosDoLancamento(lanc, { schedules, accounts, transactions, getNextOccurrences })

describe('agendamento pendente que o lançamento do assistente paga', () => {
  it('caso real: SMS de cartão CONTA VIVO 216 × agendamento Conta Vivo 216 na conta corrente', () => {
    const r = buscar(sms, [ag()])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ schedule_id: 'vivo', ocorrencia: '2026-10-27', data: '2026-10-27', valor: 216, atrasado: false })
    expect(criterioDoLancamento(sms)).toMatchObject({ valor_informado: 216, data_pagamento: '2026-10-27', conta_id: 'cartao' })
  })
  it('valor: ±R$ 0,05; variável (já pago com outro valor) ±10%', () => {
    expect(buscar({ ...sms, amount: 216.05 }, [ag()])).toHaveLength(1)
    expect(buscar({ ...sms, amount: 216.10 }, [ag()])).toHaveLength(0)
    const pago = [{ scheduleId: 'vivo', amount: 199.9 }]
    expect(valorVariavel(ag(), pago)).toBe(true)
    expect(buscar({ ...sms, amount: 236 }, [ag()], pago)).toHaveLength(1)
    expect(buscar({ ...sms, amount: 240 }, [ag()], pago)).toHaveLength(0)
    expect(valorVariavel(ag({ valorStatus: 'projetado' }))).toBe(true)
  })
  it('data: até ±7 dias da próxima pendente (atrasada inclusive)', () => {
    expect(buscar({ ...sms, date: '2026-11-03' }, [ag()])[0].atrasado).toBe(true)
    expect(buscar({ ...sms, date: '2026-11-04' }, [ag()])).toHaveLength(0)
    expect(buscar({ ...sms, date: '2026-10-20' }, [ag()])).toHaveLength(1)
    expect(buscar({ ...sms, date: '2026-10-19' }, [ag()])).toHaveLength(0)
  })
  it('conta: mesma conta, ou lançamento de cartão × agendamento sem cartão; outro cartão não', () => {
    expect(buscar({ ...sms, accountId: 'cc' }, [ag()])).toHaveLength(1)
    expect(buscar(sms, [ag({ accountId: null })])).toHaveLength(1)
    expect(buscar(sms, [ag({ accountId: 'cartao2' })])).toHaveLength(0)
    expect(buscar({ ...sms, accountId: 'cc' }, [ag({ accountId: 'cartao' })])).toHaveLength(0)
  })
  it('nome parecido nos dois sentidos; nome diferente não bate', () => {
    expect(nomesParecidos({ payee: 'CONTA VIVO' }, { description: 'Conta Vivo' })).toBe(true)
    expect(nomesParecidos({ description: 'Pagamento VIVO FIBRA SP' }, { payee: 'Vivo' })).toBe(true)
    expect(buscar({ ...sms, payee: 'CLARO', description: 'CLARO' }, [ag()])).toHaveLength(0)
  })
  it('fora: tipo diferente, provisão, fatura, sem pendente; vários → o de mesma conta primeiro', () => {
    expect(buscar({ ...sms, type: 'income' }, [ag()])).toHaveLength(0)
    expect(buscar(sms, [ag({ isProvisao: true })])).toHaveLength(0)
    expect(buscar(sms, [ag({ tipo: 'pagamento_fatura' })])).toHaveLength(0)
    expect(buscar(sms, [ag({ occurrenceType: 'installment', installments: 1, frequency: 'once', registered: ['2026-09-27'] })])).toHaveLength(0)
    const r = buscar(sms, [ag(), ag({ id: 'vivo2', accountId: 'cartao' })])
    expect(r.map(c => c.schedule_id)).toEqual(['vivo2', 'vivo'])
  })
})
