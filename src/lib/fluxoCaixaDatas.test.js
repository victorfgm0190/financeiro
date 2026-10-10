import { describe, it, expect } from 'vitest'
import { montarLinhasSimuladas, opcoesAplicarData, patchAplicarData, agendamentoGeridoPeloMotor } from './fluxoCaixaDatas'
import { computeOccurrences } from './occurrences'
import { occEfetiva } from './fluxoCaixa'

const linha = (key, date, { entrada = 0, saida = 0, real = false, ...extra } = {}) =>
  ({ _key: key, date, entrada, saida, real, description: key, ...extra })

// Período 10/10–31/10, saldo base 1000.
const PER = { start: '2026-10-10', end: '2026-10-31', saldoBase: 1000 }
const rows = [
  linha('reg', '2026-10-10', { entrada: 100, real: true }),
  linha('diarista', '2026-10-13', { saida: 200 }),
  linha('luz', '2026-10-18', { saida: 50 }),
  linha('salario', '2026-10-25', { entrada: 500 }),
]
const keys = (l) => l.map(r => r._key)

describe('montarLinhasSimuladas', () => {
  it('sem datas provisórias reproduz a ordem e o acumulado', () => {
    const r = montarLinhasSimuladas(rows, PER)
    expect(keys(r.rowsView)).toEqual(['reg', 'diarista', 'luz', 'salario'])
    expect(r.rowsView.map(x => x.saldo)).toEqual([1100, 900, 850, 1350])
    expect([r.totalEntrada, r.totalSaida, r.saldoFinal]).toEqual([600, 250, 1350])
  })

  it('a) DIARISTA 13/10 → 20/10: reordena e recalcula o acumulado (total igual)', () => {
    const r = montarLinhasSimuladas(rows, { ...PER, datas: new Map([['diarista', '2026-10-20']]) })
    expect(keys(r.rowsView)).toEqual(['reg', 'luz', 'diarista', 'salario'])
    expect(r.rowsView.map(x => x.saldo)).toEqual([1100, 1050, 850, 1350])
    const d = r.rowsView.find(x => x._key === 'diarista')
    expect([d.date, d._dataOriginal]).toEqual(['2026-10-20', '2026-10-13'])
  })

  it('b) restaurar (sem override) volta à data original', () => {
    const r = montarLinhasSimuladas(rows, { ...PER, datas: new Map() })
    expect(r.rowsView.find(x => x._key === 'diarista').date).toBe('2026-10-13')
  })

  it('c) data fora do período: sai do cálculo e vai para foraDoPeriodo', () => {
    const r = montarLinhasSimuladas(rows, { ...PER, datas: new Map([['diarista', '2026-11-05']]) })
    expect(keys(r.rowsView)).toEqual(['reg', 'luz', 'salario'])
    expect(keys(r.foraDoPeriodo)).toEqual(['diarista'])
    expect(r.saldoFinal).toBe(1550)
    expect(r.totalSaida).toBe(50)
  })

  it('Registrada nunca recebe data provisória', () => {
    const r = montarLinhasSimuladas(rows, { ...PER, datas: new Map([['reg', '2026-10-30']]) })
    expect(r.rowsView[0]).toMatchObject({ _key: 'reg', date: '2026-10-10' })
  })

  it('data alterada E desmarcada: aparece na nova data, fora do cálculo', () => {
    const r = montarLinhasSimuladas(rows, { ...PER, datas: new Map([['diarista', '2026-10-20']]), excluidas: new Set(['diarista']) })
    const d = r.rowsView.find(x => x._key === 'diarista')
    expect([d.ativa, d.saldo, d.date]).toEqual([false, null, '2026-10-20'])
    expect(r.saldoFinal).toBe(1550)
  })
})

describe('agendamentoGeridoPeloMotor', () => {
  it('faturas/gerencial bloqueiam; resgate avulso e agendamento comum não', () => {
    expect(agendamentoGeridoPeloMotor({ id: 'fsch_card_202610_pagamento_fatura' })).toBe(true)
    expect(agendamentoGeridoPeloMotor({ id: 'x', tipo: 'gerencial_devolucao' })).toBe(true)
    expect(agendamentoGeridoPeloMotor({ id: 'x', tipo: 'resgate_reserva', cardId: 'c' })).toBe(true)
    expect(agendamentoGeridoPeloMotor({ id: 'x', overrides: { _gerencialKey: 'k' } })).toBe(true)
    expect(agendamentoGeridoPeloMotor({ id: 'x', tipo: 'resgate_reserva' })).toBe(false)
    expect(agendamentoGeridoPeloMotor({ id: 'x' })).toBe(false)
  })
})

