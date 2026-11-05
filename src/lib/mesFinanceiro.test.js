import { describe, it, expect } from 'vitest'
import { mesFinanceiroDe, mesesPendentes, configDoMes, somarDias } from './mesFinanceiro.js'

const dia15 = configDoMes({ financialMonthStartDay: 15 })

describe('mesFinanceiroDe', () => {
  it('dia 15: 15/10 a 14/11; o próprio dia 15 já é do mês novo', () => {
    expect(mesFinanceiroDe('2026-11-05', dia15)).toEqual({ inicio: '2026-10-15', fim: '2026-11-14' })
    expect(mesFinanceiroDe('2026-11-14', dia15)).toEqual({ inicio: '2026-10-15', fim: '2026-11-14' })
    expect(mesFinanceiroDe('2026-11-15', dia15)).toEqual({ inicio: '2026-11-15', fim: '2026-12-14' })
  })

  it('dia diferente de 15 (dia 5) e virada de ano', () => {
    const cfg = configDoMes({ financialMonthStartDay: 5 })
    expect(mesFinanceiroDe('2027-01-03', cfg)).toEqual({ inicio: '2026-12-05', fim: '2027-01-04' })
    expect(mesFinanceiroDe('2027-01-05', cfg)).toEqual({ inicio: '2027-01-05', fim: '2027-02-04' })
  })

  it('dia 1 e modo mês corrido = mês-calendário', () => {
    expect(mesFinanceiroDe('2026-02-10', configDoMes({ financialMonthStartDay: 1 }))).toEqual({ inicio: '2026-02-01', fim: '2026-02-28' })
    expect(mesFinanceiroDe('2026-02-10', configDoMes({ financialMonthStartDay: 20, financialMonthMode: 'calendar' }))).toEqual({ inicio: '2026-02-01', fim: '2026-02-28' })
  })

  it('mês com menos dias que o dia configurado: começa no último dia, sem pular nem repetir dias', () => {
    const cfg = configDoMes({ financialMonthStartDay: 31 })
    const fev = mesFinanceiroDe('2027-03-10', cfg)
    expect(fev).toEqual({ inicio: '2027-02-28', fim: '2027-03-30' })
    expect(mesFinanceiroDe('2027-03-31', cfg)).toEqual({ inicio: '2027-03-31', fim: '2027-04-29' })
    // encadeados: o dia seguinte ao fim é sempre o início do próximo
    let m = mesFinanceiroDe('2026-11-30', cfg)
    for (let i = 0; i < 14; i++) {
      const prox = mesFinanceiroDe(somarDias(m.fim, 1), cfg)
      expect(prox.inicio).toBe(somarDias(m.fim, 1))
      m = prox
    }
  })

  it('lê a linha configuracoes do banco (snake_case)', () => {
    expect(configDoMes({ financial_month_start_day: 10, financial_month_mode: 'custom' })).toEqual({ startDay: 10, mode: 'custom' })
  })
})

describe('mesesPendentes', () => {
  it('antes do dia de início não há pendência; a partir dele, o mês encerrado aparece', () => {
    expect(mesesPendentes({ ultimoCorte: '2026-10-14', hoje: '2026-11-14', cfg: dia15 })).toEqual([])
    expect(mesesPendentes({ ultimoCorte: '2026-10-14', hoje: '2026-11-15', cfg: dia15 })).toEqual([{ inicio: '2026-10-15', fim: '2026-11-14' }])
  })

  it('depois da virada do mês não pergunta mais', () => {
    expect(mesesPendentes({ ultimoCorte: '2026-11-14', hoje: '2026-11-20', cfg: dia15 })).toEqual([])
  })

  it('vários meses pendentes em ordem cronológica (desde 15/07)', () => {
    const p = mesesPendentes({ ultimoCorte: '2026-07-14', hoje: '2026-11-15', cfg: dia15 })
    expect(p.map(m => m.fim)).toEqual(['2026-08-14', '2026-09-14', '2026-10-14', '2026-11-14'])
    expect(p[0].inicio).toBe('2026-07-15')
  })

  it('corte fora do dia de início: o primeiro pendente é parcial até o fim do mês financeiro', () => {
    const p = mesesPendentes({ ultimoCorte: '2026-07-31', hoje: '2026-09-20', cfg: dia15 })
    expect(p).toEqual([{ inicio: '2026-08-01', fim: '2026-08-14' }, { inicio: '2026-08-15', fim: '2026-09-14' }])
  })

  it('sem nenhuma virada: só o último mês encerrado', () => {
    expect(mesesPendentes({ ultimoCorte: null, hoje: '2026-11-05', cfg: dia15 })).toEqual([{ inicio: '2026-09-15', fim: '2026-10-14', primeiro: true }])
  })
})

describe('ambiente que nunca fez virada: começa no mês da primeira função', () => {
  const dia1 = configDoMes({ financialMonthStartDay: 1 })
  it('primeira função no mês atual (dia 1, criada em 10/11): nada até o mês acabar; a partir de 01/12, só 01/11 a 30/11', () => {
    expect(mesesPendentes({ ultimoCorte: null, inicioUso: '2026-11-10', hoje: '2026-11-30', cfg: dia1 })).toEqual([])
    expect(mesesPendentes({ ultimoCorte: null, inicioUso: '2026-11-10', hoje: '2026-12-01', cfg: dia1 })).toEqual([{ inicio: '2026-11-01', fim: '2026-11-30' }])
  })
  it('dia 15, criada em 20/11: o primeiro mês é 15/11 a 14/12 e só fica pendente em 15/12', () => {
    expect(mesesPendentes({ ultimoCorte: null, inicioUso: '2026-11-20', hoje: '2026-12-14', cfg: dia15 })).toEqual([])
    expect(mesesPendentes({ ultimoCorte: null, inicioUso: '2026-11-20', hoje: '2026-12-15', cfg: dia15 })).toEqual([{ inicio: '2026-11-15', fim: '2026-12-14' }])
  })
  it('primeira função criada em mês já encerrado: aquele mês e os seguintes, em ordem, nenhum anterior', () => {
    expect(mesesPendentes({ ultimoCorte: null, inicioUso: '2026-09-10', hoje: '2026-11-05', cfg: dia1 }))
      .toEqual([{ inicio: '2026-09-01', fim: '2026-09-30' }, { inicio: '2026-10-01', fim: '2026-10-31' }])
  })
  it('mês curto (dia 31): criada em 05/03/2027 → mês de 28/02 a 30/03', () => {
    const cfg = configDoMes({ financialMonthStartDay: 31 })
    expect(mesesPendentes({ ultimoCorte: null, inicioUso: '2027-03-05', hoje: '2027-03-30', cfg })).toEqual([])
    expect(mesesPendentes({ ultimoCorte: null, inicioUso: '2027-03-05', hoje: '2027-03-31', cfg })).toEqual([{ inicio: '2027-02-28', fim: '2027-03-30' }])
  })
  it('com fechamento anterior vale a regra de sempre (a data da 1ª função é ignorada, sem pular mês)', () => {
    expect(mesesPendentes({ ultimoCorte: '2026-10-14', inicioUso: '2026-06-03', hoje: '2026-11-14', cfg: dia15 })).toEqual([])
    expect(mesesPendentes({ ultimoCorte: '2026-10-14', inicioUso: '2026-06-03', hoje: '2026-11-15', cfg: dia15 })).toEqual([{ inicio: '2026-10-15', fim: '2026-11-14' }])
  })
})
