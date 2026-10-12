import { describe, it, expect } from 'vitest'
import { statusConfirmacaoLinha, STATUS_CONFIRMACAO } from './fluxoStatus'

const ag = (s) => ({ agPorId: new Map(s.map(x => [x.id, x])) })
const semanal = { frequency: 'weekly', startDate: '2026-10-13', registered: [], skipped: [] }
const ctx = ag([
  { id: 'sch_dia', description: 'Diarista', confirmado: true, ...semanal },
  { id: 'sch_dia2', description: 'Diarista', confirmado: false, ...semanal },
  { id: 'sch_atr', description: 'Atrasada', confirmado: true, frequency: 'weekly', startDate: '2026-09-29', registered: ['2026-09-29'], skipped: [] },
  { id: 'sch_luz', description: 'Luz', confirmado: false, frequency: 'monthly', startDate: '2026-10-20' },
  { id: 'sch_prov', description: 'IPVA', isProvisao: true, confirmado: true, frequency: 'monthly', startDate: '2026-11-01' },
  { id: 'fsch_x', tipo: 'resgate_reserva', confirmado: true, frequency: 'once', startDate: '2026-10-05' },
])
const linha = (id, d, sep = '_') => ({ _key: id + sep + d, _scheduleId: id, _origDate: d, real: false })
const C = STATUS_CONFIRMACAO.CONFIRMADO
const A = STATUS_CONFIRMACAO.A_CONFIRMAR

describe('statusConfirmacaoLinha', () => {
  it('semanal com flag true: só a 1ª ocorrência fica Confirmado (e é a única confirmável)', () => {
    expect(statusConfirmacaoLinha(linha('sch_dia', '2026-10-13'), ctx))
      .toEqual({ status: C, scheduleId: 'sch_dia', confirmavel: true })
    for (const d of ['2026-10-20', '2026-10-27', '2026-11-03']) {
      expect(statusConfirmacaoLinha(linha('sch_dia', d), ctx))
        .toEqual({ status: A, scheduleId: 'sch_dia', confirmavel: false })
    }
  })

  it('semanal com flag false: todas A confirmar, só a 1ª confirmável', () => {
    expect(statusConfirmacaoLinha(linha('sch_dia2', '2026-10-13'), ctx))
      .toEqual({ status: A, scheduleId: 'sch_dia2', confirmavel: true })
    expect(statusConfirmacaoLinha(linha('sch_dia2', '2026-10-20'), ctx))
      .toEqual({ status: A, scheduleId: 'sch_dia2', confirmavel: false })
  })

  it('após registrar 13/10, a semana seguinte vira a confirmável', () => {
    const pago = ag([{ id: 'sch_dia', confirmado: false, ...semanal, registered: ['2026-10-13'], nextOccurrence: '2026-10-20' }])
    expect(statusConfirmacaoLinha(linha('sch_dia', '2026-10-20'), pago))
      .toEqual({ status: A, scheduleId: 'sch_dia', confirmavel: true })
    expect(statusConfirmacaoLinha(linha('sch_dia', '2026-10-27'), pago).confirmavel).toBe(false)
  })

  it('pendência em atraso: a mais antiga pendente é a confirmável', () => {
    // 29/09 registrada; 06/10 em atraso é a próxima; 13/10 e seguintes não.
    expect(statusConfirmacaoLinha(linha('sch_atr', '2026-10-06'), ctx))
      .toEqual({ status: C, scheduleId: 'sch_atr', confirmavel: true })
    expect(statusConfirmacaoLinha(linha('sch_atr', '2026-10-13'), ctx))
      .toEqual({ status: A, scheduleId: 'sch_atr', confirmavel: false })
  })

  it('ocorrência pulada não conta: a seguinte vira a próxima', () => {
    const pulou = ag([{ id: 'sch_dia', confirmado: true, ...semanal, skipped: ['2026-10-13'] }])
    expect(statusConfirmacaoLinha(linha('sch_dia', '2026-10-20'), pulou).status).toBe(C)
  })

  it('provisão (_desp_): mesma regra pela ocorrência da provisão', () => {
    expect(statusConfirmacaoLinha(linha('sch_prov', '2026-11-01', '_desp_'), ctx))
      .toEqual({ status: C, scheduleId: 'sch_prov', confirmavel: true })
    expect(statusConfirmacaoLinha(linha('sch_prov', '2026-12-01', '_desp_'), ctx))
      .toEqual({ status: A, scheduleId: 'sch_prov', confirmavel: false })
  })

  it('flag false na próxima → A confirmar confirmável', () => {
    expect(statusConfirmacaoLinha(linha('sch_luz', '2026-10-20'), ctx))
      .toEqual({ status: A, scheduleId: 'sch_luz', confirmavel: true })
  })

  it('lançamento realizado ou futuro → —', () => {
    expect(statusConfirmacaoLinha({ _key: 'tx1', real: true }, ctx)).toBeNull()
    expect(statusConfirmacaoLinha({ _key: 'tx2', real: false, _lancamento: true }, ctx)).toBeNull()
    expect(statusConfirmacaoLinha({ _key: 'tx3', real: true, _scheduleId: 'sch_dia' }, ctx)).toBeNull()
  })

  it('envelope → —', () => {
    expect(statusConfirmacaoLinha({ _key: 'env_e1_2026-10-31', _envelope: true, real: false }, ctx)).toBeNull()
  })

  it('resgate previsto (_resg_, sch:… ou agendamento de motor) → —', () => {
    expect(statusConfirmacaoLinha({ _key: 'sch_prov_resg_2026-11-01', _scheduleId: 'sch_prov', real: false }, ctx)).toBeNull()
    expect(statusConfirmacaoLinha({ _key: 'sch:sch_dia@2026-10-13', _scheduleId: 'sch_dia' }, ctx)).toBeNull()
    expect(statusConfirmacaoLinha({ _key: 'fsch_x_2026-10-05', _scheduleId: 'fsch_x', real: false }, ctx)).toBeNull()
  })

  it('provisório e saldo inicial → —', () => {
    expect(statusConfirmacaoLinha({ _key: 'prov_p1', _provisorio: { id: 'p1' }, real: false }, ctx)).toBeNull()
    expect(statusConfirmacaoLinha(null, ctx)).toBeNull()
    expect(statusConfirmacaoLinha({ _key: 'saldo_inicial' }, ctx)).toBeNull()
  })

  it('agendamento que não está mais no estado → —', () => {
    expect(statusConfirmacaoLinha({ _key: 'sch_zz_2026-10-01', _scheduleId: 'sch_zz' }, ctx)).toBeNull()
  })
})
