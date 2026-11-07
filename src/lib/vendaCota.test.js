import { describe, it, expect } from 'vitest'
import { custoEstimadoPorCota, planoVendaDaCota } from './consorcio.js'

const cota = (numero, extra = {}) => ({ numero, valor_parcela_cheia: 500, percentual_parcela: 100, ...extra })
const ag = (id, amount, description = 'Consórcio') => ({ id, amount, description, registered: [], skipped: [], overrides: {}, transactionType: 'transfer', toAccountId: 'bem' })
const ocs = (...datas) => () => datas

describe('custo por cota', () => {
  it('divide o pago entre as cotas e fecha com o total', () => {
    const r = custoEstimadoPorCota([cota('1'), cota('2'), cota('3')], 1000)
    expect(r.reduce((s, x) => s + x, 0)).toBeCloseTo(1000, 2)
    expect(r[0]).toBeCloseTo(333.33, 1)
  })
  it('baixa com cota informada é da cota', () => {
    const r = custoEstimadoPorCota([cota('1'), cota('2')], 1000, [{ cota_numero: '1', valor: 400, quantidade_parcelas: 1 }])
    expect(r[0]).toBeGreaterThanOrEqual(400)
    expect(r[0]).toBeCloseTo(700, 0)
    expect(r[1]).toBeCloseTo(300, 0)
  })
  it('cota vendida fica com o custo que saiu; o restante é das ativas', () => {
    const r = custoEstimadoPorCota([cota('1', { vendida_em: '2026-01-01', vendida_custo: 400 }), cota('2'), cota('3')], 1000)
    expect(r[0]).toBe(400)
    expect(r[1] + r[2]).toBeCloseTo(600, 2)
  })
  it('sem nada pago: zero', () => {
    expect(custoEstimadoPorCota([cota('1')], 0)).toEqual([0])
  })
})

describe('agendamentos na venda da cota', () => {
  const tres = [cota('1'), cota('2'), cota('3')]
  it('um agendamento cobrindo as cotas: reduz na proporção, a partir do mês seguinte, e o que vence antes fica', () => {
    const plano = planoVendaDaCota([ag('s', 1500)], tres, '1', '2026-10-10', ocs('2026-10-15', '2026-11-15', '2026-12-15'))
    expect(plano).toHaveLength(1)
    expect(plano[0]).toMatchObject({ id: 's', acao: 'reduzir', de: 1500, para: 1000, aPartirDe: '2026-11-01' })
    expect(plano[0].mudancas.amount).toBe(1000)
    expect(plano[0].mudancas.overrides).toEqual({ '2026-10-15': { amount: 1500 } })
  })
  it('venda em dezembro vira o ano', () => {
    expect(planoVendaDaCota([ag('s', 1500)], tres, '1', '2026-12-10', ocs('2027-01-15'))[0].aPartirDe).toBe('2027-01-01')
  })
  it('proporção respeita o valor de cada cota', () => {
    const cotas = [cota('1', { percentual_parcela: 50 }), cota('2')]
    expect(planoVendaDaCota([ag('s', 750)], cotas, '1', '2026-10-10', ocs('2026-11-15'))[0].para).toBe(500)
  })
  it('descrição cita a cota: encerra só o dela', () => {
    const lista = [ag('a', 500, 'Parcela cota 1'), ag('b', 500, 'Parcela cota 12'), ag('c', 500, 'Parcela cota nº 2')]
    const plano = planoVendaDaCota(lista, [cota('1'), cota('12'), cota('2')], '1', '2026-10-10', ocs('2026-11-15'))
    expect(plano.map(p => [p.id, p.acao])).toEqual([['a', 'encerrar']])
    expect(plano[0].mudancas.occurrenceType).toBe('installment')
  })
  it('um agendamento por cota, pelo valor da parcela: encerra o da cota', () => {
    const cotas = [cota('1', { valor_parcela_cheia: 300 }), cota('2', { valor_parcela_cheia: 500 })]
    const plano = planoVendaDaCota([ag('a', 300), ag('b', 500)], cotas, '2', '2026-10-10', ocs('2026-11-15'))
    expect(plano.map(p => [p.id, p.acao])).toEqual([['b', 'encerrar']])
  })
  it('última cota ativa: encerra tudo', () => {
    const cotas = [cota('1', { vendida_em: '2026-01-01' }), cota('2')]
    expect(planoVendaDaCota([ag('s', 500)], cotas, '2', '2026-10-10', ocs('2026-11-15'))[0].acao).toBe('encerrar')
  })
  it('cotas já vendidas não entram na proporção', () => {
    const cotas = [cota('1', { vendida_em: '2026-01-01' }), cota('2'), cota('3')]
    expect(planoVendaDaCota([ag('s', 1000)], cotas, '2', '2026-10-10', ocs('2026-11-15'))[0].para).toBe(500)
  })
  it('agendamento sem parcela pendente fica de fora', () => {
    expect(planoVendaDaCota([ag('s', 1500)], tres, '1', '2026-10-10', () => [])).toEqual([])
  })
})
