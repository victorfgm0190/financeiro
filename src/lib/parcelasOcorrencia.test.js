import { describe, it, expect } from 'vitest'
import {
  dividirTotal, textoDivisao, ehParcelado, ehUnicaParcelada, frequenciaExibida, normalizarUnica, maxParcelas, erroLimiteParcelas,
  parcelasDaSerie, parcelaDaData, dataDaParcela, agruparPorOcorrencia, planoParcelamento, erroEdicaoOcorrencia,
  temOcorrenciaDepois, valorDeReferencia, ESCOPO_OCORRENCIA,
} from './parcelasOcorrencia'
import { computeOccurrences, computePendingUpTo, registerAndAdvance } from './occurrences'
import { occEfetiva } from './fluxoCaixa'
import { getNumeroParcela, rotuloParcela } from './numeroParcela'
import { previstosDaFatura, parseFontePrevisto, resolverFontePrevista, projecoesEtapaA } from './gerencialPrevistos'
import { isResgatePagoParaGasto } from './resgates'
import { faturaDaData, desfazerBaixa } from './scheduleBaixa'
import { opcoesAplicarData } from './fluxoCaixaDatas'
import { casaAgendamento } from './agendamentoManda'

const seguro = (over = {}) => ({
  id: 'sch_seg', description: 'Seguro Carro', transactionType: 'expense', accountId: 'card', amount: 2800,
  frequency: 'annual', startDate: '2027-03-25', occurrenceType: 'continuous', installments: 0,
  parcelasPorOcorrencia: 12, registered: [], skipped: [], overrides: {}, ...over,
})
const soma = (l) => Math.round(l.reduce((a, b) => a + b, 0) * 100) / 100

describe('dividirTotal', () => {
  it('trunca a parcela, a diferença vai na 1ª e a soma é o total', () => {
    const v = dividirTotal(2800, 12)
    expect(v[0]).toBe(233.37)
    expect(v.slice(1).every(x => x === 233.33)).toBe(true)
    expect(soma(v)).toBe(2800)
  })
  it.each([[100, 3], [1000.01, 7], [0.1, 3], [99.99, 12], [2800, 18]])('soma exata de %s em %sx', (t, n) => {
    expect(soma(dividirTotal(t, n))).toBe(t)
  })
  it('texto da tela', () => {
    const f = (v) => `R$ ${v.toFixed(2)}`
    expect(textoDivisao(2800, 12, f)).toBe('12x de R$ 233.33 (1ª parcela R$ 233.37)')
    expect(textoDivisao(1200, 12, f)).toBe('12x de R$ 100.00')
  })
})

describe('limite de parcelas por frequência', () => {
  it.each([['annual', 12], ['semiannual', 6], ['quadrimestral', 4], ['quarterly', 3], ['bimonthly', 2]])('%s ≤ %s', (f, max) => {
    expect(maxParcelas(f)).toBe(max)
    expect(erroLimiteParcelas(f, max)).toBeNull()
    expect(erroLimiteParcelas(f, max + 1)).toMatch(`no máximo ${max} parcelas`)
  })
  it('Única não cruza com nada: sem o limite do período', () => {
    expect(erroLimiteParcelas('once', 48)).toBeNull()
    expect(maxParcelas('monthly')).toBe(1)
  })
})

