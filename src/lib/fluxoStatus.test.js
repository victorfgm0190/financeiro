import { describe, it, expect } from 'vitest'
import { statusConfirmacaoLinha, STATUS_CONFIRMACAO } from './fluxoStatus'

const ag = (s) => ({ agPorId: new Map(s.map(x => [x.id, x])) })
const ctx = ag([
  { id: 'sch_dia', description: 'Diarista', confirmado: true },
  { id: 'sch_luz', description: 'Luz', confirmado: false },
  { id: 'sch_prov', description: 'IPVA', isProvisao: true },
  { id: 'fsch_x', tipo: 'resgate_reserva', confirmado: true },
])

describe('statusConfirmacaoLinha', () => {
  it('agendamento confirmado', () => {
    expect(statusConfirmacaoLinha({ _key: 'sch_dia_2026-10-13', _scheduleId: 'sch_dia', _origDate: '2026-10-13', real: false }, ctx))
      .toEqual({ status: STATUS_CONFIRMACAO.CONFIRMADO, scheduleId: 'sch_dia' })
  })

  it('agendamento a confirmar (flag ausente ou false)', () => {
    expect(statusConfirmacaoLinha({ _key: 'sch_luz_2026-10-20', _scheduleId: 'sch_luz', real: false }, ctx).status)
      .toBe(STATUS_CONFIRMACAO.A_CONFIRMAR)
    // despesa da provisão (_desp_) é o próprio agendamento
    expect(statusConfirmacaoLinha({ _key: 'sch_prov_desp_2026-11-01', _scheduleId: 'sch_prov', real: false }, ctx).status)
      .toBe(STATUS_CONFIRMACAO.A_CONFIRMAR)
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
