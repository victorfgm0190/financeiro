import { describe, it, expect } from 'vitest'
import { historicoOcorrencias, resumoRegistradas, pagamentosDosAgendamentos, filtrarPagamentos, totaisPagamentos, candidatosVinculo, STATUS_OCORRENCIA as ST } from './ocorrenciasRegistradas'
import { computeOccurrences } from './occurrences'
import { aplicarBaixa, metaBaixaGerada, baixasDaImportacao, lancamentosVinculados } from './scheduleBaixa'

// Caso real (Neon, 16/10/2026): TV PAPAI, 8 parcelas mensais de 150 desde 20/06/2026, próxima 20/10.
// Junho foi baixado em 18/06 sem lançamento; setembro foi pago em 18/09.
const TV_PAPAI = {
  id: 'sch_1781566207347', description: 'TV PAPAI', amount: 150, frequency: 'monthly',
  occurrenceType: 'installment', installments: 8, startDate: '2026-06-20', nextOccurrence: '2026-10-20',
  registered: ['2026-06-18', '2026-07-20', '2026-08-20', '2026-09-20'], skipped: [], registeredMeta: {}, overrides: {},
}
const tx = (id, date, amount = 150) => ({ id, date, amount, accountId: 'acc_bb', payee: 'CARLOS ROBERTO MOREIRA', scheduleId: TV_PAPAI.id })
const TXS = [
  tx('tx_1784561497376_h1qs8qnfsp', '2026-07-20'),
  tx('tx_1787417355164_dhvgkxi8njb', '2026-08-20'),
  tx('tx_1789737019825_czmcqdsy8pf', '2026-09-18'),
]

describe('historicoOcorrencias — TV PAPAI', () => {
  const h = historicoOcorrencias(TV_PAPAI, TXS)
  it('1/8 Baixada (18/06), 2/8 Paga (20/07), 3/8 Paga (20/08), 4/8 Paga (18/09)', () => {
    expect(h.linhas.map(l => [`${l.parcela}/${l.total}`, l.status, l.status === ST.PAGA ? l.pagoEm : l.dataRegistro])).toEqual([
      ['1/8', ST.BAIXADA, '2026-06-18'],
      ['2/8', ST.PAGA, '2026-07-20'],
      ['3/8', ST.PAGA, '2026-08-20'],
      ['4/8', ST.PAGA, '2026-09-18'],
    ])
    expect(h.linhas[0].motivo).toBe('sem lançamento')
    expect(h.linhas.map(l => l.vencimento)).toEqual(['2026-06-20', '2026-07-20', '2026-08-20', '2026-09-20'])
  })
  it('dados do LANÇAMENTO na paga; totais', () => {
    expect(h.linhas[3]).toMatchObject({ txId: 'tx_1789737019825_czmcqdsy8pf', accountId: 'acc_bb', payee: 'CARLOS ROBERTO MOREIRA', valorPago: 150, diferenca: 0 })
    expect([h.nPagas, h.totalPago, h.totalPrevisto, h.diferenca]).toEqual([3, 450, 450, 0])
  })
  it('resumo do botão: 4 de 8', () => {
    expect(resumoRegistradas(TV_PAPAI, TXS)).toMatchObject({ registradas: 4, total: 8, continua: false, temAlgo: true })
  })
  it('a série (fluxo/prévia) segue com as 4 restantes: 20/10, 20/11, 20/12, 20/01', () => {
    expect(computeOccurrences(TV_PAPAI, 12)).toEqual(['2026-10-20', '2026-11-20', '2026-12-20', '2027-01-20'])
  })
})

describe('regras de casamento e status', () => {
  const base = { ...TV_PAPAI, registered: [], skipped: [] }
  it('a) lancamento_id do registered_meta vence, mesmo de cartão (sem scheduleId)', () => {
    const cartao = { id: 'tx_card', date: '2026-07-05', amount: 149.9, accountId: 'acc_card', payee: 'LOJA' }
    const s = { ...base, registered: ['2026-06-20'], registeredMeta: { '2026-06-20': { tipo: 'ja_no_cartao', lancamento_id: 'tx_card' } } }
    const h = historicoOcorrencias(s, [cartao, tx('tx_x', '2026-06-20')])
    expect(h.linhas[0]).toMatchObject({ status: ST.PAGA, txId: 'tx_card', valorPago: 149.9, diferenca: -0.1 })
    expect(h.linhas[1]).toMatchObject({ status: ST.AVULSO, txId: 'tx_x' })
  })
  it('b) fora de ±31 dias não casa → Baixada; o lançamento vira Avulso vinculado', () => {
    const s = { ...base, registered: ['2026-06-20'] }
    const h = historicoOcorrencias(s, [tx('tx_longe', '2026-08-01')])
    expect(h.linhas.map(l => l.status)).toEqual([ST.BAIXADA, ST.AVULSO])
  })
  it('motivo da baixa pelo registered_meta.tipo', () => {
    const s = { ...base, registered: ['2026-06-20', '2026-07-20', '2026-08-20'], registeredMeta: {
      '2026-06-20': { tipo: 'ja_no_cartao' }, '2026-07-20': { tipo: 'importado' }, '2026-08-20': { tipo: 'coberta_parcela' },
    } }
    expect(historicoOcorrencias(s, []).linhas.map(l => l.motivo)).toEqual(['já no cartão', 'importada', 'coberta por parcela'])
  })
  it('pulada ocupa a sua parcela; valor pago diferente mostra a diferença', () => {
    const s = { ...base, registered: ['2026-06-20', '2026-08-20'], skipped: ['2026-07-20'] }
    const h = historicoOcorrencias(s, [tx('a', '2026-06-21', 160), tx('b', '2026-08-20')])
    expect(h.linhas.map(l => [l.parcela, l.status])).toEqual([[1, ST.PAGA], [2, ST.PULADA], [3, ST.PAGA]])
    expect(h.linhas[0].diferenca).toBe(10)
    expect(h.diferenca).toBe(10)
  })
  it('série contínua: total nulo', () => {
    const s = { ...base, occurrenceType: 'continuous', registered: ['2026-06-20'] }
    expect(historicoOcorrencias(s, []).linhas[0].total).toBeNull()
    expect(resumoRegistradas(s, []).continua).toBe(true)
  })
  it('nada consumido nem vinculado → botão escondido', () => {
    expect(resumoRegistradas(base, []).temAlgo).toBe(false)
  })
})

