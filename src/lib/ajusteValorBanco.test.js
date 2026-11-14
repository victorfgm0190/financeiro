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
    expect(planoDoAjuste({ tx, de: 74.3, para: 74.29, schedules: [] })).toEqual({ rateio: null, resgate: null, gerencial: null })
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
    expect(planoDoAjuste({ tx, de: 74.3, para: 74.3, schedules: [resgate()] })).toEqual({ rateio: null, resgate: null, gerencial: null })
  })
})

describe('planoDoAjuste — grupo G (devolução gerencial)', () => {
  const G = [{ id: 'grp_1', number: 1 }, { id: 'grp_2', number: 2 }, { id: 'grp_D', number: 'D' }]
  const card = { id: 'card', closingDay: 13 }
  const compra = { id: 'c1', type: 'expense', accountId: 'card', amount: 100, faturaMonthYear: '2026-10', grupoGerencial: 'grp_1', description: 'Loja 2/3' }
  const etapa = { id: 'tx_ger_9', type: 'transfer', accountId: 'cc', toAccountId: 'ger', amount: 100, sourceExpenseId: 'c1', parentTxId: 'c1', origin: 'gerencial_auto' }
  const dev = (registered) => ({ id: 'dev10', tipo: 'gerencial_devolucao', accountId: 'ger', toAccountId: 'cc', amount: 100, cardId: 'card', faturaMesAno: '2026-10', registered, sourceExpenseIds: ['c1'] })
  const plano = (o = {}) => planoDoAjuste({ tx: compra, de: 100, para: 101, hoje: '2026-11-14', transactions: [compra, etapa], gerencialGroups: G, card, schedules: [dev(['2026-10-20'])], ...o })

  it('executada: ajuste na fatura da COMPRA (10/2026), não na do mês atual, ligado à devolução e à compra', () => {
    const g = plano().gerencial
    expect(g).toMatchObject({ executada: true, etapaDe: 100, etapaPara: 101 })
    expect(g.txAjuste).toMatchObject({ accountId: 'ger', toAccountId: 'cc', amount: 1, faturaRef: '10/2026', date: '2026-11-14', sourceScheduleId: 'dev10', dataOcorrencia: '2026-10-20', parentTxId: 'c1', origin: 'resgate_ajuste' })
    // Não parece etapa A (o motor de integridade não a confunde) nem tem grupo (não bloqueia o Executar Gerenciais).
    expect(g.txAjuste.sourceExpenseId).toBeUndefined()
    expect(g.txAjuste.grupoGerencial).toBeUndefined()
  })
  it('banco cobrou menos: o ajuste entra na Ger.', () => {
    expect(plano({ para: 99 }).gerencial.txAjuste).toMatchObject({ accountId: 'cc', toAccountId: 'ger', amount: 1 })
  })
  it('devolução agendada (ou pulada, sem dinheiro movido): sem ajuste — o motor recalcula', () => {
    expect(plano({ schedules: [dev([])] }).gerencial).toMatchObject({ executada: false, txAjuste: null })
  })
  it('controle gerencial desligado, outro grupo ou sem etapa A: nada gerencial', () => {
    expect(plano({ gerencialLigado: false }).gerencial).toBeNull()
    expect(planoDoAjuste({ tx: { ...compra, grupoGerencial: 'grp_2' }, de: 100, para: 101, transactions: [compra, etapa], gerencialGroups: G, card, schedules: [dev(['x'])] }).gerencial).toBeNull()
    expect(plano({ transactions: [compra] }).gerencial).toBeNull()
  })
})