describe('Aplicar no agendamento', () => {
  const mensal = {
    id: 'sch_diarista', frequency: 'monthly', occurrenceType: 'continuous',
    startDate: '2026-09-13', nextOccurrence: '2026-10-13', registered: ['2026-09-13'], skipped: [],
    amount: 200, overrides: {},
  }

  it('d) "Única": move startDate e nextOccurrence; valor de exceção acompanha a nova chave', () => {
    const unica = { id: 'u', frequency: 'once', startDate: '2026-10-13', amount: 90, overrides: { '2026-10-13': { amount: 95 } } }
    expect(opcoesAplicarData(unica, '2026-10-13', '2026-10-20', '2026-10-13').once).toBe(true)
    const patch = patchAplicarData(unica, '2026-10-13', '2026-10-20', 'unica')
    expect(patch).toEqual({ startDate: '2026-10-20', nextOccurrence: '2026-10-20', overrides: { '2026-10-20': { amount: 95 } } })
    const depois = { ...unica, ...patch }
    expect(computeOccurrences(depois, 5)).toEqual(['2026-10-20'])
    expect(occEfetiva(depois, '2026-10-20').amount).toBe(95)
  })

  it('e) recorrente "Esta e as próximas" na 1ª pendente: série passa a sair da nova data', () => {
    const op = opcoesAplicarData(mensal, '2026-10-13', '2026-10-20', '2026-10-13')
    expect(op.serie.ok).toBe(true)
    const depois = { ...mensal, ...patchAplicarData(mensal, '2026-10-13', '2026-10-20', 'serie') }
    expect(computeOccurrences(depois, 3)).toEqual(['2026-10-20', '2026-11-20', '2026-12-20'])
  })

  it('"Esta e as próximas" fora da 1ª pendente é bloqueado (as anteriores sumiriam)', () => {
    const op = opcoesAplicarData(mensal, '2026-11-13', '2026-11-20', '2026-10-13')
    expect(op.serie.ok).toBe(false)
    expect(op.serie.motivo).toMatch(/primeira ocorrência pendente/)
  })

  it('"Esta e as próximas" para antes de uma ocorrência já registrada é bloqueado', () => {
    const op = opcoesAplicarData(mensal, '2026-10-13', '2026-09-10', '2026-10-13')
    expect(op.serie.ok).toBe(false)
  })

  it('avisa sobre exceções em ocorrências seguintes ao mover a série', () => {
    const comExc = { ...mensal, overrides: { '2026-11-13': { amount: 250 } } }
    expect(opcoesAplicarData(comExc, '2026-10-13', '2026-10-20', '2026-10-13').avisos).toHaveLength(1)
  })

  it('"Só esta ocorrência": grava overrides[orig].date (mecanismo existente) e não mexe na série', () => {
    const depois = { ...mensal, ...patchAplicarData(mensal, '2026-11-13', '2026-11-20', 'ocorrencia') }
    expect(depois.overrides).toEqual({ '2026-11-13': { date: '2026-11-20' } })
    expect(computeOccurrences(depois, 3)).toEqual(['2026-10-13', '2026-11-13', '2026-12-13'])
    expect(occEfetiva(depois, '2026-11-13').date).toBe('2026-11-20')
    expect(depois.startDate).toBe(mensal.startDate)
  })

  it('"Só esta ocorrência" preserva exceção de valor e volta à original removendo só a data', () => {
    const s = { ...mensal, overrides: { '2026-11-13': { amount: 250 } } }
    const movido = { ...s, ...patchAplicarData(s, '2026-11-13', '2026-11-20', 'ocorrencia') }
    expect(movido.overrides['2026-11-13']).toEqual({ amount: 250, date: '2026-11-20' })
    const volta = patchAplicarData(movido, '2026-11-13', '2026-11-13', 'ocorrencia')
    expect(volta.overrides['2026-11-13']).toEqual({ amount: 250 })
  })

  it('fatura/gerencial: bloqueio com mensagem', () => {
    expect(opcoesAplicarData({ id: 'fsch_x', frequency: 'once' }, 'a', 'b', 'a').bloqueio).toMatch(/motor de faturas/)
  })
})
