import { describe, it, expect } from 'vitest'
import { planoAgendamento, edicaoDeOcorrencia, ESCOPO } from './camposSerie'
import { linhasHistorico, itensPorEscopo } from './historico'
import { computeOccurrences, datasDaSerie } from './occurrences'
import { occEfetiva, proximaEfetiva } from './fluxoCaixa'
import { parteDaFuncaoNaOcorrencia } from './resgateComposicao'

// Caso real: MAYARA, mensal dia 28, contínua, 28/05..28/08 registradas, próxima 28/09.
const MAYARA = {
  id: 'sch_1781471551030', description: 'MAYARA', transactionType: 'expense', accountId: 'nugi',
  amount: 678.25, frequency: 'monthly', occurrenceType: 'continuous', startDate: '2026-05-28',
  nextOccurrence: '2026-09-28', registered: ['2026-05-28', '2026-06-28', '2026-07-28', '2026-08-28'],
  skipped: [], overrides: {},
}
const pend = (s) => computeOccurrences(s, 400)
// O que a prévia / Fluxo / Fatura mostram: data e valor EFETIVOS das próximas n.
const reais = (s, n = 4) => computeOccurrences(s, n).map(d => { const ef = occEfetiva(s, d); return [ef.date, ef.amount] })
// Mesmo caminho do chip da prévia e dos campos do formulário.
const editar = (s, occDate, changes, escopo) => {
  const pendentes = pend(s)
  const ed = edicaoDeOcorrencia(s, occDate, changes, pendentes)
  const plano = planoAgendamento(s, { occDate, mudancas: ed.mudancas, escopo, pendentes, proximasDoNovo: pend })
  return { ...ed, ...plano }
}
const datasOverride = (s) => Object.keys(s.overrides).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k))

describe('edição de data de uma ocorrência (28/09 → 16/10)', () => {
  it('há pendentes depois → precisa perguntar', () => {
    const ed = edicaoDeOcorrencia(MAYARA, '2026-09-28', { date: '2026-10-16', amount: 678.25 }, pend(MAYARA))
    expect(ed.perguntar).toBe(true)
    expect(ed.mudancas).toEqual([{ campo: 'date', de: '2026-09-28', para: '2026-10-16' }])
  })

  it('NÃO → só a exceção: 16/10 (editado), 28/10, 28/11, 28/12', () => {
    const { schedule: s } = editar(MAYARA, '2026-09-28', { date: '2026-10-16', amount: 678.25 }, ESCOPO.PARCELA)
    expect(s.overrides).toEqual({ '2026-09-28': { date: '2026-10-16' } })
    expect(s.nextOccurrence).toBe('2026-09-28')
    expect(reais(s)).toEqual([['2026-10-16', 678.25], ['2026-10-28', 678.25], ['2026-11-28', 678.25], ['2026-12-28', 678.25]])
  })

  it('SIM → re-ancora no dia 16: 16/10, 16/11, 16/12, 16/01, sem override residual', () => {
    const { schedule: s } = editar(MAYARA, '2026-09-28', { date: '2026-10-16', amount: 678.25 }, ESCOPO.PROXIMAS)
    expect(s.nextOccurrence).toBe('2026-10-16')
    expect(datasOverride(s)).toEqual([])
    expect(reais(s)).toEqual([['2026-10-16', 678.25], ['2026-11-16', 678.25], ['2026-12-16', 678.25], ['2027-01-16', 678.25]])
  })

  it('ocorrências registradas não mudam (SIM e NÃO)', () => {
    for (const esc of [ESCOPO.PARCELA, ESCOPO.PROXIMAS]) {
      const { schedule: s } = editar(MAYARA, '2026-09-28', { date: '2026-10-16', amount: 678.25 }, esc)
      expect(s.registered).toEqual(MAYARA.registered)
      for (const d of MAYARA.registered) expect(s.overrides[d]).toBeUndefined()
    }
  })

  it('SIM com pendentes ANTES da editada: as anteriores ficam; daqui pra frente, novo dia (não +N dias)', () => {
    // Edita a 3ª pendente (28/11 → 16/12); 28/09 e 28/10 continuam.
    const { schedule: s } = editar(MAYARA, '2026-11-28', { date: '2026-12-16', amount: 678.25 }, ESCOPO.PROXIMAS)
    expect(reais(s, 5).map(r => r[0])).toEqual(['2026-09-28', '2026-10-28', '2026-12-16', '2027-01-16', '2027-02-16'])
  })
})

