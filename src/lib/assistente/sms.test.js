import { describe, it, expect } from 'vitest'
import { parcelasDoTexto, parcelamentoDoTexto, descricaoGenericaDeCompra } from './texto'
import { classificarContas } from './contas'
import { validarAcao } from './acoes'
import { initialDaSugestao } from '../assistente'

// SMS/push de compra no cartão (Itaú, Nubank, BB). O valor da mensagem é o TOTAL da compra.
const SMS = {
  itau: 'Compra aprovada de R$ 446,99 em 3x em RAIA1476, 29/10 as 18:22 no seu Itau final 4541.',
  itauAVista: 'Compra aprovada de R$ 52,30 em RAIA1476, 29/10 as 18:22 no seu Itau final 4541.',
  nubank: 'Compra de R$ 446,99 APROVADA em RAIA1476 para o cartão com final 4541. Parcelada em 3x.',
  nubankParcelas: 'Nubank: compra aprovada de R$ 446,99 em 3 parcelas em RAIA1476, cartão final 4541.',
  bb: 'BB: compra no cartao final 4541 aprovada. RAIA1476 R$ 446,99 parcelado em 3 vezes 29/10 18:22.',
}

describe('SMS de cartão: parcelas', () => {
  it('Itaú "em 3x", Nubank "Parcelada em 3x" / "3 parcelas", BB "parcelado em 3"', () => {
    expect(parcelasDoTexto(SMS.itau)).toBe(3)
    expect(parcelasDoTexto(SMS.nubank)).toBe(3)
    expect(parcelasDoTexto(SMS.nubankParcelas)).toBe(3)
    expect(parcelasDoTexto(SMS.bb)).toBe(3)
  })
  it('à vista ("em 1x" ou sem menção) → null; datas e horas não viram parcela', () => {
    expect(parcelasDoTexto(SMS.itauAVista)).toBeNull()
    expect(parcelasDoTexto('compra em 1x no mercado')).toBeNull()
    expect(parcelasDoTexto('gastei 50 no posto dia 29/10 as 18:22')).toBeNull()
  })
  it('descrição genérica de compra é trocada pelo estabelecimento', () => {
    for (const d of ['Compra em 3x', 'Compra', 'Compra aprovada', 'compra parcelada', 'Compra no cartão', null]) expect(descricaoGenericaDeCompra(d), String(d)).toBe(true)
    for (const d of ['RAIA1476', 'Farmácia', 'Compra de pneus']) expect(descricaoGenericaDeCompra(d), d).toBe(false)
  })
})

const ROWS = [
  { id: 'itaupers', name: 'Cartao Itau Personalite', apelido: 'Itaupers', type: 'credit', vinculo_tipo: 'none', profile_id: 'PV', active: true, cartao_finais: ['4541'] },
  { id: 'itau', name: 'Itau Principal', apelido: 'Itau', type: 'checking', is_main: true, profile_id: 'PV', active: true },
]
const montar = (textoPedido) => {
  const contas = classificarContas(ROWS, 'PV')
  return {
    contas, textoPedido, apelidos: [], perfilAtivo: 'PV', temImagem: false,
    idx: { contas: new Map(contas.map(c => [c.id, c])), categorias: new Map([['cat_far', { tipo: 'expense' }], ['cat_comb', { tipo: 'expense' }], ['cat_calc', { tipo: 'expense' }]]), favorecidos: new Map(), centros: new Map() },
  }
}
// Resposta típica do modelo antes da regra nova: sem parcelas e descrição "Compra em 3x".
const doModelo = {
  tipo: 'despesa', valor: 446.99, data: '2026-10-29', conta_id: 'itaupers', categoria_id: 'cat_far',
  favorecido_novo: 'RAIA1476', descricao: 'Compra em 3x', confianca: { valor: 1, conta: 1, categoria: 0.8, descricao: 0.6 },
}

describe('registrar_lancamento a partir do SMS', () => {
  for (const [banco, texto] of Object.entries({ itau: SMS.itau, nubank: SMS.nubank, bb: SMS.bb })) {
    it(`${banco}: parcelado em 3, valor TOTAL, descrição = estabelecimento`, () => {
      const r = validarAcao('registrar_lancamento', doModelo, montar(texto), '2026-10-29')
      expect(r).toMatchObject({ parcelas: 3, valor: 446.99, descricao: 'RAIA1476', favorecido_novo: 'RAIA1476', conta_id: 'itaupers' })
    })
  }
  it('o número de parcelas do modelo vale quando o texto não diz (ex.: foto)', () => {
    expect(validarAcao('registrar_lancamento', { ...doModelo, parcelas: 4 }, montar('foto do comprovante'), '2026-10-29').parcelas).toBe(4)
  })
  it('à vista: sem parcelas; descrição específica do modelo fica', () => {
    const r = validarAcao('registrar_lancamento', { ...doModelo, valor: 52.3, descricao: 'Farmácia' }, montar(SMS.itauAVista), '2026-10-29')
    expect(r.parcelas).toBeUndefined()
    expect(r.descricao).toBe('Farmácia')
  })
  it('prévia: Parcelado ligado com N parcelas e o valor TOTAL (o formulário divide)', () => {
    const r = validarAcao('registrar_lancamento', doModelo, montar(SMS.itau), '2026-10-29')
    expect(initialDaSugestao('registrar_lancamento', r)).toMatchObject({ amount: '446.99', installments: 3, description: 'RAIA1476', payee: 'RAIA1476', accountId: 'itaupers' })
    expect(initialDaSugestao('registrar_lancamento', { ...r, parcelas: null }).installments).toBeUndefined()
  })
})

