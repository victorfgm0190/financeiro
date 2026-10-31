import { describe, it, expect } from 'vitest'
import { validarAcao } from './acoes'
import { classificarContas } from './contas'
import { fundirLancamentoEAgendamento, blocosDoPedido } from './lote'

const ROWS = [
  { id: 'cartao', name: 'Cartao X', apelido: 'CartaoX', type: 'credit', vinculo_tipo: 'none', profile_id: 'P', active: true, cartao_finais: ['1234'] },
  { id: 'cc', name: 'Conta Principal', apelido: 'Conta', type: 'checking', is_main: true, profile_id: 'P', active: true },
]
const CATS = [['cat_gas', { tipo: 'expense' }], ['cat_ali', { tipo: 'expense' }], ['cat_seg', { tipo: 'expense' }], ['cat_luz', { tipo: 'expense' }], ['cat_rec', { tipo: 'income' }]]
const montar = (textoPedido) => {
  const contas = classificarContas(ROWS, 'P')
  return {
    contas, textoPedido, apelidos: [], perfilAtivo: 'P', temImagem: false,
    idx: { contas: new Map(contas.map(c => [c.id, c])), categorias: new Map(CATS), favorecidos: new Map(), centros: new Map() },
  }
}
const base = { tipo: 'despesa', data: '2026-11-12', conta_id: 'cartao', categoria_id: 'cat_seg', descricao: 'Seguro X', favorecido_novo: 'Seguro X', confianca: {} }

describe('validação do Assistente — parcela existente, rateio, documento, repetir', () => {
  it('24) SMS "parcela 10/12": parcela de compra existente, NUNCA compra nova de 12x (mesmo se o modelo mandar parcelas)', () => {
    const sms = 'Compra aprovada de R$ 150,00 em SEGURO X parcela 10/12 cartao final 1234'
    const r = validarAcao('registrar_lancamento', { ...base, valor: 150, parcelas: 12 }, montar(sms), '2026-11-12')
    expect(r.parcela_atual).toEqual({ numero: 10, total: 12 })
    expect(r.parcelas).toBeUndefined()
    expect(r.valor).toBe(150)
    expect(r.pergunta_cartao).toBeUndefined()
  })

  it('23) compra nova "em 3x" continua Parcelado', () => {
    const r = validarAcao('registrar_lancamento', { ...base, valor: 300 }, montar('Compra aprovada R$ 300 em 3x LOJA cartao final 1234'), '2026-11-12')
    expect(r.parcelas).toBe(3)
    expect(r.parcela_atual).toBeUndefined()
  })

  it('28) rateio: um lançamento de R$ 250 (Gasolina 200 / Alimentação 50)', () => {
    const r = validarAcao('registrar_lancamento', {
      ...base, conta_id: 'cc', valor: 250, descricao: 'Posto', categoria_id: 'cat_gas',
      rateio: [{ categoria_id: 'cat_gas', valor: 200, termo: 'gasolina' }, { categoria_id: 'cat_ali', valor: 50, termo: 'alimentação' }],
    }, montar('gastei 250 no posto, 200 de gasolina e 50 de alimentação'), '2026-11-12')
    expect(r.rateio.map(l => [l.categoria_id, l.valor])).toEqual([['cat_gas', 200], ['cat_ali', 50]])
    expect(r.rateio_faltam).toBe(0)
  })

  it('29) "gastei 250 no posto, 200 de gasolina" → faltam R$ 50; sem total → total = soma; categoria de receita é recusada', () => {
    const faltam = validarAcao('registrar_lancamento', {
      ...base, conta_id: 'cc', valor: 250, rateio: [{ categoria_id: 'cat_gas', valor: 200 }, { categoria_id: 'cat_ali', valor: 0 }],
    }, montar('gastei 250 no posto, 200 de gasolina'), '2026-11-12')
    expect(faltam.rateio.map(l => [l.categoria_id, l.valor])).toEqual([['cat_gas', 200]])
    expect(faltam.rateio_faltam).toBe(50) // a prévia pergunta onde vão os R$ 50
    const r = validarAcao('registrar_lancamento', {
      ...base, conta_id: 'cc', valor: 250, rateio: [{ categoria_id: 'cat_gas', valor: 150 }, { categoria_id: 'cat_ali', valor: 50 }],
    }, montar('gastei 250 no posto, 150 de gasolina e 50 de lanche'), '2026-11-12')
    expect(r.rateio_faltam).toBe(50)
    const semTotal = validarAcao('registrar_lancamento', {
      ...base, conta_id: 'cc', valor: null, rateio: [{ categoria_id: 'cat_gas', valor: 100 }, { categoria_id: 'cat_rec', valor: 100 }],
    }, montar('100 confraternização e 100 mercado'), '2026-11-12')
    expect(semTotal.valor).toBe(200)
    expect(semTotal.rateio[1].categoria_id).toBeNull()
  })

  it('15) documento: contrato lido do texto mesmo sem o modelo', () => {
    const r = validarAcao('criar_agendamento', {
      ...base, conta_id: 'cc', valor: 389.9, vencimento: '2026-12-10', recorrencia: 'once',
      documento: { natureza: 'boleto', vencimento: '2026-12-10', pago: false },
    }, montar('Boleto Financeira Contrato nº 12345 vencimento 10/12/2026'), '2026-11-12')
    expect(r.documento).toEqual({ natureza: 'boleto', numero_contrato: '12345', vencimento: '2026-12-10', pago: false })
  })

  it('21/22) repetir com dia e data final', () => {
    const r = validarAcao('registrar_lancamento', {
      ...base, conta_id: 'cc', valor: 250, categoria_id: 'cat_luz', repetir: 'monthly', repetir_dia: 10, repetir_ate: '2027-12-31',
    }, montar('despesa de energia 250 e agende todo dia 10 até dezembro de 2027'), '2026-11-12')
    expect(r).toMatchObject({ repetir: 'monthly', repetir_dia: 10, repetir_ate: '2027-12-31' })
  })

  it('21) duas chamadas (registrar + agendar do mesmo item) viram UMA com repetir e dia', () => {
    const blocos = [
      { type: 'tool_use', name: 'registrar_lancamento', input: { valor: 250, descricao: 'Energia' } },
      { type: 'tool_use', name: 'criar_agendamento', input: { valor: 250, recorrencia: 'monthly', vencimento: '2026-12-10' } },
    ]
    expect(fundirLancamentoEAgendamento(blocos)).toEqual([{ type: 'tool_use', name: 'registrar_lancamento', input: { valor: 250, descricao: 'Energia', repetir: 'monthly', repetir_dia: 10 } }])
    const r = blocosDoPedido(blocos, new Set(['registrar_lancamento', 'criar_agendamento']))
    expect(r).toMatchObject({ lote: false })
    expect(r.blocos[0].input.repetir).toBe('monthly')
    // Itens diferentes (valores diferentes) seguem como lote.
    const dois = [blocos[0], { ...blocos[1], input: { ...blocos[1].input, valor: 90 } }]
    expect(fundirLancamentoEAgendamento(dois)).toHaveLength(2)
  })
})
