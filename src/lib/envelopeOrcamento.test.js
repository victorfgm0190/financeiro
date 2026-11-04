import { describe, it, expect } from 'vitest'
import {
  orcamentoDiario, aGastarEnvelope, cicloDaCompetencia, cicloDaData, ciclosNaFaixa, diasQueContam, diaInicioCiclo,
  historicoAoAlterar, configDoCiclo, envelopesParaProjecao, textoDaConta,
} from './envelopeOrcamento.js'
import { feriadosAtivos, pascoa, feriadosDoAno } from './feriados.js'

const SEG_SEX = [1, 2, 3, 4, 5]
const SEG_SAB = [1, 2, 3, 4, 5, 6]
const env = (o = {}) => ({ id: 'e', name: 'Almoço', tipoOrcamento: 'diario', valorDia: 40, diasSemana: SEG_SEX, descontarFeriados: true, categoryIds: ['cat'], history: [], ...o })
const fmt = (v) => `R$ ${v.toFixed(2).replace('.', ',')}`

describe('A) ciclo 15/10/2026 a 14/11/2026, R$ 40/dia, seg–sex, descontando feriados (02/11), em 04/11', () => {
  const ciclo = cicloDaData('2026-11-04', 15)
  const fer = feriadosAtivos([], ciclo.inicio, ciclo.fim)
  const conta = (gastos) => orcamentoDiario(env(), ciclo, { hoje: '2026-11-04', feriados: fer, gastos })
  it('ciclo, dias e orçamento', () => {
    expect(ciclo).toMatchObject({ inicio: '2026-10-15', fim: '2026-11-14' })
    expect(fer.has('2026-11-02')).toBe(true)
    const o = conta([])
    expect(o).toMatchObject({ dias: 21, orcamento: 840, diasPassados: 13, previstoAteOntem: 520, diasRestantes: 8 })
  })
  it('gasto até ontem 520 → A gastar 320', () => expect(conta([{ date: '2026-11-03', valor: 520 }]).aGastar).toBe(320))
  it('gasto até ontem 533 → excesso 13, A gastar 307 ("8 dias × R$ 40,00 - R$ 13,00 de excesso = R$ 307,00")', () => {
    const o = conta([{ date: '2026-10-20', valor: 500 }, { date: '2026-11-03', valor: 33 }])
    expect(o).toMatchObject({ excesso: 13, aGastar: 307 })
    expect(textoDaConta(o, fmt)).toBe('8 dias × R$ 40,00 - R$ 13,00 de excesso = R$ 307,00')
  })
  it('gasto até ontem 500 → A gastar 320 (a economia não soma)', () => {
    expect(conta([{ date: '2026-11-03', valor: 500 }])).toMatchObject({ economia: 20, excesso: 0, aGastar: 320 })
  })
  it('gasto até ontem 900 → A gastar 0, excesso 380 visível', () => {
    expect(conta([{ date: '2026-11-03', valor: 900 }])).toMatchObject({ excesso: 380, aGastar: 0 })
  })
})