describe('parcelado por frase livre (voz/texto)', () => {
  it('reconhece o número de parcelas (2 a 12 por extenso)', () => {
    for (const t of ['comprei em 4 vezes', 'paguei 4 vezes', 'foi 4x', 'parcelei em 4', 'parcelado em 4 vezes', 'dividi em 4', 'em quatro vezes', 'parcelei em doze vezes'])
      expect(parcelasDoTexto(t), t).toBe(t.includes('doze') ? 12 : 4)
    for (const t of ['gastei 300 em 2 restaurantes', 'paguei 2 contas de luz', 'compra em 1x no mercado']) expect(parcelasDoTexto(t), t).toBeNull()
  })
  it('valor TOTAL × valor DA PARCELA', () => {
    expect(parcelamentoDoTexto('R$ 350 em 4 vezes')).toEqual({ n: 4, valorParcela: null, claro: true })
    expect(parcelamentoDoTexto('parcelei 350 em 4x')).toEqual({ n: 4, valorParcela: null, claro: true })
    expect(parcelamentoDoTexto('4 vezes de 350')).toEqual({ n: 4, valorParcela: 350, claro: true })
    expect(parcelamentoDoTexto('4 parcelas de R$ 350')).toEqual({ n: 4, valorParcela: 350, claro: true })
    expect(parcelamentoDoTexto('4x de 350')).toEqual({ n: 4, valorParcela: 350, claro: true })
    expect(parcelamentoDoTexto('4 parcelas de 1.400,00').valorParcela).toBe(1400)
    // Na dúvida ("4x" solto): TOTAL, mas a conferir.
    expect(parcelamentoDoTexto('350 4x no posto')).toEqual({ n: 4, valorParcela: null, claro: false })
  })
  it('"parcelei R$350 no posto de gasolina em 4 vezes" → total 350, 4x, Combustível', () => {
    const texto = 'parcelei R$350 no posto de gasolina em 4 vezes'
    const r = validarAcao('registrar_lancamento', { ...doModelo, valor: 350, categoria_id: 'cat_comb', favorecido_novo: null, descricao: 'Combustível' }, montar(texto), '2026-10-29')
    expect(r).toMatchObject({ valor: 350, parcelas: 4, categoria_id: 'cat_comb', descricao: 'Combustível' })
    expect(r.aviso_parcelas).toBeUndefined()
  })
  it('"comprei um tênis 4x de 150 na Centauro" → total 600, com o aviso', () => {
    const texto = 'comprei um tênis 4x de 150 na Centauro'
    const r = validarAcao('registrar_lancamento', { ...doModelo, valor: 150, categoria_id: 'cat_calc', favorecido_novo: 'Centauro', descricao: 'Tênis' }, montar(texto), '2026-10-29')
    expect(r).toMatchObject({ valor: 600, parcelas: 4, valor_parcela: 150, aviso_parcelas: '4 × R$ 150,00 = R$ 600,00', favorecido_novo: 'Centauro', descricao: 'Tênis' })
    expect(initialDaSugestao('registrar_lancamento', r)).toMatchObject({ amount: '600', installments: 4 })
  })
  it('"4 vezes de 350" → 4 × R$ 350,00 = R$ 1.400,00', () => {
    const r = validarAcao('registrar_lancamento', { ...doModelo, valor: 350 }, montar('comprei uma cadeira 4 vezes de 350'), '2026-10-29')
    expect(r).toMatchObject({ valor: 1400, aviso_parcelas: '4 × R$ 350,00 = R$ 1.400,00' })
  })
  it('na dúvida: TOTAL e o valor marcado para conferir', () => {
    const r = validarAcao('registrar_lancamento', { ...doModelo, valor: 350 }, montar('350 4x no posto'), '2026-10-29')
    expect(r.valor).toBe(350)
    expect(r.parcelas).toBe(4)
    expect(r.confianca.valor).toBeLessThan(0.5)
  })
})