describe('edição de valor de uma ocorrência', () => {
  it('NÃO → só ela muda', () => {
    const { schedule: s } = editar(MAYARA, '2026-09-28', { date: '2026-09-28', amount: 700 }, ESCOPO.PARCELA)
    expect(reais(s, 3)).toEqual([['2026-09-28', 700], ['2026-10-28', 678.25], ['2026-11-28', 678.25]])
  })

  it('SIM → esta e as seguintes; exceção de valor de uma seguinte é descartada e avisada', () => {
    const comExcecao = { ...MAYARA, overrides: { '2026-11-28': { amount: 650 } } }
    const r = editar(comExcecao, '2026-09-28', { date: '2026-09-28', amount: 700 }, ESCOPO.PROXIMAS)
    expect(r.conflitos).toEqual([{ data: '2026-11-28', campos: ['amount'] }])
    expect(r.schedule.amount).toBe(700)
    expect(reais(r.schedule, 3)).toEqual([['2026-09-28', 700], ['2026-10-28', 700], ['2026-11-28', 700]])
  })

  it('override sem amount nunca vira NaN', () => {
    const s = { ...MAYARA, overrides: { '2026-09-28': { date: '2026-10-16' } } }
    expect(Number.isFinite(Number(occEfetiva(s, '2026-09-28').amount))).toBe(true)
  })
})

describe('dia 31 em mês curto → último dia do mês', () => {
  const MENSAL15 = { ...MAYARA, startDate: '2026-12-15', nextOccurrence: '2027-01-15', registered: ['2026-12-15'] }
  it('SIM 15/01 → 31/01: 31/01, 28/02, 31/03, 30/04', () => {
    const { schedule: s } = editar(MENSAL15, '2027-01-15', { date: '2027-01-31', amount: 678.25 }, ESCOPO.PROXIMAS)
    expect(s.overrides._diaVencimento).toBe(31)
    expect(reais(s).map(r => r[0])).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30'])
  })
  it('depois de registrar 28/02 a série continua no 31 (não deriva para 28)', () => {
    const { schedule: s } = editar(MENSAL15, '2027-01-15', { date: '2027-01-31', amount: 678.25 }, ESCOPO.PROXIMAS)
    const aposFev = { ...s, registered: [...s.registered, '2027-01-31', '2027-02-28'], nextOccurrence: '2027-02-28' }
    expect(computeOccurrences(aposFev, 2)).toEqual(['2027-03-31', '2027-04-30'])
  })
  it('sem _diaVencimento o motor segue como antes (agendamentos existentes não mudam)', () => {
    expect(datasDaSerie('2027-01-31', 'monthly', 3)).toEqual(['2027-01-31', '2027-02-28', '2027-03-28'])
  })
})

describe('histórico nos dois escopos (chip da prévia e formulário)', () => {
  it('NÃO → linha de escopo parcela com a data da ocorrência; SIM → escopo próximas', () => {
    const mud = [{ campo: 'date', de: '2026-09-28', para: '2026-10-16' }]
    const nao = linhasHistorico({ entidade: 'agendamento', loteId: 'l1', serieKey: 'k', itens: itensPorEscopo([{ id: MAYARA.id, ocorrenciaData: '2026-09-28', mudancas: mud }], ESCOPO.PARCELA) })
    expect(nao).toHaveLength(1)
    expect(nao[0]).toMatchObject({ entidade_id: MAYARA.id, escopo: 'parcela', campo: 'date', valor_anterior: '2026-09-28', valor_novo: '2026-10-16', ocorrencia_data: '2026-09-28' })
    const sim = linhasHistorico({ entidade: 'agendamento', loteId: 'l2', serieKey: 'k', itens: itensPorEscopo([{ id: MAYARA.id, ocorrenciaData: null, mudancas: mud }], ESCOPO.PROXIMAS) })
    expect(sim).toHaveLength(1)
    expect(sim[0]).toMatchObject({ escopo: 'proximas', campo: 'date' })
  })
})

