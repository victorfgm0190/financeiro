// Vencimento 29/30/31 em mês curto: posicaoDaFatura e a data do motor usam faturaToDate; para
// vencimento até o dia 28 o resultado é idêntico ao de antes. Lembretes de agendamentos em dias de
// calendário. Dados FICTÍCIOS.
import { describe, it, expect } from 'vitest'
import { posicaoDaFatura } from './cicloFatura.js'
import { faturaToDate } from './parcelas.js'
import { lembretesAgendamentos } from './lembretesAgendamentos.js'

// Fórmulas ANTIGAS (antes da correção), para comparar.
const concatAntiga = (ym, dueDay) => `${ym}-${String(dueDay).padStart(2, '0')}`
function janelaAntiga(startDay, mode, ref) {
  if (mode === 'calendar') return [new Date(ref.getFullYear(), ref.getMonth(), 1), new Date(ref.getFullYear(), ref.getMonth() + 1, 0)]
  if (ref.getDate() >= startDay) return [new Date(ref.getFullYear(), ref.getMonth(), startDay), new Date(ref.getFullYear(), ref.getMonth() + 1, startDay - 1)]
  return [new Date(ref.getFullYear(), ref.getMonth() - 1, startDay), new Date(ref.getFullYear(), ref.getMonth(), startDay - 1)]
}
function posicaoAntiga(ym, dueDay, startDay, mode, ref) {
  const [ini, fim] = janelaAntiga(startDay || 1, mode || 'custom', ref)
  const venc = new Date(`${concatAntiga(ym, dueDay || 10)}T00:00:00`)
  return venc < ini ? 'passada' : venc > fim ? 'futura' : 'atual'
}
const meses = []
for (let y = 2026; y <= 2028; y++) for (let m = 1; m <= 12; m++) meses.push(`${y}-${String(m).padStart(2, '0')}`)

describe('data do vencimento da fatura (motor)', () => {
  it('até o dia 28: faturaToDate = concatenação antiga, em todos os meses', () => {
    for (const ym of meses) for (let d = 1; d <= 28; d++) expect(faturaToDate(ym, d)).toBe(concatAntiga(ym, d))
  })
  it('29/30/31 em mês curto: último dia do mês', () => {
    expect(faturaToDate('2027-02', 31)).toBe('2027-02-28')
    expect(faturaToDate('2027-02', 29)).toBe('2027-02-28')
    expect(faturaToDate('2028-02', 30)).toBe('2028-02-29')
    expect(faturaToDate('2027-04', 31)).toBe('2027-04-30')
    expect(faturaToDate('2027-03', 31)).toBe('2027-03-31')
  })
})

describe('posicaoDaFatura', () => {
  it('vencimento 31 em fevereiro: a fatura de fevereiro é do ciclo de fevereiro, não de março', () => {
    const fev = new Date(2027, 1, 15)
    const mar = new Date(2027, 2, 15)
    expect(posicaoDaFatura('2027-02', 31, 1, 'calendar', fev)).toBe('atual')   // antes: 'futura' (03/03)
    expect(posicaoDaFatura('2027-02', 31, 1, 'calendar', mar)).toBe('passada') // antes: 'atual'
    expect(posicaoAntiga('2027-02', 31, 1, 'calendar', fev)).toBe('futura')
    expect(posicaoAntiga('2027-02', 31, 1, 'calendar', mar)).toBe('atual')
    expect(posicaoDaFatura('2028-02', 30, 1, 'custom', new Date(2028, 1, 29))).toBe('atual')
  })

  it('vencimento até o dia 28: idêntico ao de antes (todos os meses, modos e dias de início)', () => {
    let n = 0
    for (const ym of meses) {
      for (const dueDay of [1, 5, 10, 14, 20, 25, 28, null]) {
        for (const [startDay, mode] of [[1, 'calendar'], [1, 'custom'], [15, 'custom'], [28, 'custom']]) {
          for (const ref of [new Date(2026, 10, 7), new Date(2027, 1, 20), new Date(2027, 11, 31), new Date(2028, 1, 29)]) {
            expect(posicaoDaFatura(ym, dueDay, startDay, mode, ref)).toBe(posicaoAntiga(ym, dueDay, startDay, mode, ref))
            n++
          }
        }
      }
    }
    expect(n).toBeGreaterThan(4000)
  })
})

describe('lembretes de agendamentos (dias de calendário)', () => {
  const ag = (id, date, remindDaysBefore) => ({ id, remindDaysBefore, _prox: date })
  const proximas = (s) => [s._prox]
  const ids = (hoje, lista) => lembretesAgendamentos(lista, proximas, hoje).map(x => `${x.schedule.id}:${x.dias}`)

  it('hoje = 0, amanhã = 1; o lembrete de N dias cobre exatamente N dias', () => {
    const lista = [ag('ontem', '2026-11-06'), ag('hoje', '2026-11-07'), ag('amanha', '2026-11-08'), ag('d3', '2026-11-10'), ag('d4', '2026-11-11')]
    expect(ids('2026-11-07', lista)).toEqual(['hoje:0', 'amanha:1', 'd3:3'])
  })
  it('respeita remindDaysBefore; 0 desliga', () => {
    const lista = [ag('a', '2026-11-12', 5), ag('b', '2026-11-12', 4), ag('c', '2026-11-07', 0)]
    expect(ids('2026-11-07', lista)).toEqual(['a:5'])
  })
  it('vira de mês e de ano por data, sem hora', () => {
    expect(ids('2026-12-30', [ag('x', '2027-01-02')])).toEqual(['x:3'])
  })
})
