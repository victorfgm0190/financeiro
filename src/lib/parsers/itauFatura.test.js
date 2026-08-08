import { describe, it, expect } from 'vitest'
import { parseItauXLS, extractItauTotalDeclarado, computeFileTotals, parseXlsValor } from './itauFatura'

// Fatura Personnalité 08/2026 — a que motivou este teste. Estrutura idêntica à do arquivo real
// exportado pelo internet banking (cabeçalho com "Fatura Aberta - <Mês>/<Ano>", tabela de cartões
// com "Valor (parcial)", depois a lista de lançamentos), com os SETE estornos reais da fatura
// (R$ 1,28 no total) e uma amostra das despesas. Os valores dos estornos são os do extrato: são
// eles que faziam a fatura fechar R$ 1,22–1,28 acima do devido quando não eram importados.
//
// Total declarado: 1000,00 de despesas − 1,28 de estornos = 998,72.
const ESTORNOS = [
  ['2026-07-21', 'Desc Antecipa Parcelas', '', -0.98],
  ['2026-07-05', 'Gotas Do Infinictho', '', -0.12],
  ['2026-07-04', 'Jolly Confeccoes', '', -0.04],
  ['2026-07-03', 'Biashoes Mod-ct Outlet', '', -0.06],
  ['2026-06-29', 'Clinica Higa-ct Ltda', '', -0.02],
  ['2026-06-15', 'Phlo Link', '', -0.02],
  ['2026-06-13', 'Pg *Soul Verita Comerc', '', -0.04],
]
const DESPESAS = [
  ['2026-08-05', 'Posto Shangri-la', '', 239.02],
  ['2026-08-05', 'Shopee*shps Tecnol', 'Parcela 1 de 2', 90.42],
  ['2026-07-05', 'Gotas Do Infinicth', 'Parcela 2 de 5', 63.25],
  ['2026-06-29', 'Clinica Higa-ct Lt', 'Parcela 2 de 3', 690.34],
  // Estorno TOTAL de uma compra: mesmo valor e mesma descrição da despesa acima dele.
  // É o caso que o casamento por valor+descrição confundia com duplicata.
  ['2026-07-10', 'Aramis', '', 149.95],
]
const ESTORNO_TOTAL = ['2026-07-11', 'Aramis', '', -149.95]

function faturaAoa({ estornos = ESTORNOS, despesas = DESPESAS, declarado = 1000 } = {}) {
  return [
    [], [],
    ['', 'Nome', 'Fulano de Tal'],
    ['', 'Fatura Aberta - Agosto/2026'],
    ['', 'Cartão', '', '', '', '', 'Valor (parcial)', '', 'Vencimento'],
    ['', 'Personnalite Mult Black - final 4541', '', '', '', '', declarado, '', '2026-08-20'],
    [],
    ['', 'Lançamentos'],
    ['', 'Data', 'Lançamento', 'Parcelamento', 'Valor', '', 'Titularidade'],
    // Pagamento da fatura anterior: negativo, mas NÃO é lançamento desta fatura.
    ['', '2026-07-20', 'Pagamento Efetuado', '', -23067.85, '', 'Titular'],
    ...despesas.map(([d, desc, parc, v]) => ['', d, desc, parc, v, '', 'Titular']),
    ...estornos.map(([d, desc, parc, v]) => ['', d, desc, parc, v, '', 'Titular']),
    ['', '', 'Subtotal'],
  ]
}

