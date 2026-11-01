// Acabamento do teste manual 31/10 (Parte B): resumo do rateio, categorias prováveis, favorecido do
// lugar citado e parcela sem o total. Dados fictícios.
import { describe, it, expect } from 'vitest'
import { situacaoRateio, COR_SITUACAO_RATEIO } from '../rateio'
import { categoriasProvaveis, parcelaAtualDoTexto } from './prontidao'
import { estabelecimentoDoTexto } from './texto'
import { validarAcao } from './acoes'
import { classificarContas } from './contas'
import { camposParaConferir } from '../assistente'

describe('B1/B2) situação do rateio', () => {
  it('falta / fecha / passa, com a cor de cada estado (verde não é a cor de receita)', () => {
    expect(situacaoRateio(250, 200)).toEqual({ estado: 'falta', diferenca: 50 })
    expect(situacaoRateio(250, 250)).toEqual({ estado: 'ok', diferenca: 0 })
    expect(situacaoRateio(250, 260)).toEqual({ estado: 'passa', diferenca: 10 })
    expect(COR_SITUACAO_RATEIO).toEqual({ ok: 'text-primary-fg', falta: 'text-aviso', passa: 'text-perigo' })
  })
})

describe('B3) categorias prováveis para o restante', () => {
  const txs = [
    // mais usada no geral (recente): Drogaria
    ...[1, 2, 3, 4].map(i => ({ id: `d${i}`, type: 'expense', categoryId: 'drogaria', payee: 'Farmácia Z', date: '2026-11-0' + i })),
    // mesmo favorecido (antigo): Lanche
    { id: 'f1', type: 'expense', categoryId: 'lanche', payee: 'Posto Alfa', date: '2025-03-01' },
    // outro posto (mesmo tipo: já teve Combustível) com Conveniência, e rateio com Combustível + Lavagem
    { id: 'o1', type: 'expense', categoryId: 'combustivel', payee: 'Posto Beta', date: '2026-10-01' },
    { id: 'o2', type: 'expense', categoryId: 'conveniencia', payee: 'Posto Beta', date: '2026-10-05' },
    { id: 'o3', type: 'expense', categoryId: null, payee: 'Posto Gama', date: '2026-10-07' },
  ]
  const rateios = new Map([['o3', [{ categoriaId: 'combustivel', valor: 100 }, { categoriaId: 'lavagem', valor: 30 }]]])
  it('mesmo favorecido > mesmo tipo de estabelecimento (pelo histórico e pelas linhas do rateio) > mais usadas', () => {
    const r = categoriasProvaveis(txs, { hoje: '2026-11-12', excluir: ['combustivel'], favorecido: 'Posto Alfa', categoriasBase: ['combustivel'], rateios, n: 4 })
    expect(r[0]).toBe('lanche')
    expect(r.slice(1, 3).sort()).toEqual(['conveniencia', 'lavagem'])
    expect(r[3]).toBe('drogaria')
  })
  it('sem favorecido nem histórico parecido: as mais usadas, como antes', () => {
    expect(categoriasProvaveis(txs, { hoje: '2026-11-12', excluir: ['combustivel'] })[0]).toBe('drogaria')
  })
})

describe('B4) favorecido pelo lugar citado', () => {
  it('estabelecimentoDoTexto: lugar como foi escrito; meio de pagamento e conta ficam de fora', () => {
    expect(estabelecimentoDoTexto('gastei 250 no posto, 200 de gasolina')).toBe('posto')
    expect(estabelecimentoDoTexto('gastei 80 na Padaria Pão Quente hoje')).toBe('Padaria Pão Quente')
    expect(estabelecimentoDoTexto('paguei 30 no pix na farmácia')).toBe('farmácia')
    expect(estabelecimentoDoTexto('almoço 45 no banco x na lanchonete', { ignorar: n => n === 'banco x' })).toBe('lanchonete')
    expect(estabelecimentoDoTexto('gastei 250 de gasolina')).toBeNull()
    expect(estabelecimentoDoTexto('gastei 50 no cartão')).toBeNull()
  })
  const ROWS = [{ id: 'cc', name: 'Banco X', apelido: 'BX', type: 'checking', is_main: true, profile_id: 'P', active: true }]
  const montar = (textoPedido, favorecidos = []) => {
    const contas = classificarContas(ROWS, 'P')
    return {
      contas, textoPedido, apelidos: [], perfilAtivo: 'P', temImagem: false,
      idx: { contas: new Map(contas.map(c => [c.id, c])), categorias: new Map([['cat_c', { tipo: 'expense' }]]), favorecidos: new Map(favorecidos.map(n => [n.toLowerCase(), n])), centros: new Map() },
    }
  }
  const p = { tipo: 'despesa', valor: 250, data: '2026-10-31', conta_id: 'cc', categoria_id: 'cat_c', descricao: 'Combustível', confianca: {} }
  it('sem favorecido do modelo: o termo citado (1ª maiúscula), marcado "confira"', () => {
    const r = validarAcao('registrar_lancamento', p, montar('gastei 250 no posto, 200 de gasolina'), '2026-10-31')
    expect(r).toMatchObject({ favorecido_id: null, favorecido_novo: 'Posto' })
    expect(r.confianca.favorecido).toBeLessThan(1)
    expect(camposParaConferir('registrar_lancamento', r)).toContain('payee')
  })
  it('casa com favorecido existente; conta citada não vira favorecido', () => {
    expect(validarAcao('registrar_lancamento', p, montar('gastei 250 no posto alfa', ['Posto Alfa']), '2026-10-31').favorecido_id).toBe('Posto Alfa')
    const r = validarAcao('registrar_lancamento', p, montar('gastei 250 no banco x'), '2026-10-31')
    expect(r.favorecido_novo).toBeNull()
  })
  it('favorecido que o modelo já mandou continua valendo', () => {
    const r = validarAcao('registrar_lancamento', { ...p, favorecido_novo: 'Auto Posto Beta' }, montar('gastei 250 no posto'), '2026-10-31')
    expect(r.favorecido_novo).toBe('Auto Posto Beta')
  })
})

describe('B6) parcela sem o total', () => {
  it.each([['YelumSeg Parc8', 8], ['PARC08', 8], ['Parc 8', 8], ['compra P8 aprovada', 8]])('"%s" → nº %i, total a completar', (t, n) => {
    expect(parcelaAtualDoTexto(t)).toEqual({ numero: n, total: null })
  })
  it('com o total continua igual; números soltos não viram parcela', () => {
    expect(parcelaAtualDoTexto('parcela 8/12')).toEqual({ numero: 8, total: 12 })
    expect(parcelaAtualDoTexto('Parc 8 de 12')).toEqual({ numero: 8, total: 12 })
    expect(parcelaAtualDoTexto('paguei a parcela 350 do carro')).toBeNull()
    expect(parcelaAtualDoTexto('PS5 novo')).toBeNull()
    expect(parcelaAtualDoTexto('parcelei em 4x')).toBeNull()
  })
})
