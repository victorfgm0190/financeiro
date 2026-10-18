import { describe, it, expect } from 'vitest'
import { candidatasInicioMes, ehExecucaoDe, idsJaExecutadas } from './inicioMes.js'
import { computeOccurrences } from './occurrences.js'

// Devolução gerencial de fatura (frequência única, dia 15) — o caso do bug: no cache do celular
// `registered` ainda vazio, no Neon já executada em 15/10 com o lançamento correspondente.
const devolucao = (extra = {}) => ({
  id: 'fsch_itauazul_202610',
  description: 'Devolução Gerencial ITAUAZUL - Fatura 10/2026',
  transactionType: 'transfer',
  frequency: 'once',
  startDate: '2026-10-15',
  amount: 273.39,
  accountId: 'acc_ger',
  toAccountId: 'acc_central',
  registered: [],
  overrides: { _gerencialKey: 'acc_card_202610' },
  ...extra,
})
const ACCOUNTS = [{ id: 'acc_ger', type: 'checking' }, { id: 'acc_central', type: 'checking' }, { id: 'acc_card', type: 'credit' }]
const HOJE = new Date(2026, 9, 18)
const args = (schedules, extra = {}) => ({ schedules, accounts: ACCOUNTS, getNextOccurrences: computeOccurrences, hoje: HOJE, financialStartDay: 15, ...extra })

describe('candidatasInicioMes', () => {
  it('lista a transferência gerencial pendente do mês corrente', () => {
    const r = candidatasInicioMes(args([devolucao()]))
    expect(r.map(c => [c.schedule.id, c.date, c.mes])).toEqual([['fsch_itauazul_202610', '2026-10-15', '2026-10']])
  })
  it('ignora a já registrada, a de outro mês, a sem chave gerencial/origem e a que vai para cartão', () => {
    const r = candidatasInicioMes(args([
      devolucao({ registered: ['2026-10-15'] }),
      devolucao({ id: 'nov', startDate: '2026-11-15' }),
      devolucao({ id: 'manual', overrides: {} }),
      devolucao({ id: 'cartao', toAccountId: 'acc_card' }),
    ]))
    expect(r).toEqual([])
  })
  it('antes do dia de início do mês financeiro não lista nada', () => {
    expect(candidatasInicioMes(args([devolucao()], { hoje: new Date(2026, 9, 10) }))).toEqual([])
  })
})

describe('ehExecucaoDe / idsJaExecutadas', () => {
  const linhaBanco = { id: 'tx1', schedule_id: 'fsch_itauazul_202610', source_schedule_id: 'fsch_itauazul_202610', account_id: 'acc_ger', to_account_id: 'acc_central', date: '2026-10-15', type: 'transfer', reserva_auto: false }

  it('linha do banco com mesmo agendamento, contas e competência conta como executada', () => {
    expect(ehExecucaoDe(linhaBanco, devolucao(), '2026-10')).toBe(true)
  })
  it('vale também o lançamento do app (camelCase) e o vínculo só por sourceScheduleId', () => {
    const tx = { scheduleId: null, sourceScheduleId: 'fsch_itauazul_202610', accountId: 'acc_ger', toAccountId: 'acc_central', date: '2026-10-15', type: 'transfer' }
    expect(ehExecucaoDe(tx, devolucao(), '2026-10')).toBe(true)
  })
  it('não conta outra competência, outras contas, outro agendamento nem sombra de reserva', () => {
    expect(ehExecucaoDe({ ...linhaBanco, date: '2026-09-15' }, devolucao(), '2026-10')).toBe(false)
    expect(ehExecucaoDe({ ...linhaBanco, to_account_id: 'outra' }, devolucao(), '2026-10')).toBe(false)
    expect(ehExecucaoDe({ ...linhaBanco, schedule_id: 'x', source_schedule_id: null }, devolucao(), '2026-10')).toBe(false)
    expect(ehExecucaoDe({ ...linhaBanco, reserva_auto: true }, devolucao(), '2026-10')).toBe(false)
    expect(ehExecucaoDe({ ...linhaBanco, type: 'expense' }, devolucao(), '2026-10')).toBe(false)
  })
  it('separa executadas das pendentes', () => {
    const cands = candidatasInicioMes(args([devolucao(), devolucao({ id: 'itaupers', accountId: 'acc_ger2' })]))
    expect([...idsJaExecutadas(cands, [linhaBanco])]).toEqual(['fsch_itauazul_202610'])
  })
})
