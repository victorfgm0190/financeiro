import { describe, it, expect } from 'vitest'
import {
  batimento, totaisDasCotas, parcelaDaCota, planoNovaParcela, planoEncerrar, fotoDosAgendamentos,
  simularSaida, cenariosDeSaida, taxaInterna, agendamentosDoBem,
} from './consorcio.js'
import { computeOccurrences } from './occurrences.js'

const cota = (numero, extra = {}) => ({
  numero, valor_carta: 100000, percentual_parcela: 50, valor_parcela_cheia: 683.4,
  saldo_devedor_informado: 120949.8, parcelas_pagas_informadas: 6, valor_pago_informado: 2049.87, ...extra,
})
const cotas = [cota('1929'), cota('1785'), cota('0897')]

describe('cotas e batimento', () => {
  it('meia parcela e total das cotas', () => {
    expect(parcelaDaCota(cotas[0])).toBe(341.7)
    expect(totaisDasCotas(cotas)).toMatchObject({ carta: 300000, saldoDevedor: 362849.4, parcelaMensal: 1025.1, parcelasInformadas: 18, valorPagoInformado: 6149.61, meiaParcela: true })
  })
  it('parcelas batem, mas a diferença de valor gera alerta', () => {
    expect(batimento(cotas, 6143.4)).toMatchObject({ parcelasFinup: 18, parcelasInformadas: 18, difParcelas: 0, difValor: -6.21, diverge: true })
  })
  it('sem divergência quando tudo bate; sem informação não há alerta', () => {
    expect(batimento(cotas, 6149.61).diverge).toBe(false)
    expect(batimento([cota('1', { parcelas_pagas_informadas: null, valor_pago_informado: null })], 500).diverge).toBe(false)
  })
  it('parcelas a menos no Finup', () => {
    expect(batimento(cotas, 5118.3)).toMatchObject({ parcelasFinup: 15, difParcelas: -3, diverge: true })
  })
})

describe('simulador de saída', () => {
  it('teste do pedido: 30 × 341,70 e venda de 23.000', () => {
    const r = simularSaida({ parcelaMensal: 341.7, mesContemplacao: 30, agioPct: 23, valorCarta: 100000, cdiAnualPct: 12 })
    expect(r.investido).toBe(10251)
    expect(r.proprio).toBe(10251)
    expect(r.recebido).toBe(23000)
    expect(r.lucro).toBe(12749)
    expect(r.taxaMensalPct).toBeGreaterThan(4.6)
    expect(r.taxaMensalPct).toBeLessThan(5)
    expect(r.retornoPct).toBeCloseTo(124.37, 1)
  })
  it('recursos próprios descontam terceiros e devoluções', () => {
    const historico = [{ total: 1025.1, proprio: 0 }, { total: 1025.1, proprio: 683.6 }]
    const r = simularSaida({ historico, parcelaMensal: 1000, mesContemplacao: 3, agioPct: 10, valorCarta: 100000 })
    expect(r).toMatchObject({ investido: 3050.2, proprio: 1683.6, recebido: 10000, lucro: 8316.4 })
  })
  it('compara com o CDI', () => {
    const r = simularSaida({ parcelaMensal: 100, mesContemplacao: 12, agioPct: 0, valorCarta: 0, cdiAnualPct: 12 })
    expect(r.noCdi).toBeGreaterThan(1200)
    expect(r.ganhoSobreCdi).toBeLessThan(0)
  })
  it('a TIR de um fluxo conhecido', () => {
    expect(taxaInterna([-100, 110])).toBeCloseTo(0.1, 6)
    expect(taxaInterna([-100, -100])).toBeNull()
  })
  it('cenários nos meses 12, 24, 30, 36, 48 e 60', () => {
    const c = cenariosDeSaida({ parcelaMensal: 341.7, agioPct: 23, valorCarta: 100000 })
    expect(c.map(x => x.meses)).toEqual([12, 24, 30, 36, 48, 60])
    expect(c[2].lucro).toBe(12749)
    expect(c[0].taxaMensalPct).toBeGreaterThan(c[5].taxaMensalPct)
  })
  it('sem desembolso próprio não há taxa', () => {
    expect(simularSaida({ historico: [{ total: 100, proprio: 0 }], mesContemplacao: 1, agioPct: 10, valorCarta: 1000 })).toMatchObject({ taxaMensalPct: null, retornoPct: null })
  })
})

describe('agendamentos do consórcio', () => {
  const s = {
    id: 'a', transactionType: 'transfer', toAccountId: 'bem', amount: 341.7, frequency: 'monthly', startDate: '2026-07-05',
    occurrenceType: 'continuous', registered: ['2026-07-05', '2026-08-05'], skipped: [], overrides: { '2026-12-05': { amount: 300 } }, nextOccurrence: '2026-09-05',
  }
  const occ = (x) => computeOccurrences(x, 6)

  it('nova parcela vale a partir da data; o pendente antes fica no valor antigo', () => {
    const [p] = planoNovaParcela([s], { valor: 400, data: '2026-11-01' }, occ)
    expect(p.mudancas.amount).toBe(400)
    expect(p.mudancas.overrides['2026-09-05']).toEqual({ amount: 341.7 })
    expect(p.mudancas.overrides['2026-10-05']).toEqual({ amount: 341.7 })
    expect(p.mudancas.overrides['2026-11-05']).toBeUndefined()
    expect(p.mudancas.overrides['2026-12-05']).toBeUndefined()
  })
  it('encerrar deixa sem pendências e mantém o agendamento', () => {
    const [p] = planoEncerrar([s])
    expect(computeOccurrences({ ...s, ...p.mudancas }, 5)).toEqual([])
  })
  it('a foto restaura exatamente o que o plano mudou', () => {
    const [foto] = fotoDosAgendamentos([s])
    const [p] = planoEncerrar([s])
    const depois = { ...s, ...p.mudancas }
    const campos = { ...foto }
    delete campos.id
    expect(computeOccurrences({ ...depois, ...campos }, 2)).toEqual(['2026-09-05', '2026-10-05'])
  })
  it('só as transferências para o bem', () => {
    expect(agendamentosDoBem([s, { ...s, id: 'b', toAccountId: 'itau' }, { ...s, id: 'c', transactionType: 'expense' }], 'bem').map(x => x.id)).toEqual(['a'])
  })
})
