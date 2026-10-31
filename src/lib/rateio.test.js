import { describe, it, expect } from 'vitest'
import {
  validarRateio, completarComRestante, normalizarRateio, categoriaPrincipal, linhasDoLancamento, parteDaCategoria,
  temCategoria, rotuloCategoria, rateioDaParcela, ajustarRateio, categoriaParaExportar, rotuloCategoriaFluxo,
} from './rateio'
import { matchLancFiltros, EMPTY_LANC_FILTROS } from '../components/shared/utils'
import { despesasPorCategoria } from './despesasPorCategoria'
import { resolverLinhasRevisao, linhasAImportar } from './revisaoImportacao'
import { aplicarJaLancados } from './casamentoFatura'
import { aplicarCorrespondencias } from './importacaoCorrespondencias'

const categories = [{ id: 'confra', name: 'Confraternização' }, { id: 'merc', name: 'Mercado' }, { id: 'lazer', name: 'Lazer' }]
const MC = { id: 'mc', type: 'expense', accountId: 'cc', amount: 200, date: '2026-10-30', description: 'McDonald\'s', categoryId: 'confra' }
const LINHAS = [{ categoriaId: 'confra', valor: 100 }, { categoriaId: 'merc', valor: 100 }]

describe('rateio por categorias', () => {
  it('7) soma R$ 180 bloqueia com "Restante a distribuir: R$ 20,00"', () => {
    expect(validarRateio([{ categoriaId: 'confra', valor: 100 }, { categoriaId: 'merc', valor: 80 }], 200)).toMatchObject({ ok: false, restante: 20, atribuido: 180 })
    expect(validarRateio(LINHAS, 200)).toMatchObject({ ok: true, restante: 0 })
    expect(validarRateio([{ categoriaId: '', valor: 200 }], 200).ok).toBe(false)
    expect(validarRateio([{ categoriaId: 'a', valor: 150 }, { categoriaId: 'b', valor: 60 }], 200)).toMatchObject({ ok: false, restante: -10 })
  })

  it('"Completar com o restante" e uma linha só volta a lançamento comum', () => {
    expect(completarComRestante([{ categoriaId: 'confra', valor: 120 }, { categoriaId: 'merc', valor: '' }], 200)[1].valor).toBe(80)
    expect(normalizarRateio([{ categoriaId: 'merc', valor: 200 }])).toEqual({ linhas: [], comum: 'merc' })
    expect(normalizarRateio(LINHAS).linhas).toHaveLength(2)
    expect(categoriaPrincipal([{ categoriaId: 'a', valor: 50 }, { categoriaId: 'b', valor: 150 }])).toBe('b')
  })

  it('6) relatórios: cada categoria soma a sua parte, nunca o total (o saldo usa o total do lançamento)', () => {
    const linhas = linhasDoLancamento(MC, LINHAS)
    expect(linhas).toEqual([{ categoriaId: 'confra', valor: 100, descricao: '' }, { categoriaId: 'merc', valor: 100, descricao: '' }])
    // Explosão como a do AppContext (profileReportTransactions) → Despesas por Categoria.
    const explodidas = linhas.map((l, i) => ({ ...MC, id: `mc:r${i}`, categoryId: l.categoriaId, amount: l.valor, _rateioOf: 'mc' }))
    const cls = { isExpenseTx: (t) => t.type === 'expense', isResgateReservaSombra: () => false }
    const { categorias, totalDespesas } = despesasPorCategoria(explodidas, { start: '2026-10-01', end: '2026-10-31' }, cls, 'cheio')
    expect(Object.fromEntries(categorias.map(c => [c.categoryId, c.valor]))).toEqual({ confra: 100, merc: 100 })
    expect(totalDespesas).toBe(200)
  })

  it('soma acima do total nunca infla (reescala); abaixo deixa a sobra na categoria principal', () => {
    expect(linhasDoLancamento(MC, [{ categoriaId: 'confra', valor: 200 }, { categoriaId: 'merc', valor: 200 }]).map(l => l.valor)).toEqual([100, 100])
    expect(linhasDoLancamento(MC, [{ categoriaId: 'merc', valor: 150 }])).toEqual([
      { categoriaId: 'merc', valor: 150, descricao: '' }, { categoriaId: 'confra', valor: 50, sobra: true },
    ])
  })

  it('8) filtro por categoria Mercado mostra o lançamento, com a parte (R$ 100) e o total (R$ 200)', () => {
    const rateios = new Map([['mc', LINHAS]])
    const f = { ...EMPTY_LANC_FILTROS, categoria: 'merc' }
    expect(matchLancFiltros(MC, f, [], rateios)).toBe(true)
    expect(matchLancFiltros(MC, { ...f, categoria: 'lazer' }, [], rateios)).toBe(false)
    expect(parteDaCategoria(MC, LINHAS, 'merc')).toBe(100)
    expect(temCategoria(MC, LINHAS, 'confra')).toBe(true)
  })

  it('11) lançamento sem rateio continua igual', () => {
    const sem = { ...MC, id: 'x' }
    expect(linhasDoLancamento(sem, undefined)).toEqual([{ categoriaId: 'confra', valor: 200 }])
    expect(matchLancFiltros(sem, { ...EMPTY_LANC_FILTROS, categoria: 'confra' }, [], new Map())).toBe(true)
    expect(rotuloCategoria(sem, [], categories)).toEqual({ curto: 'Confraternização', detalhe: '', rateado: false })
  })

  it('"Rateado (2)" nas listas e o detalhe na exportação Excel (12)', () => {
    expect(rotuloCategoria(MC, LINHAS, categories)).toMatchObject({ curto: 'Rateado (2)', rateado: true })
    expect(categoriaParaExportar(MC, LINHAS, categories).replace(/\s/g, ' ')).toBe('Rateado (2): Confraternização R$ 100,00 + Mercado R$ 100,00')
  })

  it('parcelado: cada parcela leva as proporções sobre o próprio valor (antes contava o total da compra)', () => {
    expect(rateioDaParcela([{ categoriaId: 'a', valor: 300 }, { categoriaId: 'b', valor: 300 }], 100).map(l => l.valor)).toEqual([50, 50])
  })

  it('10) baixa com valor diferente: proporcional ou a diferença numa linha escolhida', () => {
    expect(ajustarRateio(LINHAS, 220, { modo: 'proporcional' }).map(l => l.valor)).toEqual([110, 110])
    expect(ajustarRateio(LINHAS, 220, { modo: 'linha', idx: 1 }).map(l => l.valor)).toEqual([100, 120])
    expect(ajustarRateio(LINHAS, 50, { modo: 'linha', idx: 0 }).map(l => l.valor)).toEqual([25, 25])
  })

  it('Fluxo de Caixa: linha real ou projetada mostra "Rateado (2): …"', () => {
    const rateios = new Map([['mc', LINHAS], ['ag', LINHAS]])
    expect(rotuloCategoriaFluxo({ real: true, _key: 'mc', saida: 200, entrada: 0, categoryId: 'confra' }, rateios, categories)).toMatch(/^Rateado \(2\): Confraternização/)
    expect(rotuloCategoriaFluxo({ real: false, _scheduleId: 'ag', saida: 200, entrada: 0, categoryId: 'confra' }, rateios, categories)).toMatch(/^Rateado \(2\)/)
    expect(rotuloCategoriaFluxo({ real: true, _key: 'outro', saida: 10, entrada: 0, categoryId: 'merc' }, rateios, categories)).toBe('Mercado')
  })

  it('9) lançamento rateado no cartão + Importar Fatura com uma linha de R$ 200 → casa, sem duplicar', () => {
    const tx = { ...MC, accountId: 'card', accountType: 'credit', date: '2026-10-20', faturaMonthYear: '2026-11', payee: 'McDonalds' }
    const rows = [{ _id: 'L', type: 'expense', selected: true, faturaMonthYear: '2026-11', description: 'MCDONALDS', amount: 200, date: '2026-10-20', _dateCartao: '2026-10-20' }]
    const base = resolverLinhasRevisao(rows, { accountId: 'card', transactions: [tx], closingDay: 25 })
    const out = aplicarCorrespondencias(aplicarJaLancados(base, { transactions: [tx], accountId: 'card', closingDay: 25 }), { transactions: [tx], accounts: [{ id: 'card', type: 'credit', closingDay: 25 }], accountId: 'card' })
    expect(linhasAImportar(out)).toEqual([])
    expect(out[0]._dbTx.id).toBe('mc')
  })
})
