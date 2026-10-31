// Cenário 29 (teste no celular, 31/10): o modelo devolveu só o total ("Gastei 250 no posto 200 de
// gasolina" → R$ 250 em Combustível, SEM rateio). O texto do pedido passa a montar o rateio parcial.
import { describe, it, expect } from 'vitest'
import { rateioDoTexto } from './rateioTexto'
import { validarAcao } from './acoes'
import { classificarContas } from './contas'

const PARCIAIS = [
  'gastei 250 no posto, 200 de gasolina',
  'gastei 250 no posto 200 de gasolina',
  'gastei 240 no posto 190 gasolina',
  'gastei 250 reais no posto, 200 reais de gasolina',
  'R$ 250 no posto sendo R$ 200 de gasolina',
  '250 no posto sendo 200 gasolina',
]

describe('rateioDoTexto (puro)', () => {
  it.each(PARCIAIS)('"%s" → total + parte de gasolina, faltam 50', (f) => {
    const r = rateioDoTexto(f)
    expect(r.partes).toHaveLength(1)
    expect(r.partes[0].termo).toBe('gasolina')
    expect(r.faltam).toBe(50)
    expect(r.total - r.partes[0].valor).toBe(50)
  })
  it('rateio completo: duas partes somando o total, termo como foi escrito', () => {
    expect(rateioDoTexto('gastei 250 no posto, 200 de gasolina e 50 de alimentação')).toEqual({
      total: 250, faltam: 0, partes: [{ valor: 200, termo: 'gasolina' }, { valor: 50, termo: 'alimentação' }],
    })
    expect(rateioDoTexto("McDonald's 200, 100 confraternização e 100 mercado")).toMatchObject({ total: 200, faltam: 0 })
  })
  it.each([
    'gastei 250 de gasolina', 'gastei 250 no posto', 'gastei 80 no uber e 50 no ifood',
    'gastei 250 de gasolina e 50 de alimentação', 'comprei um tênis 4x de 150', 'parcela 10/12 de 150 na loja',
    'gastei 100 no posto, 200 de gasolina',
  ])('"%s" → não é rateio com total', (f) => {
    expect(rateioDoTexto(f)).toBeNull()
  })
  it('números que não são valor (dia, final do cartão) ficam de fora; milhar e centavos', () => {
    expect(rateioDoTexto('gastei 250 no posto dia 10, 200 de gasolina no cartão final 1234')).toMatchObject({ total: 250, faltam: 50 })
    expect(rateioDoTexto('paguei 1.250,50 na loja, 1.000 de roupa')).toEqual({ total: 1250.5, faltam: 250.5, partes: [{ valor: 1000, termo: 'roupa' }] })
  })
})

// Validação do backend com a resposta REAL do modelo (payload gravado no teste do celular: sem rateio).
const ROWS = [{ id: 'cc', name: 'Conta Principal', apelido: 'Conta', type: 'checking', is_main: true, profile_id: 'P', active: true }]
const CATS = [
  ['cat_comb', { tipo: 'expense', caminho: 'Transporte › Combustível' }],
  ['cat_ali', { tipo: 'expense', caminho: 'Alimentação' }],
  ['cat_rec', { tipo: 'income', caminho: 'Salário' }],
]
const montar = (textoPedido) => {
  const contas = classificarContas(ROWS, 'P')
  return {
    contas, textoPedido, apelidos: [], perfilAtivo: 'P', temImagem: false,
    idx: { contas: new Map(contas.map(c => [c.id, c])), categorias: new Map(CATS), favorecidos: new Map(), centros: new Map() },
  }
}
const doModelo = (valor) => ({
  tipo: 'despesa', valor, data: '2026-10-31', conta_id: 'cc', categoria_id: 'cat_comb', descricao: 'Combustível',
  termos: { categoria: 'gasolina', conta: null, favorecido: null }, confianca: {},
})

describe('validarAcao: rateio lido do texto quando o modelo não manda (cenário 29)', () => {
  it.each(PARCIAIS)('"%s" → UM lançamento do total com [Combustível = parte] e faltam 50', (f) => {
    const total = rateioDoTexto(f).total
    const r = validarAcao('registrar_lancamento', doModelo(total), montar(f), '2026-10-31')
    expect(r.valor).toBe(total)
    expect(r.rateio.map(l => [l.categoria_id, l.valor])).toEqual([['cat_comb', total - 50]])
    expect(r.rateio_faltam).toBe(50)
  })
  it('rateio completo: categorias pelo nome do cadastro, sem pergunta', () => {
    const f = 'gastei 250 no posto, 200 de gasolina e 50 de alimentação'
    const r = validarAcao('registrar_lancamento', doModelo(250), montar(f), '2026-10-31')
    expect(r.rateio.map(l => [l.categoria_id, l.valor])).toEqual([['cat_comb', 200], ['cat_ali', 50]])
    expect(r.rateio_faltam).toBe(0)
  })
  it('apelido aprendido vence o nome', () => {
    const ctx = { ...montar('gastei 250 no posto, 200 de gasolina e 50 de lanche'), apelidos: [{ tipo: 'categoria', termo: 'lanche', ref_id: 'cat_ali' }] }
    const r = validarAcao('registrar_lancamento', doModelo(250), ctx, '2026-10-31')
    expect(r.rateio.map(l => l.categoria_id)).toEqual(['cat_comb', 'cat_ali'])
  })
  it.each(['gastei 250 de gasolina', 'gastei 250 no posto'])('"%s" → lançamento comum, sem rateio', (f) => {
    const r = validarAcao('registrar_lancamento', doModelo(250), montar(f), '2026-10-31')
    expect(r.rateio).toBeUndefined()
    expect(r.valor).toBe(250)
  })
  it('total do texto diferente do valor do modelo → não inventa rateio', () => {
    const r = validarAcao('registrar_lancamento', doModelo(200), montar('gastei 250 no posto, 200 de gasolina'), '2026-10-31')
    expect(r.rateio).toBeUndefined()
  })
  it('compra parcelada nunca vira rateio pelo texto', () => {
    const r = validarAcao('registrar_lancamento', doModelo(600), montar('gastei 600 na loja em 4x, 150 de cada'), '2026-10-31')
    expect(r.rateio).toBeUndefined()
  })
})
