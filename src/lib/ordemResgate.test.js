// No mesmo dia, o RESGATE ligado vem antes da DESPESA: Fluxo de Caixa (principal e por conta usam
// computeFluxoCaixa; com datas simuladas, montarLinhasSimuladas), calendário e agenda do celular de
// Agendamentos, previsão da reserva. Dados fictícios.
import { describe, it, expect } from 'vitest'
import { computeFluxoCaixa } from './fluxoCaixa'
import { montarLinhasSimuladas } from './fluxoCaixaDatas'
import { porDia } from './agendaCalendario'
import { particionarAgenda } from './agendaMobile'
import { previsoesDasFuncoes } from './previsaoReserva'
import { computeOccurrences } from './occurrences'
import { novoResgateVinculado, idTxResgate } from './resgateVinculado'
import { resgatePrimeiro } from './ordemResgate'

const accounts = [
  { id: 'cc', name: 'Conta', type: 'checking' },
  { id: 'ca', name: 'Contas Anuais', type: 'savings', isReserva: true },
]
const gerencialGroups = [{ id: 'gCA', number: 2, alias: 'CA', name: 'Contas Anuais', defaultAccountId: 'ca' }]
const reserveFunctions = [{ id: 'fEsc', name: 'Escola', accountId: 'ca' }]
const despesa = {
  id: 'sch_esc', description: 'ESCOLA', transactionType: 'expense', accountId: 'cc', amount: 1268, frequency: 'monthly',
  startDate: '2027-01-08', occurrenceType: 'installment', installments: 3, grupoGerencial: 'gCA', reservaFuncaoId: 'fEsc',
  registered: [], skipped: [], overrides: {},
}
const resgate = novoResgateVinculado(despesa, { accounts, gerencialGroups, reserveFunctions })

describe('ordem resgate → despesa no mesmo dia', () => {
  it('Fluxo de Caixa (projetado): o resgate antes da despesa, nas duas ordens de cadastro', () => {
    for (const schedules of [[despesa, resgate], [resgate, despesa]]) {
      const fc = computeFluxoCaixa({
        accountIds: new Set(['cc']), currentBalance: 0, start: '2027-01-01', end: '2027-01-31', schedules,
        getNextOccurrences: (s, n) => computeOccurrences(s, n), includeSchedules: true,
      })
      const doDia = fc.rows.filter(r => r.date === '2027-01-08').map(r => r._scheduleId)
      expect(doDia).toEqual([resgate.id, 'sch_esc'])
    }
  })
  it('Fluxo de Caixa (registrado): o lançamento do resgate antes do da despesa', () => {
    const transactions = [
      { id: 'tx_desp', type: 'expense', accountId: 'cc', amount: 1268, date: '2027-01-08', scheduleId: 'sch_esc' },
      { id: idTxResgate(resgate.id, '2027-01-08'), type: 'transfer', accountId: 'ca', toAccountId: 'cc', amount: 1268, date: '2027-01-08' },
    ]
    const fc = computeFluxoCaixa({ accountIds: new Set(['cc']), currentBalance: 0, start: '2027-01-01', end: '2027-01-31', transactions, getNextOccurrences: () => [], includeSchedules: false })
    expect(fc.rows.filter(r => r.date === '2027-01-08').map(r => r._key)).toEqual([idTxResgate(resgate.id, '2027-01-08'), 'tx_desp'])
  })
  it('Fluxo com datas simuladas (Mudar data): mesma regra', () => {
    const rows = [
      { date: '2027-01-08', real: false, _key: 'sch_esc_2027-01-08', _scheduleId: 'sch_esc', entrada: 0, saida: 1268 },
      { date: '2027-01-08', real: false, _key: `${resgate.id}_2027-01-08`, _scheduleId: resgate.id, entrada: 1268, saida: 0 },
    ]
    const { rowsView } = montarLinhasSimuladas(rows, { start: '2027-01-01', end: '2027-01-31' })
    expect(rowsView.map(r => r._scheduleId)).toEqual([resgate.id, 'sch_esc'])
  })
  it('calendário e agenda do celular de Agendamentos', () => {
    const itens = [
      { schedule: despesa, data: '2027-01-08', amount: 1268, pago: false, proxima: true, grupo: 'despesa' },
      { schedule: resgate, data: '2027-01-08', amount: 1268, pago: false, proxima: true, grupo: 'resgate' },
    ]
    expect(porDia(itens).get('2027-01-08').itens.map(i => i.schedule.id)).toEqual([resgate.id, 'sch_esc'])
    const rows = [{ schedule: despesa, displayDate: '2027-01-08', nextDate: '2027-01-08' }, { schedule: resgate, displayDate: '2027-01-08', nextDate: '2027-01-08' }]
    expect(particionarAgenda(rows, '2026-12-01').pendentes.map(r => r.schedule.id)).toEqual([resgate.id, 'sch_esc'])
  })
  it('previsão da reserva: resgate antes de uma provisão no mesmo dia', () => {
    const prov = { id: 'prov', isProvisao: true, provisaoEfetivada: false, transactionType: 'expense', reservaFuncaoId: 'fEsc', frequency: 'once', startDate: '2027-01-08', amount: 50, registered: [], skipped: [], overrides: {} }
    const p = previsoesDasFuncoes(reserveFunctions, { accounts, schedules: [prov, resgate], getNextOccurrences: (s, n) => computeOccurrences(s, n) }, { ini: '2027-01-01', fim: '2027-01-31' })
    expect(p.fEsc[0].schedule.id).toBe(resgate.id)
  })
  it('extrato da conta: desempate do resgate antes (mesmo dia)', () => {
    const lista = [{ id: 'tx_desp', date: '2027-01-08' }, { id: idTxResgate(resgate.id, '2027-01-08'), date: '2027-01-08' }]
    expect(lista.sort((a, b) => a.date.localeCompare(b.date) || resgatePrimeiro(a, b)).map(t => t.id)[0]).toBe(idTxResgate(resgate.id, '2027-01-08'))
  })
})