describe('aba Pagos — pagamentosDosAgendamentos / filtrarPagamentos', () => {
  const outro = { ...TV_PAPAI, id: 'sch_outro', description: 'ACADEMIA', payee: 'SMART', registered: ['2026-09-05'], skipped: ['2026-10-05'], installments: 12, startDate: '2026-09-05', nextOccurrence: '2026-11-05' }
  const txs = [...TXS, { id: 'tx_ac', date: '2026-09-06', amount: 99.9, accountId: 'acc_itau', payee: 'SMART FIT', scheduleId: 'sch_outro', description: 'ACADEMIA', categoryId: 'cat_saude' }]
  const linhas = pagamentosDosAgendamentos([TV_PAPAI, outro], txs)
  it('uma linha por ocorrência paga (série em andamento incluída) + baixada "sem lançamento"; pulada fora', () => {
    expect(linhas.map(l => [l.dataPagamento, l.description, `${l.parcela}/${l.total}`, !!l.semLancamento])).toEqual([
      ['2026-09-18', 'TV PAPAI', '4/8', false],
      ['2026-09-06', 'ACADEMIA', '1/12', false],
      ['2026-08-20', 'TV PAPAI', '3/8', false],
      ['2026-07-20', 'TV PAPAI', '2/8', false],
      ['2026-06-18', 'TV PAPAI', '1/8', true],
    ])
    // Baixada: data baixada, conta e valor do agendamento.
    expect(linhas[4]).toMatchObject({ accountId: TV_PAPAI.accountId ?? null, amount: 150, txId: null, motivo: 'sem lançamento' })
    expect(linhas[0]).toMatchObject({ accountId: 'acc_bb', payee: 'CARLOS ROBERTO MOREIRA', amount: 150, vencimento: '2026-09-20' })
  })
  it('filtro de favorecido CARLOS RO traz as parcelas pagas pelo BB', () => {
    const r = filtrarPagamentos(linhas, { payee: 'CARLOS RO' })
    expect(r.filter(l => !l.semLancamento)).toHaveLength(3)
    expect(r.filter(l => !l.semLancamento).every(l => l.accountId === 'acc_bb')).toBe(true)
    expect(totaisPagamentos(linhas)).toEqual({ nPagos: 4, totalPago: 549.9, nSemLancamento: 1 })
  })
  it('data = data do pagamento; valor = valor pago; categoria', () => {
    expect(filtrarPagamentos(linhas, { from: '2026-09-01', to: '2026-09-30' }).map(l => l.dataPagamento)).toEqual(['2026-09-18', '2026-09-06'])
    expect(filtrarPagamentos(linhas, { max: 100 }).map(l => l.description)).toEqual(['ACADEMIA'])
    expect(filtrarPagamentos(linhas, { valores: new Set([99.9]) })).toHaveLength(1)
    expect(filtrarPagamentos(linhas, { categoryId: 'cat_saude' })).toHaveLength(1)
  })
})