describe('B) ciclo 15/11/2026 a 14/12/2026, R$ 40/dia, feriado 20/11', () => {
  const ciclo = cicloDaCompetencia(2026 * 12 + 10, 15)
  const fer = feriadosAtivos([], ciclo.inicio, ciclo.fim)
  const o = (e, hoje = '2026-11-10', gastos = []) => orcamentoDiario(env(e), ciclo, { hoje, feriados: fer, gastos })
  it('seg–sex sem descontar: 21 dias, 840', () => expect(o({ descontarFeriados: false })).toMatchObject({ dias: 21, orcamento: 840 }))
  it('seg–sex descontando: 20 dias, 800', () => expect(o({})).toMatchObject({ dias: 20, orcamento: 800 }))
  it('seg–sáb sem descontar: 25 dias, 1.000', () => expect(o({ diasSemana: SEG_SAB, descontarFeriados: false })).toMatchObject({ dias: 25, orcamento: 1000 }))
  it('seg–sáb descontando: 24 dias, 960', () => expect(o({ diasSemana: SEG_SAB })).toMatchObject({ dias: 24, orcamento: 960 }))
  it('ciclo futuro (hoje antes do início) entra com o orçamento inteiro', () => expect(o({}).aGastar).toBe(800))
  it('em 17/11 sem gastos: 19 dias restantes, A gastar 760', () => expect(o({}, '2026-11-17')).toMatchObject({ diasRestantes: 19, aGastar: 760 }))
  it('em 17/11 com 25 gastos hoje: 735; com 60: 700', () => {
    expect(o({}, '2026-11-17', [{ date: '2026-11-17', valor: 25 }]).aGastar).toBe(735)
    expect(o({}, '2026-11-17', [{ date: '2026-11-17', valor: 60 }]).aGastar).toBe(700)
  })
  it('em 17/11 com 55 gastos em 16/11 e nada hoje: excesso 15, A gastar 745', () => {
    expect(o({}, '2026-11-17', [{ date: '2026-11-16', valor: 55 }])).toMatchObject({ excesso: 15, aGastar: 745 })
  })
  it('passou um dia que conta sem gasto: ele sai do A gastar (não acumula)', () => {
    expect(o({}, '2026-11-18').aGastar).toBe(720)
  })
  it('ciclo encerrado: A gastar 0', () => expect(o({}, '2026-12-15', [{ date: '2026-11-17', valor: 10 }])).toMatchObject({ estado: 'encerrado', aGastar: 0, gasto: 10 }))
})

describe('C) demais casos', () => {
  it('gasto em domingo entra no gasto real e no excesso, sem mudar o orçamento', () => {
    const ciclo = cicloDaCompetencia(2026 * 12 + 10, 15)
    const fer = feriadosAtivos([], ciclo.inicio, ciclo.fim)
    // 22/11/2026 é domingo; em 24/11 (ter): passados = 16, 17, 18, 19, 23 = 5 → previsto 200.
    const r = orcamentoDiario(env(), ciclo, { hoje: '2026-11-24', feriados: fer, gastos: [{ date: '2026-11-22', valor: 230 }] })
    expect(r).toMatchObject({ orcamento: 800, gasto: 230, previstoAteOntem: 200, excesso: 30, diasRestantes: 15, aGastar: 570 })
  })
  it('virada de ano: ciclo 15/12/2026 a 14/01/2027 com Natal e Confraternização', () => {
    const ciclo = cicloDaData('2026-12-20', 15)
    expect(ciclo).toMatchObject({ inicio: '2026-12-15', fim: '2027-01-14' })
    const fer = feriadosAtivos([], ciclo.inicio, ciclo.fim)
    expect([...fer]).toEqual(['2026-12-25', '2027-01-01'])
    // seg–sex de 15/12/2026 a 14/01/2027 = 23 dias úteis; −2 feriados (sex 25/12 e sex 01/01) = 21.
    expect(orcamentoDiario(env(), ciclo, { hoje: '2026-12-15', feriados: fer }).dias).toBe(21)
  })
  it('mês corrido (calendário): ciclo do dia 1 ao último dia', () => {
    const d = diaInicioCiclo({ financialMonthMode: 'calendar', financialMonthStartDay: 15 })
    expect(d).toBe(1)
    expect(cicloDaData('2026-02-10', d)).toMatchObject({ inicio: '2026-02-01', fim: '2026-02-28' })
  })
  it('início do ciclo diferente do 15 (dia 5)', () => {
    expect(cicloDaData('2026-11-04', 5)).toMatchObject({ inicio: '2026-10-05', fim: '2026-11-04' })
    expect(ciclosNaFaixa('2026-11-01', '2026-12-31', 5).map(c => c.inicio)).toEqual(['2026-10-05', '2026-11-05', '2026-12-05'])
  })
  it('dias como lista (qualquer combinação), sem nomes fixos', () => {
    expect(diasQueContam('2026-11-16', '2026-11-22', [0, 3])).toEqual(['2026-11-18', '2026-11-22'])
  })
  it('regressão Mensal: A gastar = max(0, limite − gasto), como antes', () => {
    const m = { limitAmount: 300, tipoOrcamento: 'mensal' }
    expect(aGastarEnvelope(m, { gasto: 120 })).toBe(180)
    expect(aGastarEnvelope(m, { gasto: 400 })).toBe(0)
    expect(aGastarEnvelope({ limitAmount: 300 }, { ciclo: cicloDaData('2026-11-04', 15), gasto: 120 })).toBe(180)
  })
  it('Saldo Projetado: o diário vai ao cálculo protegido com limite = gasto da competência + A gastar; mensal intacto', () => {
    const mensal = { id: 'm', limitAmount: 300, categoryIds: ['cat'] }
    const tx = [{ id: 't1', type: 'expense', date: '2026-11-03', amount: 533, categoryId: 'cat' }]
    const r = envelopesParaProjecao([mensal, env()], {
      transactions: tx, rateios: null, startDay: 15, diaInicio: 15, referenceDate: new Date(2026, 10, 4),
      feriadosDe: (i, f) => feriadosAtivos([], i, f),
    })
    expect(r[0]).toBe(mensal)
    expect(r[1].limitAmount).toBe(533 + 307) // limite − gasto (533) = 307 = A gastar
  })
  it('alteração vale do ciclo atual em diante; ciclo encerrado mantém o orçamento que teve', () => {
    const antes = env({ valorDia: 40 })
    const depois = { ...antes, valorDia: 50 }
    const history = historicoAoAlterar(antes, depois, { inicioCicloAtual: '2026-11-15', congelar: [{ inicio: '2026-10-15', orcamento: 840, dias: 21 }] })
    const e = { ...depois, history }
    expect(configDoCiclo(e, '2026-10-15').valorDia).toBe(40)
    expect(configDoCiclo(e, '2026-11-15').valorDia).toBe(50)
    const anterior = cicloDaCompetencia(2026 * 12 + 9, 15)
    expect(orcamentoDiario(e, anterior, { hoje: '2026-11-20', feriados: new Set() })).toMatchObject({ orcamento: 840, dias: 21, congelado: true })
    // Sem mudança na configuração (ex.: só o nome) → nenhuma versão nova.
    expect(historicoAoAlterar(antes, { ...antes, name: 'X' }, { inicioCicloAtual: '2026-11-15' })).toEqual([])
  })
})

