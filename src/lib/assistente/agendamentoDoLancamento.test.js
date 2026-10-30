import { describe, it, expect } from 'vitest'
import { agendamentosDoLancamento, agendamentosParecidos, favorecidosParecidos, nomesParecidos, valorVariavel, criterioDoLancamento } from './agendamentoDoLancamento.js'
import { nomeCompacto, prefixoParecido, semIntermediador } from './nomeParecido.js'
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
  it('compra em dólar ESTIMADA (VERCEL R$ 106,60 no mesmo cartão): ±15%', () => {
    const vercel = ag({ id: 'vercel', description: 'VERCEL', payee: 'Vercel', amount: 106.6, accountId: 'cartao', startDate: '2026-09-23', registered: ['2026-09-23'] })
    const compra = { type: 'expense', amount: 118, date: '2026-10-23', accountId: 'cartao', payee: 'VERCEL INC.', description: 'VERCEL INC.', estimado: true }
    expect(buscar(compra, [vercel])).toHaveLength(1)
    expect(buscar({ ...compra, amount: 123 }, [vercel])).toHaveLength(0)
    expect(buscar({ ...compra, estimado: false }, [vercel])).toHaveLength(0)
  })
})

// Caso real (dados trocados): SMS "... final 4541 - MP *BARBEARIACONS valor RS 70,00 em 23/10" ×
// agendamento quinzenal "BARBEARIA CONSTANCIA" R$ 120 no mesmo cartão, vencido em 24/10.
const barbearia = (extra) => ({
  id: 'barb', description: 'BARBEARIA CONSTANCIA', payee: 'Barbearia Constância', transactionType: 'expense', accountId: 'cartao', amount: 120,
  frequency: 'biweekly', startDate: '2026-10-10', occurrenceType: 'continuous', registered: ['2026-10-10'], skipped: [], overrides: {}, ...extra,
})
const smsBarb = { type: 'expense', amount: 70, date: '2026-10-23', accountId: 'cartao', payee: '', description: 'MP *BARBEARIACONS' }
const ctxB = (schedules, transactions = []) => ({ schedules, accounts, transactions, getNextOccurrences })

describe('nome parecido (genérico)', () => {
  it('tira o intermediador pelo formato, acentos, espaços e símbolos', () => {
    expect(semIntermediador('MP *BARBEARIACONS')).toBe('BARBEARIACONS')
    expect(nomeCompacto('PG*Loja Ávila-Centro')).toBe('lojaavilacentro')
    expect(nomeCompacto('IFD*Restaurante')).toBe('restaurante')
    expect(nomeCompacto('SPG * Posto X')).toBe('postox')
  })
  it('prefixo de um no outro com 6+ letras', () => {
    expect(prefixoParecido('MP *BARBEARIACONS', 'BARBEARIA CONSTANCIA')).toBe(true)
    expect(prefixoParecido('BARBE', 'BARBEARIA CONSTANCIA')).toBe(false)
    expect(prefixoParecido('BARBEARIA X', 'BARBEARIA CONSTANCIA')).toBe(false)
  })
})

describe('agendamento PARECIDO (só sugere)', () => {
  it('caso real: avisa (valor fora de 10%), não bate certo', () => {
    expect(agendamentosDoLancamento(smsBarb, ctxB([barbearia()]))).toEqual([])
    const r = agendamentosParecidos(smsBarb, ctxB([barbearia()]))
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ schedule_id: 'barb', data: '2026-10-24', valor: 120, parecido: true, atrasado: false })
  })
  it('mesmo nome em OUTRO cartão não avisa', () => {
    expect(agendamentosParecidos(smsBarb, ctxB([barbearia({ accountId: 'cartao2' })]))).toEqual([])
  })
  it('menos de 6 letras em comum não avisa', () => {
    expect(agendamentosParecidos({ ...smsBarb, description: 'MP *BARBE' }, ctxB([barbearia()]))).toEqual([])
  })
  it('valor dentro de 10% (variável) continua "bate com agendamento", e sai dos parecidos', () => {
    const pago = [{ scheduleId: 'barb', amount: 110 }]
    const lanc = { ...smsBarb, amount: 115 }
    expect(agendamentosDoLancamento(lanc, ctxB([barbearia()], pago))).toHaveLength(1)
    expect(agendamentosParecidos(lanc, ctxB([barbearia()], pago))).toEqual([])
  })
  it('ocorrência a mais de 15 dias não avisa', () => {
    expect(agendamentosParecidos({ ...smsBarb, date: '2026-11-09' }, ctxB([barbearia({ registered: ['2026-10-10', '2026-10-24'] })]))).toHaveLength(1)
    expect(agendamentosParecidos({ ...smsBarb, date: '2026-10-08' }, ctxB([barbearia({ registered: ['2026-10-10', '2026-10-24'] })]))).toEqual([])
  })
})

describe('favorecido parecido (só sugere)', () => {
  const payees = ['Barbearia Constância', 'Barbearia X', 'Posto Central']
  it('nome do SMS × favoritos cadastrados', () => {
    expect(favorecidosParecidos({ favorecido_novo: 'MP *BARBEARIACONS' }, payees)).toEqual(['Barbearia Constância'])
    expect(favorecidosParecidos({ favorecido_novo: null, descricao: 'MP *BARBEARIACONS' }, payees)).toEqual(['Barbearia Constância'])
  })
  it('IA já escolheu um existente, ou nome curto → nada', () => {
    expect(favorecidosParecidos({ favorecido_id: 'Posto Central', descricao: 'BARBEARIACONS' }, payees)).toEqual([])
    expect(favorecidosParecidos({ favorecido_novo: 'BARB' }, payees)).toEqual([])
  })
})
