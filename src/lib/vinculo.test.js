import { describe, it, expect } from 'vitest'
import { computeOccurrences } from './occurrences'
import { ocorrenciasProjetadas } from './scheduleBaixa'
import {
  candidatosDoLancamento, candidatosDaOcorrencia, planejarVinculo, planejarDesvinculo, planejarMesclagem, mapaVinculos, divergenciaVinculo,
} from './vinculo'

const next = (s, n) => computeOccurrences(s, n)
const INTERNET = {
  id: 'ag_net', description: 'Internet', payee: 'Provedor Net', transactionType: 'expense', accountId: 'cc', amount: 99.9,
  frequency: 'monthly', startDate: '2026-11-05', occurrenceType: 'continuous', registered: [], skipped: [], overrides: {}, categoryId: 'cat_net',
}
const AVULSO = { id: 'tx_net', type: 'expense', accountId: 'cc', amount: 99.9, date: '2026-11-06', description: 'Internet novembro', payee: 'Provedor Net', categoryId: 'cat_net' }
const OUTRO = { id: 'tx_mercado', type: 'expense', accountId: 'cc', amount: 230, date: '2026-11-06', description: 'Mercado', payee: 'Mercado Bom' }
const base = () => ({ schedules: [INTERNET], transactions: [AVULSO, OUTRO] })
const saldoProjetado = (d) => ocorrenciasProjetadas(d.schedules.find(s => s.id === 'ag_net'), 5).filter(x => x <= '2026-11-30').length

describe('vínculo manual — caso 1 (avulso × ocorrência pendente)', () => {
  it('candidatos ordenados por semelhança, nos dois sentidos', () => {
    const doTx = candidatosDoLancamento(AVULSO, { ...base(), getNextOccurrences: next })
    expect(doTx[0]).toMatchObject({ tipo: 'ocorrencia', scheduleId: 'ag_net', data: '2026-11-05' })
    const daOcc = candidatosDaOcorrencia(INTERNET, '2026-11-05', base())
    expect(daOcc.map(c => c.tx.id)).toEqual(['tx_net', 'tx_mercado'])
    expect(candidatosDaOcorrencia(INTERNET, '2026-11-05', { ...base(), busca: 'mercado' }).map(c => c.tx.id)).toEqual(['tx_mercado'])
  })

  it('1) vincular: ocorrência baixada pelo mesmo mecanismo da baixa, série avança, nada novo é criado', () => {
    const d = base()
    const p = planejarVinculo(d, { txId: 'tx_net', scheduleId: 'ag_net', data: '2026-11-05' })
    expect(p.ok).toBe(true)
    expect(p.schedule.registered).toEqual(['2026-11-05'])
    expect(p.schedule.registeredMeta['2026-11-05']).toMatchObject({ tipo: 'pago', lancamento_id: 'tx_net', vinculo: 'manual' })
    expect(next(p.schedule, 1)[0]).toBe('2026-12-05')
    expect(p.tx.dataOcorrencia).toBe('2026-11-05')
    const depois = { ...d, schedules: [p.schedule] }
    expect(saldoProjetado(d)).toBe(1)
    expect(saldoProjetado(depois)).toBe(0) // sai dos pendentes: o saldo conta só o lançamento real
    expect(mapaVinculos(depois.schedules).get('tx_net')[0]).toMatchObject({ scheduleId: 'ag_net', data: '2026-11-05' })
    expect(planejarVinculo({ ...depois, transactions: d.transactions }, { txId: 'tx_net', scheduleId: 'ag_net', data: '2026-12-05' }).ok).toBe(false)
  })

  it('2) desvincular: tudo volta como antes, sem perder dados', () => {
    const d = base()
    const p = planejarVinculo(d, { txId: 'tx_net', scheduleId: 'ag_net', data: '2026-11-05' })
    const depois = { schedules: [p.schedule], transactions: [p.tx, OUTRO] }
    const u = planejarDesvinculo(depois, { scheduleId: 'ag_net', data: '2026-11-05' })
    expect(u.ok).toBe(true)
    expect(u.schedule.registered).toEqual([])
    expect(u.schedule.registeredMeta).toEqual({})
    expect(u.schedule.overrides).toEqual({})
    expect(next(u.schedule, 1)[0]).toBe('2026-11-05')
    expect(u.tx).toMatchObject({ id: 'tx_net', amount: 99.9, dataOcorrencia: null })
  })

  it('4) valor diferente (1 centavo): diverge; manter o do lançamento grava na ocorrência, o do agendamento não', () => {
    const tx = { ...AVULSO, amount: 99.91 }
    const d = { schedules: [INTERNET], transactions: [tx] }
    expect(divergenciaVinculo(tx, INTERNET, '2026-11-05')).toMatchObject({ diverge: true, valor: { previsto: 99.9, real: 99.91 } })
    const real = planejarVinculo(d, { txId: 'tx_net', scheduleId: 'ag_net', data: '2026-11-05', manter: 'lancamento' })
    expect(real.schedule.overrides['2026-11-05']).toEqual({ amount: 99.91, date: '2026-11-06' })
    expect(real.schedule.amount).toBe(99.9) // próximas ocorrências não mudam
    const prev = planejarVinculo(d, { txId: 'tx_net', scheduleId: 'ag_net', data: '2026-11-05', manter: 'agendamento' })
    expect(prev.schedule.overrides).toEqual({})
    expect(prev.schedule.registeredMeta['2026-11-05']).toMatchObject({ valor_previsto: 99.9, valor_realizado: 99.91 })
    const volta = planejarDesvinculo({ schedules: [real.schedule], transactions: [real.tx] }, { scheduleId: 'ag_net', data: '2026-11-05' })
    expect(volta.schedule.overrides).toEqual({})
  })
})

