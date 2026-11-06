import { describe, it, expect } from 'vitest'
import { projetarPlano, custoAtualPorCota, LIMITE_ISENCAO_PEQUENO_VALOR, AVISO_ISENCAO } from './planoVendaConsorcio.js'
import { previsoesDasFuncoes } from './previsaoReserva.js'

const cota = (numero, plano_mes, plano_valor, extra = {}) => ({ numero, valor_parcela_cheia: 400, percentual_parcela: 100, plano_mes, plano_valor, ...extra })
const HOJE = '2026-11-06'
const base = { hoje: HOJE, custoPorCota: [1000, 1000, 1000] }

describe('projeção', () => {
  it('3 cotas em meses diferentes: sem aviso; cada cota paga até o mês da venda', () => {
    const r = projetarPlano({ ...base, cotas: [cota('1', '2027-01', 20000), cota('2', '2027-02', 20000), cota('3', '2027-03', 20000)] })
    expect(r.avisos).toEqual([])
    expect(r.meses.map(m => m.mes)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02', '2027-03'])
    expect(r.meses.map(m => m.parcelas)).toEqual([1200, 1200, 1200, 800, 400])
    expect(r.meses.map(m => m.vendas)).toEqual([0, 0, 20000, 20000, 20000])
    expect(r.resultado.ganhoPorCota).toEqual([
      { numero: '1', mes: '2027-01', venda: 20000, custo: 2200, ganho: 17800 },
      { numero: '2', mes: '2027-02', venda: 20000, custo: 2600, ganho: 17400 },
      { numero: '3', mes: '2027-03', venda: 20000, custo: 3000, ganho: 17000 },
    ])
    expect(r.resultado.ganhoTotal).toBe(52200)
  })
  it('as mesmas 3 no mesmo mês: o aviso aparece, com o texto e o total', () => {
    const r = projetarPlano({ ...base, cotas: [cota('1', '2027-01', 20000), cota('2', '2027-01', 20000), cota('3', '2027-01', 20000)] })
    expect(r.avisos).toEqual([{ mes: '2027-01', total: 60000, texto: AVISO_ISENCAO }])
    expect(AVISO_ISENCAO).toContain('Confirme com seu contador')
  })
  it('exatamente no limite não avisa; um centavo acima, avisa', () => {
    expect(projetarPlano({ hoje: HOJE, cotas: [cota('1', '2027-01', LIMITE_ISENCAO_PEQUENO_VALOR)] }).avisos).toEqual([])
    expect(projetarPlano({ hoje: HOJE, cotas: [cota('1', '2027-01', LIMITE_ISENCAO_PEQUENO_VALOR + 0.01)] }).avisos).toHaveLength(1)
  })
  it('cota já vendida fica fora: sem parcela, sem venda, sem ganho', () => {
    const r = projetarPlano({ ...base, cotas: [cota('1', '2027-01', 20000, { vendida_em: '2026-10-01' }), cota('2', '2027-01', 20000)] })
    expect(r.cotasAtivas).toEqual(['2'])
    expect(r.meses[0].parcelas).toBe(400)
    expect(r.meses.at(-1).vendas).toBe(20000)
    expect(r.resultado.ganhoPorCota.map(g => g.numero)).toEqual(['2'])
  })
  it('consórcio inteiro vendido: nada a projetar', () => {
    const r = projetarPlano({ ...base, consorcioVendido: true, cotas: [cota('1', '2027-01', 20000)] })
    expect(r.meses).toEqual([])
    expect(r.cotasAtivas).toEqual([])
  })
  it('sem função vinculada: mostra só o bem, sem saldo', () => {
    const r = projetarPlano({ ...base, cotas: [cota('1', '2027-01', 20000)] })
    expect(r.temFuncao).toBe(false)
    expect(r.meses.every(m => m.saldoFuncao === null)).toBe(true)
    expect(r.resultado.saldoFinal).toBeNull()
    expect(r.resultado.ganhoTotal).toBeGreaterThan(0)
  })
  it('com função: parcelas, depósitos, saídas e vendas entram no saldo', () => {
    const previsoes = [
      { tipo: 'deposito', date: '2026-12-10', amount: 1000 },
      { tipo: 'resgate', date: '2026-12-20', amount: 300 },
      { tipo: 'provisao', date: '2027-01-05', amount: 100 },
    ]
    const r = projetarPlano({ hoje: HOJE, cotas: [cota('1', '2027-01', 5000)], funcao: { saldo: 2000 }, previsoes })
    expect(r.meses.map(m => m.saldoFuncao)).toEqual([1600, 1900, 6400])
    expect(r.meses[1]).toMatchObject({ entradasPrevistas: 1000, saidasPrevistas: 300 })
    expect(r.resultado.saldoFinal).toBe(6400)
  })
  it('sem mês previsto: nada a projetar, e a cota continua ativa', () => {
    const r = projetarPlano({ hoje: HOJE, cotas: [cota('1', null, null)] })
    expect(r.meses).toEqual([])
    expect(r.cotasAtivas).toEqual(['1'])
  })
  it('cota sem mês paga até a última venda das outras; prazo acabando para a parcela', () => {
    const r = projetarPlano({ hoje: HOJE, cotas: [cota('1', '2027-01', 1000), cota('2', null, null)], restantesPorCota: [null, 1] })
    expect(r.meses.map(m => m.parcelas)).toEqual([800, 400, 400])
  })
  it('parcela do mês já paga: as parcelas começam no mês seguinte', () => {
    const r = projetarPlano({ hoje: HOJE, cotas: [cota('1', '2027-01', 1000)], primeiroMesComParcela: '2026-12' })
    expect(r.meses.map(m => m.parcelas)).toEqual([0, 400, 400])
  })
  it('mês previsto que já passou não entra', () => {
    expect(projetarPlano({ hoje: HOJE, cotas: [cota('1', '2026-01', 1000)] }).meses).toEqual([])
  })
})

describe('custo por cota', () => {
  it('na proporção das parcelas pagas, e a soma fecha', () => {
    expect(custoAtualPorCota([{}, {}], 100, [3, 1])).toEqual([75, 25])
    const p = custoAtualPorCota([{}, {}, {}], 100, null)
    expect(p.reduce((s, x) => s + x, 0)).toBeCloseTo(100, 5)
  })
})

describe('previsões da função', () => {
  const accounts = [{ id: 'res', isReserva: true }, { id: 'cc' }]
  const ag = (id, extra) => ({ id, transactionType: 'transfer', amount: 100, reservaFuncaoId: 'f', ...extra })
  const prox = (datas) => () => datas
  it('depósito, resgate e provisão, em ordem de data e dentro da janela', () => {
    const schedules = [
      ag('dep', { accountId: 'cc', toAccountId: 'res', description: 'Depósito mensal', d: ['2026-12-01', '2027-06-01'] }),
      ag('res', { accountId: 'res', toAccountId: 'cc', description: 'Resgate', d: ['2026-11-20'] }),
      { id: 'prov', transactionType: 'expense', isProvisao: true, reservaFuncaoId: 'f', amount: 50, description: 'IPVA', d: ['2026-11-25'] },
    ]
    const r = previsoesDasFuncoes([{ id: 'f', accountId: 'res' }], { accounts, schedules, getNextOccurrences: (s) => prox(s.d)() }, { ini: '2026-11-06', fim: '2027-01-31' }).f
    expect(r.map(i => [i.tipo, i.date, i.amount])).toEqual([
      ['resgate', '2026-11-20', 100], ['provisao', '2026-11-25', 50], ['deposito', '2026-12-01', 100],
    ])
  })
})