describe('baixa gerando lançamento grava registered_meta.lancamento_id (motor e manuais)', () => {
  // Agendamento do motor da fatura: o lançamento gerado é casado pela id do meta, mesmo quando
  // não tem schedule_id (legado) ou cai longe da data (pagamento atrasado > 1 período).
  const pf = { id: 'fsch_card_202610_pagamento_fatura', tipo: 'pagamento_fatura', description: 'Pagamento Fatura X 10/2026', amount: 500, frequency: 'once', occurrenceType: 'continuous', startDate: '2026-10-20', registered: [], skipped: [], registeredMeta: {}, overrides: {} }
  it('metaBaixaGerada + aplicarBaixa: registered e meta { tipo: pago, lancamento_id }', () => {
    const s = aplicarBaixa(pf, '2026-10-20', metaBaixaGerada('tx_gerado'))
    expect(s.registered).toEqual(['2026-10-20'])
    expect(s.registeredMeta['2026-10-20']).toEqual({ tipo: 'pago', lancamento_id: 'tx_gerado', import_id: null })
  })
  it('o histórico casa pela id do meta, mesmo sem schedule_id e fora da janela', () => {
    const s = aplicarBaixa(pf, '2026-10-20', metaBaixaGerada('tx_gerado'))
    const tx = { id: 'tx_gerado', date: '2026-12-01', amount: 500, accountId: 'acc_itau', type: 'transfer' }
    const h = historicoOcorrencias(s, [tx])
    expect(h.linhas.map(l => [l.status, l.txId])).toEqual([[ST.PAGA, 'tx_gerado']])
    expect(pagamentosDosAgendamentos([s], [tx])).toHaveLength(1)
  })
  it('não interfere nas regras que leem o meta: desfazer importação ignora "pago"; cobertura já o contava', () => {
    const s = aplicarBaixa(pf, '2026-10-20', metaBaixaGerada('tx_gerado'))
    expect(baixasDaImportacao(s, 'imp_1')).toEqual([])
    expect([...lancamentosVinculados([s], [])]).toEqual(['tx_gerado'])
  })
})

describe('"Vincular a lançamento existente" (candidatosVinculo) e baixas com meta (1b)', () => {
  const s = { ...TV_PAPAI, accountId: 'acc_bb', transactionType: 'expense' }
  // O pagamento real de junho: lançamento manual sem schedule_id (caso do Neon).
  const junho = { id: 'tx_1782578282278_9ceskig4dzc', type: 'expense', date: '2026-06-18', amount: 150, accountId: 'acc_bb', description: 'CARLOS ROBERTO MOREIRA - TV PAPAI' }
  const ctx = (txs) => ({ transactions: txs, schedules: [s] })
  it('sugere o lançamento sem vínculo da mesma conta, valor ±0,05 e data a ±1 período', () => {
    expect(candidatosVinculo(s, '2026-06-18', ctx([...TXS, junho])).map(t => t.id)).toEqual([junho.id])
  })
  it('exclui: outra conta, valor fora de ±0,05, data fora da janela, já vinculado, outro tipo', () => {
    const fora = [
      { ...junho, id: 'c1', accountId: 'acc_itau' },
      { ...junho, id: 'c2', amount: 150.06 },
      { ...junho, id: 'c3', date: '2026-08-01' },
      { ...junho, id: 'c4', scheduleId: 'outro' },
      { ...junho, id: 'c5', type: 'income' },
      { ...junho, id: 'c6', amount: 149.96 },
    ]
    expect(candidatosVinculo(s, '2026-06-18', ctx(fora)).map(t => t.id)).toEqual(['c6'])
    const comMeta = { ...s, registeredMeta: { '2026-07-20': { tipo: 'pago', lancamento_id: 'c6' } } }
    expect(candidatosVinculo(comMeta, '2026-06-18', { transactions: fora, schedules: [comMeta] })).toEqual([])
  })
  it('vincular = baixa com meta → a 1/8 vira Paga e sai das sugestões', () => {
    const vinc = aplicarBaixa(s, '2026-06-18', metaBaixaGerada(junho.id))
    const h = historicoOcorrencias(vinc, [...TXS, junho])
    expect(h.linhas[0]).toMatchObject({ parcela: 1, status: ST.PAGA, txId: junho.id, pagoEm: '2026-06-18' })
    expect(candidatosVinculo(vinc, '2026-06-18', { transactions: [...TXS, junho], schedules: [vinc] })).toEqual([])
  })
  it('"Já registrei" (TransactionForm) e conciliação "registrar" (importação): o meta liga o lançamento à baixa', () => {
    // TransactionForm: lançamento recém-criado, sem schedule_id, baixado na próxima ocorrência.
    const novo = { id: 'tx_novo', type: 'expense', date: '2026-10-19', amount: 150, accountId: 'acc_bb' }
    const s1 = aplicarBaixa(s, '2026-10-20', metaBaixaGerada(novo.id))
    expect(historicoOcorrencias(s1, [...TXS, novo]).linhas.find(l => l.dataRegistro === '2026-10-20')).toMatchObject({ status: ST.PAGA, txId: 'tx_novo' })
    // Importação: tipo importado + import_id → desfazer a importação reabre a ocorrência.
    const s2 = aplicarBaixa(s, '2026-10-20', { tipo: 'importado', lancamento_id: 'tx_imp', import_id: 'imp_1' })
    expect(baixasDaImportacao(s2, 'imp_1')).toEqual(['2026-10-20'])
    expect(historicoOcorrencias(s2, [{ id: 'tx_imp', date: '2026-10-21', amount: 150, accountId: 'acc_card' }]).linhas.at(-1)).toMatchObject({ status: ST.PAGA, txId: 'tx_imp' })
  })
})