describe('cenário do seguro: R$ 2.800, 25/03/2027, Anual, Sem fim, 12x', () => {
  const s = seguro()
  const datas = computeOccurrences(s, 24)
  it('24 parcelas, uma por mês, de mar/2027 a fev/2029', () => {
    expect(datas).toHaveLength(24)
    expect(new Set(datas).size).toBe(24)
    expect(datas[0]).toBe('2027-03-25')
    expect(datas[11]).toBe('2028-02-25')
    expect(datas[12]).toBe('2028-03-25')
    expect(datas[23]).toBe('2029-02-25')
  })
  it('valores: 1ª de cada ano 233,37; demais 233,33; soma por ano 2.800,00', () => {
    const valores = datas.map(d => occEfetiva(s, d).amount)
    expect(valores[0]).toBe(233.37)
    expect(valores[1]).toBe(233.33)
    expect(valores[12]).toBe(233.37)
    expect(soma(valores.slice(0, 12))).toBe(2800)
    expect(soma(valores.slice(12))).toBe(2800)
  })
  it('rótulo: parcela e ano de origem', () => {
    expect(rotuloParcela(s, '2027-05-25')).toBe('3/12 · ocorr. 2027')
    expect(rotuloParcela(s, '2028-03-25')).toBe('1/12 · ocorr. 2028')
    expect(getNumeroParcela(s, '2027-05-25')).toEqual({ numero: 3, total: 12 })
  })
  it('agrupa por ocorrência', () => {
    const g = agruparPorOcorrencia(s, datas)
    expect(g.map(x => [x.ano, x.parcelas.length, x.total])).toEqual([['2027', 12, 2800], ['2028', 12, 2800]])
  })
  it('sem colisão de data e cada data volta à sua parcela', () => {
    for (const d of datas) {
      const p = parcelaDaData(s, d)
      expect(dataDaParcela(s, p.ocorrencia, p.numero)).toBe(d)
    }
    expect(parcelaDaData(s, '2027-03-26')).toBeNull()
    expect(parcelaDaData(s, '2027-02-25')).toBeNull()
  })
})

