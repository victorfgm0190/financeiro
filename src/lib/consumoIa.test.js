import { describe, it, expect } from 'vitest'
import { precoVigente, custoDoGrupo, consolidarConsumo, periodoDoFiltro, precoDigitado, rotuloFerramenta } from './consumoIa.js'

// Preços fictícios (US$ por milhão): o código não conhece preço nenhum.
const precos = [
  { modelo: 'm1', vigencia: '2026-10-01', entrada: 1, saida: 5, cache_leitura: 0.1, cache_criacao: 1.25 },
  { modelo: 'm1', vigencia: '2026-10-20', entrada: 2, saida: 10, cache_leitura: 0.2, cache_criacao: 2.5 },
  { modelo: 'm2', vigencia: '2026-10-01', entrada: 3, saida: null, cache_leitura: null, cache_criacao: null },
]
const g = (o) => ({ ambiente: 'vm', dia: '2026-10-25', ferramenta: 'lote', modelo: 'm1', chamadas: 1, entrada: 0, leitura: 0, criacao: 0, saida: 0, imagens: 0, duracaoSoma: 0, duracaoN: 0, cortadas: 0, ...o })

describe('preço vigente na data da chamada', () => {
  it('a vigência mais recente até o dia', () => {
    expect(precoVigente(precos, 'm1', '2026-10-19').entrada).toBe(1)
    expect(precoVigente(precos, 'm1', '2026-10-20').entrada).toBe(2)
    expect(precoVigente(precos, 'm1', '2026-09-30')).toBeNull()
    expect(precoVigente(precos, 'outro', '2026-10-25')).toBeNull()
  })
})

describe('custo de um grupo', () => {
  it('entrada sem cache, saída, leitura e criação do cache, cada um no seu preço', () => {
    // 1.000.000 de entrada total = 900.000 do cache + 50.000 criação + 50.000 sem cache
    const c = custoDoGrupo(g({ entrada: 1_000_000, leitura: 900_000, criacao: 50_000, saida: 100_000 }), precos[0])
    expect(c).toBeCloseTo(0.05 * 1 + 0.1 * 5 + 0.9 * 0.1 + 0.05 * 1.25, 6)
  })
  it('sem preço cadastrado para um tipo de token usado → null; tipo não usado não importa', () => {
    expect(custoDoGrupo(g({ entrada: 1000, saida: 10 }), precos[2])).toBeNull()
    expect(custoDoGrupo(g({ entrada: 1_000_000 }), precos[2])).toBe(3)
    expect(custoDoGrupo(g({ entrada: 1 }), null)).toBeNull()
  })
})

describe('consolidação', () => {
  it('totais, por cliente, por dia, por ferramenta; preço pela data de cada grupo', () => {
    const r = consolidarConsumo([
      g({ dia: '2026-10-19', chamadas: 2, entrada: 1_000_000, saida: 0, duracaoSoma: 4000, duracaoN: 2 }),
      g({ dia: '2026-10-20', chamadas: 1, entrada: 1_000_000, imagens: 1, cortadas: 1, duracaoSoma: 9000, duracaoN: 1 }),
      g({ ambiente: 'cv', ferramenta: 'registrar_lancamento', chamadas: 1, entrada: 500_000 }),
    ], precos)
    expect(r.totais).toMatchObject({ chamadas: 4, entrada: 2_500_000, imagens: 1, cortadas: 1, custo: 1 + 2 + 1, duracaoMedia: Math.round(13000 / 3) })
    expect(r.totais.custoMedio).toBe(1)
    expect(r.porCliente.map(c => [c.chave, c.chamadas, c.custo])).toEqual([['vm', 3, 3], ['cv', 1, 1]])
    expect(r.porDia.map(d => d.chave)).toEqual(['2026-10-19', '2026-10-20', '2026-10-25'])
    expect(r.porFerramenta.map(f => f.chave)).toEqual(['lote', 'registrar_lancamento'])
    expect(r.modelosSemPreco).toEqual([])
  })
  it('sem preço: só tokens (custo null) e a lista de modelos a cadastrar; parcial conta o que tem preço', () => {
    const so = consolidarConsumo([g({ modelo: 'novo', entrada: 10 })], precos)
    expect(so.totais.custo).toBeNull()
    expect(so.totais.custoMedio).toBeNull()
    expect(so.modelosSemPreco).toEqual(['novo'])
    const parcial = consolidarConsumo([g({ modelo: 'novo', entrada: 10 }), g({ entrada: 1_000_000 })], precos)
    expect(parcial.totais).toMatchObject({ custo: 2, semPreco: 1, custoMedio: 2 })
  })
  it('linha antiga sem tempo nem divisão de cache: tempo médio só das que têm', () => {
    const r = consolidarConsumo([g({ duracaoN: 0 }), g({ duracaoSoma: 3000, duracaoN: 1 })], precos)
    expect(r.totais.duracaoMedia).toBe(3000)
  })
})

describe('apoio da tela', () => {
  it('períodos: este mês e o anterior', () => {
    expect(periodoDoFiltro('atual', '2026-10-30')).toEqual({ inicio: '2026-10-01', fim: '2026-10-31' })
    expect(periodoDoFiltro('anterior', '2026-01-15')).toEqual({ inicio: '2025-12-01', fim: '2025-12-31' })
  })
  it('preço digitado: vírgula ou ponto decimal, vazio = null, inválido = undefined', () => {
    expect(precoDigitado('0,80')).toBe(0.8)
    expect(precoDigitado('0.80')).toBe(0.8)
    expect(precoDigitado('1.250,5')).toBe(1250.5)
    expect(precoDigitado('')).toBeNull()
    expect(precoDigitado('-1')).toBeUndefined()
    expect(precoDigitado('abc')).toBeUndefined()
  })
  it('rótulo da ferramenta', () => {
    expect(rotuloFerramenta('lote')).toBe('Lote')
    expect(rotuloFerramenta('nova_acao')).toBe('nova_acao')
  })
})