describe('telas que usam a próxima ocorrência / reservas', () => {
  it('proximaEfetiva devolve a data-base (chave) e a data/valor efetivos', () => {
    const s = { ...MAYARA, overrides: { '2026-09-28': { date: '2026-10-16', amount: 700 } } }
    expect(proximaEfetiva(s, computeOccurrences)).toEqual({ base: '2026-09-28', date: '2026-10-16', amount: 700 })
  })
  it('parte da função numa ocorrência: data efetiva e valor proporcional ao override', () => {
    const trf = { id: 't', amount: 1000, reservaFuncaoId: 'f1', overrides: { '2026-10-05': { date: '2026-11-02', amount: 500 } } }
    expect(parteDaFuncaoNaOcorrencia(trf, null, 'f1', '2026-10-05')).toEqual({ date: '2026-11-02', valor: 500 })
    const det = [{ reservaFuncaoId: 'f1', valor: 600 }, { reservaFuncaoId: 'f2', valor: 400 }]
    expect(parteDaFuncaoNaOcorrencia(trf, det, 'f1', '2026-10-05')).toEqual({ date: '2026-11-02', valor: 300 })
    expect(parteDaFuncaoNaOcorrencia(trf, det, 'f1', '2026-12-05')).toEqual({ date: '2026-12-05', valor: 600 })
  })
})

describe('pulos no "Sim" com data (re-ancoragem por posição)', () => {
  const comPulo = { ...MAYARA, skipped: ['2026-11-28'] }
  it('28/11 pulada; re-ancorar 28/09 → 16/10 com Sim → 16/11 continua pulada; 16/12 em diante normal', () => {
    const { schedule: s } = editar(comPulo, '2026-09-28', { date: '2026-10-16', amount: 678.25 }, ESCOPO.PROXIMAS)
    expect(s.skipped).toEqual(['2026-11-16'])
    expect(computeOccurrences(s, 4)).toEqual(['2026-10-16', '2026-12-16', '2027-01-16', '2027-02-16'])
  })
  it('sem dupla contagem: cada mês tem no máximo uma ocorrência e nenhuma data velha sobra', () => {
    const { schedule: s } = editar(comPulo, '2026-09-28', { date: '2026-10-16', amount: 678.25 }, ESCOPO.PROXIMAS)
    const occs = computeOccurrences(s, 24).map(d => occEfetiva(s, d).date)
    const meses = occs.map(d => d.slice(0, 7))
    expect(new Set(meses).size).toBe(meses.length)
    expect(occs.some(d => d.endsWith('-28'))).toBe(false)
    expect(occs).not.toContain('2026-11-16')
  })
  it('exceção de valor de uma seguinte acompanha o mês (28/11 → 16/11); a do mês da editada não cai nela', () => {
    const s0 = { ...MAYARA, overrides: { '2026-10-28': { amount: 650 }, '2026-11-28': { amount: 640 } } }
    const { schedule: s } = editar(s0, '2026-09-28', { date: '2026-10-16', amount: 678.25 }, ESCOPO.PROXIMAS)
    expect(s.overrides['2026-11-16']).toEqual({ amount: 640 })
    expect(s.overrides['2026-10-16']).toBeUndefined() // a editada vale 678,25 (o que o usuário pediu)
    expect(datasOverride(s)).toEqual(['2026-11-16'])
  })
  it('frequência semanal: re-chaveia por posição', () => {
    const sem = { ...MAYARA, frequency: 'weekly', startDate: '2026-10-05', nextOccurrence: '2026-10-05', registered: [], skipped: ['2026-10-19'] }
    const { schedule: s } = editar(sem, '2026-10-05', { date: '2026-10-07', amount: 678.25 }, ESCOPO.PROXIMAS)
    expect(s.skipped).toEqual(['2026-10-21'])
  })
  it('registradas e pulos anteriores à editada não mudam', () => {
    const s0 = { ...MAYARA, skipped: ['2026-04-28'] }
    const { schedule: s } = editar(s0, '2026-09-28', { date: '2026-10-16', amount: 678.25 }, ESCOPO.PROXIMAS)
    expect(s.registered).toEqual(MAYARA.registered)
    expect(s.skipped).toEqual(['2026-04-28'])
  })
})