describe('vínculo manual — caso 2 (avulso × parcela da série)', () => {
  const parcela = (n, extra = {}) => ({
    id: `seg_${n}`, type: 'expense', accountId: 'card', accountType: 'credit', amount: 150, date: `2026-${String(n).padStart(2, '0')}-15`,
    description: `SEGURO X ${n}/12`, payee: 'Seguro X', installmentNum: n, installmentTotal: 12, serieId: 'serie_seg', faturaMonthYear: '2026-12', ...extra,
  })
  const P10 = parcela(10)
  const AV = { id: 'av_seg', type: 'expense', accountId: 'card', accountType: 'credit', amount: 150.01, date: '2026-11-28', dateCartao: '2026-11-28', description: 'SEGURO X', payee: 'Seguradora X', faturaMonthYear: '2026-12', reconciled: true }

  it('a parcela aparece como candidata do avulso com "parcela X/Y – fatura"', () => {
    const c = candidatosDoLancamento(AV, { schedules: [], transactions: [P10, AV], closingDay: 25 })
    expect(c[0]).toMatchObject({ tipo: 'parcela', id: 'seg_10', num: 10, total: 12, fatura: '2026-12' })
  })

  it('3) mesclar: a parcela 10/12 fica, recebe o que foi escolhido, as baixas passam para ela', () => {
    const ag = { id: 'ag_seg', registered: ['2026-12-15'], registeredMeta: { '2026-12-15': { tipo: 'pago', lancamento_id: 'av_seg' } } }
    const p = planejarMesclagem({ transactions: [P10, AV], schedules: [ag] }, { avulsoId: 'av_seg', parcelaId: 'seg_10', campos: ['amount', 'payee'] })
    expect(p.ok).toBe(true)
    expect(p.changes).toEqual({ amount: 150.01, payee: 'Seguradora X', reconciled: true })
    expect(p.changes).not.toHaveProperty('installmentNum')
    expect(p.mudancas).toContainEqual({ campo: 'amount', de: 150, para: 150.01 })
    expect(p.mudancas).toContainEqual({ campo: 'mesclado_de', de: null, para: 'av_seg' })
    expect(p.schedules[0].registeredMeta['2026-12-15'].lancamento_id).toBe('seg_10')
    expect(p.rotulo).toBe('10/12')
  })

  it('recusa alvo que não é parcela de série ou de outra conta', () => {
    expect(planejarMesclagem({ transactions: [AV, OUTRO], schedules: [] }, { avulsoId: 'av_seg', parcelaId: 'tx_mercado' }).ok).toBe(false)
    expect(planejarMesclagem({ transactions: [AV, parcela(10, { accountId: 'card2' })], schedules: [] }, { avulsoId: 'av_seg', parcelaId: 'seg_10' }).ok).toBe(false)
  })
})

import { resolverLinhasRevisao, linhasAImportar } from './revisaoImportacao'
import { aplicarJaLancados } from './casamentoFatura'
import { aplicarCorrespondencias } from './importacaoCorrespondencias'

describe('5) Importar a fatura depois de mesclar', () => {
  it('a linha da parcela 10/12 casa com a parcela mantida — nada é duplicado', () => {
    const P10 = { id: 'seg_10', type: 'expense', accountId: 'card', accountType: 'credit', amount: 150, date: '2026-11-15', description: 'SEGURO X 10/12', payee: 'Seguro X', installmentNum: 10, installmentTotal: 12, serieId: 's', faturaMonthYear: '2026-12' }
    const AV = { id: 'av', type: 'expense', accountId: 'card', accountType: 'credit', amount: 150, date: '2026-11-28', description: 'SEGURO X', faturaMonthYear: '2026-12' }
    const p = planejarMesclagem({ transactions: [P10, AV], schedules: [] }, { avulsoId: 'av', parcelaId: 'seg_10', campos: ['amount'] })
    const depois = [{ ...P10, ...p.changes }] // avulso removido
    const accounts = [{ id: 'card', type: 'credit', closingDay: 25 }]
    const rows = [{ _id: 'L', type: 'expense', selected: true, faturaMonthYear: '2026-12', description: 'SEGURO X 10/12', amount: 150, date: '2026-11-28', _dateCartao: '2026-11-28', _installment: { num: 10, total: 12 } }]
    const base = resolverLinhasRevisao(rows, { accountId: 'card', transactions: depois, closingDay: 25 })
    const out = aplicarCorrespondencias(aplicarJaLancados(base, { transactions: depois, accountId: 'card', closingDay: 25 }), { transactions: depois, accounts, accountId: 'card' })
    expect(linhasAImportar(out)).toEqual([])
    expect(out[0]._dbTx?.id || out[0]._collisionTx?.id).toBe('seg_10')
  })
})
