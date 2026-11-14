// O que acompanha o ajuste ao valor do banco (lib/ajusteValorBanco). Dados FICTÍCIOS.
import { describe, it, expect } from 'vitest'
import { planoDoAjuste, resgateDoLancamento } from './ajusteValorBanco.js'

const tx = { id: 't1', description: 'Seguro Parc4', amount: 74.3 }
const resgate = (o = {}) => ({ id: 'r1', tipo: 'resgate_reserva', accountId: 'res', toAccountId: 'cc', amount: 200, startDate: '2026-11-20', registered: [], overrides: { _sourceTxIds: ['t1', 't2'] }, ...o })
const linhas = [{ scheduleId: 'r1', reservaFuncaoId: 'fn_seg', valor: 74.3, sourceLancamentoId: 't1' }, { scheduleId: 'r1', reservaFuncaoId: 'fn_x', valor: 125.7, sourceLancamentoId: 't2' }]

describe('planoDoAjuste', () => {
  it('rateio reescalado para fechar no novo valor', () => {
    const p = planoDoAjuste({ tx, de: 74.3, para: 74.29, rateios: [{ categoriaId: 'a', valor: 50 }, { categoriaId: 'b', valor: 24.3 }] })
    expect(Math.round(p.rateio.reduce((s, l) => s + l.valor, 0) * 100) / 100).toBe(74.29)
    expect(p.resgate).toBeNull()
  })
  it('sem resgate (ex.: sem grupo gerencial): só o lançamento muda', () => {
    expect(planoDoAjuste({ tx, de: 74.3, para: 74.29, schedules: [] })).toEqual({ rateio: null, resgate: null })
  })
  it('resgate pendente: só a linha da função deste lançamento (o motor recalcula); executado: devolução', () => {
    expect(resgateDoLancamento('t1', [resgate()]).id).toBe('r1')
    const pend = planoDoAjuste({ tx, de: 74.3, para: 74.29, schedules: [resgate()], scheduleReservaFuncoes: linhas })
    expect(pend.resgate).toMatchObject({ executado: false, funcaoId: 'fn_seg', de: 74.3, para: 74.29, txAjuste: null })
    const exec = planoDoAjuste({ tx, de: 74.3, para: 74.31, schedules: [resgate({ registered: ['2026-11-20'] })], scheduleReservaFuncoes: linhas, hoje: '2026-11-21' })
    // Banco cobrou MAIS: complementar (sai da reserva, da função do lançamento).
    expect(exec.resgate.txAjuste).toMatchObject({ accountId: 'res', toAccountId: 'cc', amount: 0.01, reservaFuncaoId: 'fn_seg', date: '2026-11-21', dataOcorrencia: '2026-11-20' })
  })
  it('valor igual: nada acompanha', () => {
    expect(planoDoAjuste({ tx, de: 74.3, para: 74.3, schedules: [resgate()] })).toEqual({ rateio: null, resgate: null })
  })
})
