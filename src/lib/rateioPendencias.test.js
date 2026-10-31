import { describe, it, expect } from 'vitest'
import { rateioHerdado, baixasSemRateio, rateioDaOcorrencia, valorNasCategorias, linhasParaAutomaticos, linhasDoLancamento } from './rateio'
import { gastoEnvelopes } from './envelopes'
import { agruparPorFavorecido } from './topFavorecidos'
import { despesasPorCategoria } from './despesasPorCategoria'

const LINHAS = [{ categoriaId: 'gas', valor: 200, descricao: '' }, { categoriaId: 'ali', valor: 50, descricao: '' }]
const AG = { id: 'ag_posto', description: 'Posto', transactionType: 'expense', accountId: 'card', amount: 250, frequency: 'monthly', startDate: '2026-10-05', overrides: {}, registeredMeta: {} }

describe('3) rateio na baixa por qualquer caminho', () => {
  it('lançamento importado que baixa o agendamento rateado herda o rateio (proporcional ao valor)', () => {
    const tx = { id: 'imp1', type: 'expense', amount: 250 }
    const rateios = new Map([['ag_posto', LINHAS]])
    expect(rateioHerdado({ tx, schedule: AG, data: '2026-11-05', rateiosPorId: rateios })).toEqual(LINHAS)
    expect(rateioHerdado({ tx: { ...tx, amount: 275 }, schedule: AG, data: '2026-11-05', rateiosPorId: rateios }).map(l => l.valor)).toEqual([220, 55])
    // Relatório por categoria com o rateio herdado: Gasolina 200, Alimentação 50.
    const explodidas = linhasDoLancamento({ ...tx, date: '2026-11-05' }, LINHAS).map((l, i) => ({ ...tx, date: '2026-11-05', id: `imp1:r${i}`, categoryId: l.categoriaId, amount: l.valor }))
    const { categorias } = despesasPorCategoria(explodidas, { start: '2026-11-01', end: '2026-11-30' }, { isExpenseTx: t => t.type === 'expense', isResgateReservaSombra: () => false }, 'cheio')
    expect(Object.fromEntries(categorias.map(c => [c.categoryId, c.valor]))).toEqual({ gas: 200, ali: 50 })
  })
  it('lançamento que já tem rateio próprio (Assistente/manual) mantém o seu; agendamento sem rateio não muda nada', () => {
    const tx = { id: 'mc', type: 'expense', amount: 250 }
    expect(rateioHerdado({ tx, schedule: AG, data: '2026-11-05', rateiosPorId: new Map([['ag_posto', LINHAS], ['mc', [{ categoriaId: 'x', valor: 250 }]]]) })).toEqual([])
    expect(rateioHerdado({ tx, schedule: AG, data: '2026-11-05', rateiosPorId: new Map() })).toEqual([])
    expect(rateioHerdado({ tx: { ...tx, type: 'transfer' }, schedule: AG, data: '2026-11-05', rateiosPorId: new Map([['ag_posto', LINHAS]]) })).toEqual([])
  })
})

describe('4) varredura: baixas de agendamento rateado sem rateio', () => {
  it('lista sem alterar nada, já com as linhas ajustadas ao valor de cada lançamento', () => {
    const ag = { ...AG, registered: ['2026-10-05', '2026-11-05'], registeredMeta: { '2026-10-05': { lancamento_id: 'l1' }, '2026-11-05': { lancamento_id: 'l2' } } }
    const transactions = [{ id: 'l1', type: 'expense', amount: 250, date: '2026-10-05' }, { id: 'l2', type: 'expense', amount: 300, date: '2026-11-05' }]
    const rateiosPorId = new Map([['ag_posto', LINHAS], ['l2', [{ categoriaId: 'gas', valor: 300 }]]])
    const r = baixasSemRateio({ schedules: [ag], transactions, rateiosPorId })
    expect(r.map(x => x.tx.id)).toEqual(['l1'])
    expect(r[0].linhas.map(l => l.valor)).toEqual([200, 50])
    expect(transactions[0]).toEqual({ id: 'l1', type: 'expense', amount: 250, date: '2026-10-05' })
  })
})

describe('4) envelopes, Top Favorecidos e automáticos respeitam o rateio', () => {
  const MC = { id: 'mc', type: 'expense', amount: 200, date: '2026-11-05', categoryId: 'confra', payee: 'McDonalds' }
  const rateios = new Map([['mc', [{ categoriaId: 'confra', valor: 100 }, { categoriaId: 'merc', valor: 100 }]]])
  it('5) envelope de Mercado desconta R$ 100 do McDonald\'s rateado', () => {
    const env = { id: 'e', name: 'Mercado', categoryIds: ['merc'], limitAmount: 800 }
    const comp = 2026 * 12 + 10
    const [r] = gastoEnvelopes([env], [MC], comp, 1, rateios)
    expect(r.spent).toBe(100)
    expect(r.txs[0]).toMatchObject({ amount: 100, _amountTotal: 200 })
    expect(gastoEnvelopes([env], [MC], comp, 1)[0].spent).toBe(0) // sem rateio: categoria principal (como antes)
    expect(valorNasCategorias(MC, rateios.get('mc'), ['confra', 'merc'])).toBe(200)
  })
  it('Top Favorecidos conta UM lançamento rateado (não as linhas)', () => {
    const linhas = [{ ...MC, id: 'mc:r0', amount: 100, _rateioOf: 'mc' }, { ...MC, id: 'mc:r1', amount: 100, _rateioOf: 'mc' }]
    const r = agruparPorFavorecido(linhas)
    expect(r.grupos[0]).toMatchObject({ total: 200, qtd: 1 })
  })
  it('espelho/aporte automáticos olham as linhas do rateio informado junto (tx._rateio)', () => {
    expect(linhasParaAutomaticos({ ...MC, _rateio: rateios.get('mc') }).map(l => [l.categoriaId, l.valor])).toEqual([['confra', 100], ['merc', 100]])
    expect(linhasParaAutomaticos(MC)).toEqual([{ categoriaId: 'confra', valor: 200 }])
  })
})

describe('5/6) rateio em série: "Só esta" vale só para aquela ocorrência', () => {
  it('condomínio mensal: dezembro com rateio próprio, as demais seguem a série', () => {
    const serie = [{ categoriaId: 'cond', valor: 500 }, { categoriaId: 'agua', valor: 100 }]
    const so = [{ categoriaId: 'cond', valor: 450 }, { categoriaId: 'agua', valor: 150 }]
    const ag = { ...AG, id: 'cond', overrides: { '2026-12-05': { rateio: so } } }
    expect(rateioDaOcorrencia(ag, '2026-12-05', serie).map(l => l.valor)).toEqual([450, 150])
    expect(rateioDaOcorrencia(ag, '2027-01-05', serie).map(l => l.valor)).toEqual([500, 100])
    // A baixa de dezembro herda o rateio DELA.
    expect(rateioHerdado({ tx: { id: 't', type: 'expense', amount: 600 }, schedule: ag, data: '2026-12-05', rateiosPorId: new Map([['cond', serie]]) }).map(l => l.valor)).toEqual([450, 150])
  })
})
