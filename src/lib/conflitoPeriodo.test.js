import { describe, it, expect } from 'vitest'
import {
  vencimentoDoPeriodo, baixaNoPeriodo, puloNoPeriodo, separarConflitosDePulo, mensagemConflitoPulo,
} from './conflitoPeriodo'

const mensal = (extra = {}) => ({ id: 'ar', frequency: 'monthly', startDate: '2026-05-18', occurrenceType: 'installment', installments: 9, registered: [], skipped: [], ...extra })
const semanal = (extra = {}) => ({ id: 'sem', frequency: 'weekly', startDate: '2026-10-05', occurrenceType: 'continuous', registered: [], skipped: [], ...extra })

describe('período do vencimento', () => {
  it('mensal: baixa no dia anterior cai no período do vencimento do mês', () => {
    expect(vencimentoDoPeriodo(mensal(), '2026-06-17')).toBe('2026-06-18')
    expect(vencimentoDoPeriodo(mensal(), '2026-07-02')).toBe('2026-06-18')
    expect(vencimentoDoPeriodo(mensal(), '2026-07-05')).toBe('2026-07-18')
  })
  it('semanal: a mesma semana em torno do vencimento', () => {
    expect(vencimentoDoPeriodo(semanal(), '2026-10-13')).toBe('2026-10-12')
    expect(vencimentoDoPeriodo(semanal(), '2026-10-15')).toBe('2026-10-12')
    expect(vencimentoDoPeriodo(semanal(), '2026-10-16')).toBe('2026-10-19')
  })
  it('único: sem período', () => {
    expect(vencimentoDoPeriodo({ frequency: 'once', startDate: '2026-06-18' }, '2026-06-17')).toBeNull()
  })
})

describe('Pular com baixa no mesmo período', () => {
  it('mensal com baixa em 17/06: pular 18/06 avisa', () => {
    const s = mensal({ registered: ['2026-05-18', '2026-06-17'] })
    expect(baixaNoPeriodo(s, '2026-06-18')).toBe('2026-06-17')
    expect(mensagemConflitoPulo('2026-06-17')).toBe('Este mês já tem um pagamento registrado em 17/06. Pular vai contar este mês duas vezes. Deseja pular mesmo assim?')
  })
  it('mensal com baixas nas datas certas: pular o mês seguinte não avisa', () => {
    const s = mensal({ registered: ['2026-05-18', '2026-06-18'] })
    expect(baixaNoPeriodo(s, '2026-07-18')).toBeNull()
  })
  it('baixa de outro mês não conta para este', () => {
    const s = mensal({ registered: ['2026-06-17'] })
    expect(baixaNoPeriodo(s, '2026-07-18')).toBeNull()
  })
  it('semanal: baixa na terça da mesma semana avisa; a de quinta anterior (mais perto do vencimento de 05/10) não', () => {
    expect(baixaNoPeriodo(semanal({ registered: ['2026-10-13'] }), '2026-10-12')).toBe('2026-10-13')
    expect(baixaNoPeriodo(semanal({ registered: ['2026-10-08'] }), '2026-10-12')).toBeNull()
    expect(baixaNoPeriodo(semanal({ registered: ['2026-10-09'] }), '2026-10-12')).toBe('2026-10-09') // sexta: 3 dias antes de 12/10
  })
})

describe('Pular em lote', () => {
  it('lista só os que têm conflito; os demais podem ser pulados', () => {
    const conflito = { schedule: mensal({ id: 'a', registered: ['2026-06-17'] }), nextDate: '2026-06-18' }
    const livre = { schedule: mensal({ id: 'b', registered: ['2026-05-18'] }), nextDate: '2026-06-18' }
    const sem = { schedule: semanal({ id: 'c', registered: ['2026-10-13'] }), nextDate: '2026-10-12' }
    const { livres, conflitos } = separarConflitosDePulo([conflito, livre, sem])
    expect(livres.map(i => i.schedule.id)).toEqual(['b'])
    expect(conflitos.map(i => [i.schedule.id, i.baixa])).toEqual([['a', '2026-06-17'], ['c', '2026-10-13']])
  })
})

describe('Dar baixa com o vencimento do período pulado', () => {
  it('pulou 18/06 e pagou em 17/06: a próxima pendente (18/07) não deve receber a baixa', () => {
    const s = mensal({ registered: ['2026-05-18'], skipped: ['2026-06-18'] })
    expect(puloNoPeriodo(s, '2026-06-17', '2026-07-18')).toBe('2026-06-18')
  })
  it('pagamento no próprio período da ocorrência: sem aviso', () => {
    const s = mensal({ registered: ['2026-05-18'], skipped: ['2026-06-18'] })
    expect(puloNoPeriodo(s, '2026-07-17', '2026-07-18')).toBeNull()
  })
  it('pulo legítimo de um mês antes do pagamento antecipado do seguinte: sem aviso', () => {
    const s = mensal({ registered: ['2026-05-18'], skipped: ['2026-06-18'] })
    expect(puloNoPeriodo(s, '2026-07-08', '2026-07-18')).toBeNull()
  })
  it('semanal: pulou a segunda e pagou na quarta da mesma semana', () => {
    const s = semanal({ skipped: ['2026-10-12'] })
    expect(puloNoPeriodo(s, '2026-10-14', '2026-10-19')).toBe('2026-10-12')
  })
})