describe('datas', () => {
  it('mês sem o dia → último dia, sem encadear', () => {
    const s = seguro({ startDate: '2027-01-31', amount: 300, parcelasPorOcorrencia: 3, frequency: 'quarterly' })
    expect(computeOccurrences(s, 7)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30', '2027-05-31', '2027-06-30', '2027-07-31'])
  })
  it('Nº de ocorrências limita os anos, não as parcelas', () => {
    const s = seguro({ occurrenceType: 'installment', installments: 2 })
    const datas = computeOccurrences(s, 100)
    expect(datas).toHaveLength(24)
    expect(datas[23]).toBe('2029-02-25')
    expect(parcelasDaSerie(s)).toHaveLength(24)
  })
  it('parcelas menores que o período deixam meses livres', () => {
    const s = seguro({ parcelasPorOcorrencia: 3, amount: 900 })
    expect(computeOccurrences(s, 4)).toEqual(['2027-03-25', '2027-04-25', '2027-05-25', '2028-03-25'])
  })
  it('computePendingUpTo devolve só até a data, sem as baixadas', () => {
    const s = seguro({ registered: ['2027-03-25'] })
    expect(computePendingUpTo(s, '2027-06-30')).toEqual(['2027-04-25', '2027-05-25', '2027-06-25'])
  })
})

describe('Única em N parcelas', () => {
  const form = { frequency: 'once', parcelasPorOcorrencia: 24, amount: 2400, startDate: '2027-01-10', occurrenceType: 'continuous', installments: 0, registered: [], skipped: [], overrides: {}, id: 'x' }
  const gravado = normalizarUnica(form)
  it('grava como Anual + 1 ocorrência e continua sendo "Única" na tela', () => {
    expect(gravado).toMatchObject({ frequency: 'annual', occurrenceType: 'installment', installments: 1 })
    expect(ehUnicaParcelada(gravado)).toBe(true)
    expect(frequenciaExibida(gravado)).toBe('once')
  })
  it('gera todas as parcelas, mesmo acima de 12, e não repete', () => {
    const d = computeOccurrences(gravado, 100)
    expect(d).toHaveLength(24)
    expect(d[23]).toBe('2028-12-10')
    expect(rotuloParcela(gravado, d[13])).toBe('14/24')
    expect(temOcorrenciaDepois(gravado, '2027-01-10')).toBe(false)
  })
  it('Única sem parcelas continua como está', () => {
    const u = normalizarUnica({ ...form, parcelasPorOcorrencia: 1 })
    expect(u.frequency).toBe('once')
    expect(ehParcelado(u)).toBe(false)
  })
})

describe('agendamento existente (N = 1) não muda', () => {
  const antigo = { id: 'a', amount: 500, frequency: 'annual', startDate: '2027-03-25', occurrenceType: 'installment', installments: 12, registered: [], skipped: [], overrides: {} }
  it('Anual + 12 ocorrências segue sendo 12 anos, com o valor inteiro', () => {
    expect(ehParcelado(antigo)).toBe(false)
    expect(computeOccurrences(antigo, 3)).toEqual(['2027-03-25', '2028-03-25', '2029-03-25'])
    expect(occEfetiva(antigo, '2028-03-25').amount).toBe(500)
    expect(rotuloParcela(antigo, '2028-03-25')).toBe('2/12')
    expect(valorDeReferencia(antigo)).toBe(500)
  })
})

describe('pagar, pular e estornar valem para uma parcela', () => {
  const s = seguro()
  it('registra uma parcela e avança para a seguinte, sem re-ancorar a série', () => {
    const r = registerAndAdvance(s, ['2027-03-25'])
    expect(r.nextOccurrence).toBe('2027-04-25')
    expect(computeOccurrences(r, 2)).toEqual(['2027-04-25', '2027-05-25'])
    expect(occEfetiva(r, '2027-04-25').amount).toBe(233.33)
    expect(rotuloParcela(r, '2027-04-25')).toBe('2/12 · ocorr. 2027')
  })
  it('estorno reabre só aquela parcela', () => {
    const r = desfazerBaixa(registerAndAdvance(s, ['2027-03-25', '2027-04-25']), '2027-04-25')
    expect(r.registered).toEqual(['2027-03-25'])
    expect(computeOccurrences(r, 1)).toEqual(['2027-04-25'])
  })
  it('pulada some da lista e as demais mantêm a numeração', () => {
    const r = seguro({ skipped: ['2027-04-25'] })
    expect(computeOccurrences(r, 2)).toEqual(['2027-03-25', '2027-05-25'])
    expect(rotuloParcela(r, '2027-05-25')).toBe('3/12 · ocorr. 2027')
  })
  it('exceção de uma parcela: data e valor só nela', () => {
    const r = seguro({ overrides: { '2027-05-25': { date: '2027-05-30', amount: 250 } } })
    expect(occEfetiva(r, '2027-05-25')).toEqual({ date: '2027-05-30', amount: 250 })
    expect(occEfetiva(r, '2027-06-25').amount).toBe(233.33)
  })
  it('lançamento só casa com o valor da parcela, não com o total', () => {
    const base = { type: 'expense', payee: '', description: 'Seguro Carro' }
    expect(casaAgendamento({ ...base, amount: 233.37 }, s)).toBe(true)
    expect(casaAgendamento({ ...base, amount: 2800 }, s)).toBe(false)
  })
})

describe('reserva: uma fonte por parcela, na fatura da parcela', () => {
  const s = seguro({ grupoGerencial: 'g_ca', reservaFuncaoId: 'fn_seg' })
  const closing = 14
  const faturaDe = (d) => faturaDaData(d, closing)
  const nasFaturas = (sch, faturas) => faturas.map(fm => previstosDaFatura({
    schedules: [sch], cardId: 'card', faturaMesAno: fm, getOccurrences: computeOccurrences, faturaDe,
  }))
  it('cada fatura traz 1 parcela, com a função; a fatura de abr/27 é a da parcela de 25/03', () => {
    const [abr, mai] = nasFaturas(s, ['2027-04', '2027-05'])
    expect(abr).toHaveLength(1)
    expect(abr[0]).toMatchObject({ id: 'sch:sch_seg@2027-03-25#1', valor: 233.37, reservaFuncaoId: 'fn_seg', date: '2027-03-25' })
    expect(mai[0]).toMatchObject({ id: 'sch:sch_seg@2027-03-25#2', valor: 233.33 })
    expect(nasFaturas(s, ['2028-04'])[0][0]).toMatchObject({ id: 'sch:sch_seg@2028-03-25#1', valor: 233.37 })
  })
  it('soma das faturas de um ano = 2.800,00', () => {
    const faturas = ['2027-04', '2027-05', '2027-06', '2027-07', '2027-08', '2027-09', '2027-10', '2027-11', '2027-12', '2028-01', '2028-02', '2028-03']
    expect(soma(nasFaturas(s, faturas).flat().map(p => p.valor))).toBe(2800)
  })
  it('duas parcelas movidas para o mesmo dia não se perdem nem duplicam', () => {
    const m = seguro({ overrides: { '2027-05-25': { date: '2027-04-25' } } })
    const l = nasFaturas(m, ['2027-05'])[0]
    expect(l.map(p => p.id)).toEqual(['sch:sch_seg@2027-03-25#2', 'sch:sch_seg@2027-03-25#3'])
  })
  it('id ida e volta', () => {
    expect(parseFontePrevisto('sch:sch_seg@2027-03-25#3')).toEqual({ scheduleId: 'sch_seg', date: '2027-03-25', parcela: 3 })
    expect(parseFontePrevisto('sch:a@2026-10-20')).toEqual({ scheduleId: 'a', date: '2026-10-20' })
    const r = resolverFontePrevista('sch:sch_seg@2027-03-25#3', [s], computeOccurrences)
    expect(r).toMatchObject({ date: '2027-05-25', valor: 233.33, description: 'Seguro Carro' })
    const pago = resolverFontePrevista('sch:sch_seg@2027-03-25#1', [{ ...s, registered: ['2027-03-25'] }], computeOccurrences)
    expect(pago).toMatchObject({ date: '2027-03-25', valor: 233.37 })
  })
  it('parcela efetivada reconhece o resgate já executado sob o id sintético', () => {
    const resgate = { id: 'r1', tipo: 'resgate_reserva', sourceExpenseIds: ['sch:sch_seg@2027-03-25#1'], registered: ['2027-04-15'] }
    const tx = { id: 'tx1', scheduleId: 'sch_seg', date: '2027-03-25', dataOcorrencia: '2027-03-25' }
    expect(isResgatePagoParaGasto('tx1', [s, resgate], [tx])).toBe(true)
    const outra = { ...tx, id: 'tx2', dataOcorrencia: '2027-04-25', date: '2027-04-25' }
    expect(isResgatePagoParaGasto('tx2', [s, resgate], [outra])).toBe(false)
  })
  it('etapa A prevista (Grupo G): uma por parcela, com o valor da parcela', () => {
    const g = seguro({ grupoGerencial: 'g1' })
    const l = projecoesEtapaA({
      schedules: [g], gerencialGroups: [{ id: 'g1', number: 1 }], getOccurrences: computeOccurrences, limite: 3,
      accounts: [{ id: 'card', type: 'credit', profileId: 'p', apelido: 'C' }, { id: 'cc', type: 'checking', profileId: 'p', isContaCentral: true, ehCentral: true, central: true }],
    })
    if (l.length) {
      expect(l.map(x => x.amount)).toEqual([233.37, 233.33, 233.33])
      expect(new Set(l.map(x => x.id)).size).toBe(3)
    }
  })
})

describe('editar total e N', () => {
  const occ = '2027-03-25'
  it('novo total − já pago, dividido entre as pendentes: fecha exato', () => {
    const paga3 = seguro({ registered: ['2027-03-25', '2027-04-25', '2027-05-25'] })
    const r = planoParcelamento(paga3, { dataOcorrencia: occ, total: 3000, n: 12, escopo: ESCOPO_OCORRENCIA.SO_ESTA })
    const ano = parcelasDaSerie(r, { limite: 12 })
    expect(ano.slice(0, 3).map(p => p.valor)).toEqual([233.37, 233.33, 233.33])
    expect(ano[3].valor).toBe(255.57)
    expect(ano[4].valor).toBe(255.55)
    expect(soma(ano.map(p => p.valor))).toBe(3000)
    // Só este ano: o seguinte continua como a série.
    expect(occEfetiva(r, '2028-03-25').amount).toBe(233.37)
    expect(r.amount).toBe(2800)
  })
  it('N maior e menor recalculam só as pendentes', () => {
    const paga1 = seguro({ registered: ['2027-03-25'] })
    const menor = planoParcelamento(paga1, { dataOcorrencia: occ, total: 2800, n: 3, escopo: ESCOPO_OCORRENCIA.SO_ESTA })
    expect(parcelasDaSerie(menor, { limite: 3 }).map(p => p.valor)).toEqual([233.37, 1283.32, 1283.31])
    expect(soma(parcelasDaSerie(menor, { limite: 3 }).map(p => p.valor))).toBe(2800)
    expect(parcelaDaData(menor, '2027-06-25')).toBeNull()
  })
  it('nesta e nas próximas: base muda, anteriores ficam congeladas', () => {
    const s = seguro({ registered: parcelasDaSerie(seguro(), { limite: 12 }).map(p => p.data) })
    const r = planoParcelamento(s, { dataOcorrencia: '2028-03-25', total: 3600, n: 6, escopo: ESCOPO_OCORRENCIA.PROXIMAS })
    expect(r.amount).toBe(3600)
    expect(r.parcelasPorOcorrencia).toBe(6)
    expect(occEfetiva(r, '2027-03-25').amount).toBe(233.37)
    expect(occEfetiva(r, '2028-03-25').amount).toBe(600)
    expect(occEfetiva(r, '2029-03-25').amount).toBe(600)
    expect(computeOccurrences(r, 7)).toEqual(['2028-03-25', '2028-04-25', '2028-05-25', '2028-06-25', '2028-07-25', '2028-08-25', '2029-03-25'])
  })
  it('efetivada nunca muda, e N abaixo das pagas é recusado', () => {
    const paga3 = seguro({ registered: ['2027-03-25', '2027-04-25', '2027-05-25'] })
    expect(erroEdicaoOcorrencia(paga3, occ, { total: 2800, n: 2 })).toMatch('não pode ser menor que 3')
    expect(erroEdicaoOcorrencia(paga3, occ, { total: 100, n: 12 })).toMatch('novo total não pode ser menor')
    expect(erroEdicaoOcorrencia(paga3, occ, { total: 3000, n: 3 })).toMatch('não há parcela pendente')
    expect(erroEdicaoOcorrencia(paga3, occ, { total: 2800, n: 13 })).toMatch('no máximo 12')
    expect(() => planoParcelamento(paga3, { dataOcorrencia: occ, total: 2800, n: 2, escopo: ESCOPO_OCORRENCIA.SO_ESTA })).toThrow()
  })
  it('N diminuiu: exceção e pulo das parcelas que sumiram saem', () => {
    const s = seguro({ skipped: ['2027-12-25'], overrides: { '2027-11-25': { amount: 10 }, '2027-04-25': { date: '2027-04-20', amount: 9 } } })
    const r = planoParcelamento(s, { dataOcorrencia: occ, total: 600, n: 6, escopo: ESCOPO_OCORRENCIA.SO_ESTA })
    expect(r.skipped).toEqual([])
    expect(r.overrides['2027-11-25']).toBeUndefined()
    expect(r.overrides['2027-04-25']).toEqual({ date: '2027-04-20' })
  })
  it('só nesta ocorrência a partir de N = 1 mantém a série parcelada só naquele ano', () => {
    const s = { ...seguro({ parcelasPorOcorrencia: 1, amount: 1200, overrides: { _parcelamento: { '2027-03-25': { total: 1200, n: 12 } } } }) }
    expect(ehParcelado(s)).toBe(true)
    expect(computeOccurrences(s, 13)[12]).toBe('2028-03-25')
    expect(occEfetiva(s, '2028-03-25').amount).toBe(1200)
  })
})

describe('data da série no Fluxo de Caixa', () => {
  it('com baixa, a opção "série" fica bloqueada e explica o motivo', () => {
    const s = seguro({ registered: ['2027-03-25'], nextOccurrence: '2027-04-25' })
    const op = opcoesAplicarData(s, '2027-04-25', '2027-04-28', '2027-04-25')
    expect(op.serie.ok).toBe(false)
    expect(op.serie.motivo).toMatch('parcela baixada')
  })
})
