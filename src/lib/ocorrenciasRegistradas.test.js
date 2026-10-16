import { describe, it, expect } from 'vitest'
import { historicoOcorrencias, resumoRegistradas, pagamentosDosAgendamentos, filtrarPagamentos, STATUS_OCORRENCIA as ST } from './ocorrenciasRegistradas'
import { computeOccurrences } from './occurrences'

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
  it('uma linha por ocorrência paga (série em andamento incluída), mais recente primeiro; pulada/baixada fora', () => {
    expect(linhas.map(l => [l.dataPagamento, l.description, `${l.parcela}/${l.total}`])).toEqual([
      ['2026-09-18', 'TV PAPAI', '4/8'],
      ['2026-09-06', 'ACADEMIA', '1/12'],
      ['2026-08-20', 'TV PAPAI', '3/8'],
      ['2026-07-20', 'TV PAPAI', '2/8'],
    ])
    expect(linhas[0]).toMatchObject({ accountId: 'acc_bb', payee: 'CARLOS ROBERTO MOREIRA', amount: 150, vencimento: '2026-09-20' })
  })
  it('filtro de favorecido CARLOS RO traz as parcelas pagas pelo BB', () => {
    const r = filtrarPagamentos(linhas, { payee: 'CARLOS RO' })
    expect(r).toHaveLength(3)
    expect(r.every(l => l.accountId === 'acc_bb')).toBe(true)
  })
  it('data = data do pagamento; valor = valor pago; categoria', () => {
    expect(filtrarPagamentos(linhas, { from: '2026-09-01', to: '2026-09-30' }).map(l => l.dataPagamento)).toEqual(['2026-09-18', '2026-09-06'])
    expect(filtrarPagamentos(linhas, { max: 100 }).map(l => l.description)).toEqual(['ACADEMIA'])
    expect(filtrarPagamentos(linhas, { valores: new Set([99.9]) })).toHaveLength(1)
    expect(filtrarPagamentos(linhas, { categoryId: 'cat_saude' })).toHaveLength(1)
  })
})