describe('feriados', () => {
  it('Páscoa e móveis', () => {
    expect(pascoa(2026)).toBe('2026-04-05')
    const ano = feriadosDoAno(2026, [])
    const por = Object.fromEntries(ano.map(f => [f.chave, f]))
    expect(por.sexta_santa).toMatchObject({ datas: ['2026-04-03'], ativo: true })
    expect(por.carnaval).toMatchObject({ datas: ['2026-02-16', '2026-02-17'], ativo: false })
    expect(por.corpus_christi).toMatchObject({ datas: ['2026-06-04'], ativo: false })
    expect(ano.filter(f => f.automatico && f.ativo)).toHaveLength(10)
  })
  it('cadastro: desligar nacional, ligar opcional, feriado municipal (data) e estadual (todo ano)', () => {
    const cad = [
      { id: '1', chave: 'finados', ativo: false },
      { id: '2', chave: 'carnaval', ativo: true },
      { id: '3', nome: 'Aniversário da cidade', abrangencia: 'municipal', data: '2026-11-10', ativo: true },
      { id: '4', nome: 'Data magna', abrangencia: 'estadual', dia_mes: '11-25', ativo: true },
      { id: '5', nome: 'Desligado', abrangencia: 'municipal', data: '2026-11-11', ativo: false },
    ]
    const s = feriadosAtivos(cad, '2026-01-01', '2027-12-31')
    expect(s.has('2026-11-02')).toBe(false)
    expect(s.has('2026-02-16') && s.has('2026-02-17')).toBe(true)
    expect(s.has('2026-11-10')).toBe(true)
    expect(s.has('2026-11-25') && s.has('2027-11-25')).toBe(true)
    expect(s.has('2026-11-11')).toBe(false)
  })
})
