import { describe, it, expect } from 'vitest'
import { parcelasDoTexto, descricaoGenericaDeCompra } from './texto'
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
    idx: { contas: new Map(contas.map(c => [c.id, c])), categorias: new Map([['cat_far', { tipo: 'expense' }]]), favorecidos: new Map(), centros: new Map() },
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