describe('parseItauXLS — fatura de cartão do Itaú', () => {
  it('importa os estornos como receita, com a descrição original', () => {
    const { rows } = parseItauXLS(faturaAoa())
    const estornos = rows.filter(r => r.type === 'income')

    expect(estornos).toHaveLength(7)
    expect(estornos.map(e => e.description)).toEqual([
      'Desc Antecipa Parcelas', 'Gotas Do Infinictho', 'Jolly Confeccoes',
      'Biashoes Mod-ct Outlet', 'Clinica Higa-ct Ltda', 'Phlo Link', 'Pg *Soul Verita Comerc',
    ])
    // Valor absoluto: o sinal vira o tipo, não fica no amount.
    expect(estornos.map(e => e.amount)).toEqual([0.98, 0.12, 0.04, 0.06, 0.02, 0.02, 0.04])
    expect(estornos.every(e => e.selected && e.isDeposit)).toBe(true)
  })

  it('descarta o pagamento da fatura anterior, mas não os demais negativos', () => {
    const { rows } = parseItauXLS(faturaAoa())
    expect(rows.some(r => /pagamento efetuado/i.test(r.description))).toBe(false)
    expect(rows).toHaveLength(DESPESAS.length + ESTORNOS.length)
  })

  it('pré-classifica o estorno na categoria de estorno quando ela existe', () => {
    const cats = [{ id: 'cat_1', name: 'Mercado' }, { id: 'cat_est', name: 'Estornos' }]
    const { rows } = parseItauXLS(faturaAoa(), cats)
    const estornos = rows.filter(r => r.type === 'income')
    expect(estornos.every(e => e.categoryId === 'cat_est')).toBe(true)
    // Despesa nenhuma é pré-classificada — isso é papel das regras de classificação.
    expect(rows.filter(r => r.type === 'expense').every(e => e.categoryId === '')).toBe(true)
  })

  it('não põe sufixo de parcela na descrição do estorno', () => {
    const comParcela = [['2026-07-05', 'Gotas Do Infinicth', 'Parcela 2 de 5', -0.12]]
    const { rows } = parseItauXLS(faturaAoa({ estornos: comParcela }))
    const estorno = rows.find(r => r.type === 'income')
    // Com o sufixo "2/5" o estorno colidiria com a parcela que ele estorna (mesma chave).
    expect(estorno.description).toBe('Gotas Do Infinicth')
  })

  it('marca a parcela do XLS na descrição das despesas (coluna Parcelamento)', () => {
    const { rows } = parseItauXLS(faturaAoa())
    expect(rows.find(r => r.description.startsWith('Shopee')).description).toBe('Shopee*shps Tecnol 1/2')
    expect(rows.find(r => r.description.startsWith('Clinica')).description).toBe('Clinica Higa-ct Lt 2/3')
  })

  it('lê o mês de referência e o total declarado do cabeçalho', () => {
    const r = parseItauXLS(faturaAoa())
    expect(r.faturaMY).toBe('2026-08')
    expect(r.faturaStr).toBe('Agosto/2026')
    expect(r.totalDeclarado).toBe(1000)
  })

  it('fecha o total do arquivo com o declarado pelo Itaú (despesas − estornos)', () => {
    // Despesas somam 1232,98 e os estornos 1,28 → declarado coerente = 1231,70.
    const declarado = 1231.70
    const { rows, totalDeclarado } = parseItauXLS(faturaAoa({ declarado }))
    const totais = computeFileTotals(rows)

    expect(totais.qtdDespesas).toBe(5)
    expect(totais.qtdEstornos).toBe(7)
    expect(totais.despesas).toBe(1232.98)
    expect(totais.estornos).toBe(1.28)
    expect(totais.total).toBe(declarado)
    // A conferência do parse: nenhuma linha do arquivo ficou de fora nem entrou duas vezes.
    expect(Math.abs(totais.total - totalDeclarado)).toBeLessThanOrEqual(0.01)
  })

  it('conta o estorno TOTAL de uma compra (mesmo valor e descrição da despesa)', () => {
    const { rows } = parseItauXLS(faturaAoa({ estornos: [ESTORNO_TOTAL] }))
    const totais = computeFileTotals(rows)
    // A compra "Aramis" de 149,95 e seu estorno se anulam: as duas linhas existem, o líquido é 0.
    expect(rows.filter(r => r.description === 'Aramis')).toHaveLength(2)
    expect(totais.qtdEstornos).toBe(1)
    expect(totais.total).toBe(1083.03) // 1232,98 − 149,95
  })

  it('devolve vazio quando o arquivo não é uma fatura do Itaú', () => {
    const r = parseItauXLS([['qualquer', 'coisa'], ['sem', 'cabeçalho']])
    expect(r.rows).toEqual([])
    expect(r.totalDeclarado).toBeNull()
  })
})

describe('extractItauTotalDeclarado', () => {
  it('soma o valor de cada cartão listado no cabeçalho', () => {
    const aoa = [
      ['', 'Cartão', '', '', '', '', 'Valor (parcial)'],
      ['', 'Titular - final 4541', '', '', '', '', 900.5],
      ['', 'Adicional - final 9528', '', '', '', '', 331.22],
      ['', 'Data', 'Lançamento', 'Parcelamento', 'Valor'],
    ]
    expect(extractItauTotalDeclarado(aoa, 3)).toBe(1231.72)
  })

  it('devolve null quando o cabeçalho não traz valor', () => {
    expect(extractItauTotalDeclarado([['', 'Nome', 'Fulano'], ['', 'Data', 'Lançamento']], 1)).toBeNull()
  })
})

describe('parseXlsValor', () => {
  it('preserva o sinal em número e em texto pt-BR', () => {
    expect(parseXlsValor(-0.98)).toBe(-0.98)
    expect(parseXlsValor('-1.234,56')).toBe(-1234.56)
    expect(parseXlsValor('R$ 239,02')).toBe(239.02)
    expect(parseXlsValor('')).toBeNull()
    expect(parseXlsValor('abc')).toBeNull()
  })
})

describe('computeFileTotals', () => {
  it('soma despesas e abate estornos', () => {
    const t = computeFileTotals([
      { type: 'expense', amount: 100 },
      { type: 'expense', amount: 50.55 },
      { type: 'income', amount: 0.55 },
    ])
    expect(t).toEqual({
      despesas: 150.55, qtdDespesas: 2,
      estornos: 0.55, qtdEstornos: 1,
      total: 150, qtd: 3,
    })
  })

  it('trata lista vazia sem quebrar', () => {
    expect(computeFileTotals([]).total).toBe(0)
    expect(computeFileTotals(null).qtd).toBe(0)
  })
})
