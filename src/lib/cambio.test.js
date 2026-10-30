import { describe, it, expect } from 'vitest'
import {
  moedaDoTexto, numeroDoTexto, spreadDoCartao, planoCompraEstrangeira, aliquotaIof, iofEmLinhaSeparada, camposDaCompra,
  lancamentoDoIof, ajusteDaCompraEstimada, iofAposMudancaDaCompra, categoriaDoIof, rotuloCambio, SPREAD_PADRAO, IOF_PADRAO,
} from './cambio.js'
import { buscarPtax, urlPtax } from './ptax.js'
import { classificarContas } from './assistente/contas.js'
import { validarAcao } from './assistente/acoes.js'

const SMS = 'Compra aprovada no seu PERSON BLACK PONTOS final 2122 - VERCEL INC. valor US 20,00 em 23/10, as 18h22.'
const cartao = { id: 'itaupers', type: 'credit' }

describe('moeda do texto', () => {
  it('SMS real "valor US 20,00" → USD 20; variações US$/USD/U$/dólares', () => {
    expect(moedaDoTexto(SMS)).toEqual({ moeda: 'USD', valor: 20 })
    expect(moedaDoTexto('gastei US$ 1.234,56 na amazon')).toEqual({ moeda: 'USD', valor: 1234.56 })
    expect(moedaDoTexto('USD 9.99 openai')).toEqual({ moeda: 'USD', valor: 9.99 })
    expect(moedaDoTexto('paguei U$ 15 no app')).toEqual({ moeda: 'USD', valor: 15 })
    expect(moedaDoTexto('30 dólares no uber')).toEqual({ moeda: 'USD', valor: 30 })
  })
  it('compra em real não tem moeda (nem "BONUS 20")', () => {
    expect(moedaDoTexto('Compra aprovada de R$ 216,00 em CONTA VIVO')).toBeNull()
    expect(moedaDoTexto('BONUS 20 no posto')).toBeNull()
    expect(numeroDoTexto('20,00')).toBe(20)
  })
})

describe('valor em R$, spread e IOF', () => {
  it('SMS: US$ 20 × PTAX simulada × (1 + 2,5%) = 106,60; IOF 3,5% em linha separada = 3,73', () => {
    const ptax = 106.60 / (20 * 1.025)
    const p = planoCompraEstrangeira({ valorOriginal: 20, cotacao: ptax, spread: SPREAD_PADRAO, aliquota: IOF_PADRAO, separada: true })
    expect(p).toEqual({ valorCompra: 106.6, iof: 3.73 })
  })
  it('IOF embutido (linha separada = não) e sem cotação (o usuário digita)', () => {
    expect(planoCompraEstrangeira({ valorOriginal: 20, cotacao: 5.2, spread: 0.025, aliquota: 0.035, separada: false })).toEqual({ valorCompra: 110.33, iof: 0 })
    expect(planoCompraEstrangeira({ valorOriginal: 20, cotacao: null, spread: 0.025, aliquota: 0.035, separada: true })).toEqual({ valorCompra: null, iof: 0 })
  })
  it('padrões: alíquota 3,5%, IOF separado, spread 2,5%; configuráveis', () => {
    expect(aliquotaIof({})).toBe(0.035)
    expect(aliquotaIof({ iofCompraInternacional: 0.0038 })).toBe(0.0038)
    expect(iofEmLinhaSeparada({})).toBe(true)
    expect(iofEmLinhaSeparada({ iofLinhaSeparada: false })).toBe(false)
    expect(spreadDoCartao(cartao, [])).toEqual({ spread: 0.025, origem: 'padrao', n: 0 })
    expect(spreadDoCartao({ ...cartao, spreadCambio: 0.04 }, [])).toEqual({ spread: 0.04, origem: 'cartao', n: 0 })
  })
  it('spread aprendido: média das 3 últimas compras confirmadas do cartão (estimadas e outros cartões fora)', () => {
    const c = (date, spread, extra = {}) => ({ id: date, accountId: 'itaupers', type: 'expense', date, moeda: 'USD', valorOriginal: 10, cotacao: 5, spread, estimado: false, ...extra })
    const txs = [c('2026-07-01', 0.9), c('2026-08-01', 0.03), c('2026-09-01', 0.04), c('2026-10-01', 0.05), c('2026-10-20', 0.5, { estimado: true }), c('2026-10-21', 0.5, { accountId: 'outro' })]
    expect(spreadDoCartao(cartao, txs)).toEqual({ spread: 0.04, origem: 'historico', n: 3 })
  })
})

describe('compra estimada e o IOF ligado', () => {
  const cotacao = 106.6 / 20.5
  const compra = { id: 'c1', accountId: 'itaupers', date: '2026-10-23', faturaMonthYear: '2026-11', amount: 106.6, payee: 'VERCEL INC.', ...camposDaCompra({ moeda: 'USD', valorOriginal: 20, cotacao, spread: 0.025 }) }
  const iof = { id: 'i1', ...lancamentoDoIof(compra, { valor: 3.73, categoryId: 'cat_iof' }) }
  it('IOF: mesmo cartão, data e fatura, descrição com o estabelecimento, ligado à compra', () => {
    expect(iof).toMatchObject({ accountId: 'itaupers', date: '2026-10-23', faturaMonthYear: '2026-11', amount: 3.73, description: 'IOF compra internacional — VERCEL INC.', compraIofId: 'c1', estimado: true, categoryId: 'cat_iof' })
    expect(rotuloCambio(compra)).toBe('US$ 20,00 × 5,33')
  })
  it('compra ajustada pela fatura: tira o estimado, grava o spread real; o IOF estimado recalcula', () => {
    const aj = ajusteDaCompraEstimada(compra, 108.2)
    expect(aj).toMatchObject({ amount: 108.2, estimado: false })
    expect(aj.spread).toBeCloseTo(108.2 / 106.6 * 1.025 - 1, 4)
    expect(iofAposMudancaDaCompra({ ...compra, ...aj }, [iof], 0.035)).toEqual({ apagar: [], mudar: [{ id: 'i1', changes: { amount: 3.79 } }] })
    expect(iofAposMudancaDaCompra({ ...compra, ...aj }, [{ ...iof, estimado: false }], 0.035).mudar).toEqual([])
  })
  it('compra apagada apaga o IOF; categoria do IOF = a que o usuário já usa', () => {
    expect(iofAposMudancaDaCompra(null, [iof], 0.035)).toEqual({ apagar: ['i1'], mudar: [] })
    expect(categoriaDoIof([{ type: 'expense', description: 'Iof Compra Internaciona', categoryId: 'tarifas' }, { type: 'expense', description: 'Uber', categoryId: 'x' }])).toBe('tarifas')
    expect(categoriaDoIof([])).toBeNull()
  })
})

describe('PTAX (Banco Central)', () => {
  const resposta = (venda) => ({ ok: true, json: async () => ({ value: venda ? [{ cotacaoVenda: venda }] : [] }) })
  it('dia útil: cotação do próprio dia; URL no formato MM-DD-YYYY', async () => {
    expect(urlPtax('2026-10-23')).toContain("@dataCotacao='10-23-2026'")
    expect(await buscarPtax('2026-10-23', { fetchFn: async () => resposta(5.2001) })).toEqual({ data: '2026-10-23', venda: 5.2001 })
  })
  it('fim de semana sem PTAX: recua até a sexta; cache por data', async () => {
    const pedidas = []
    const fetchFn = async (url) => { pedidas.push(url); return resposta(url.includes("'10-23-2026'") ? 5.3 : null) }
    const cache = new Map()
    expect(await buscarPtax('2026-10-25', { fetchFn, cache })).toEqual({ data: '2026-10-23', venda: 5.3 })
    expect(pedidas).toHaveLength(3)
    expect(await buscarPtax('2026-10-25', { fetchFn, cache })).toEqual({ data: '2026-10-23', venda: 5.3 })
    expect(pedidas).toHaveLength(3)
  })
  it('nenhuma cotação em 7 dias → null; Banco Central fora → erro (o app deixa o R$ para digitar)', async () => {
    expect(await buscarPtax('2026-10-25', { fetchFn: async () => resposta(null) })).toBeNull()
    await expect(buscarPtax('2026-10-25', { fetchFn: async () => ({ ok: false, status: 500 }) })).rejects.toThrow(/500/)
  })
})

describe('Assistente: SMS de compra em dólar', () => {
  const ROWS = [{ id: 'itaupers', name: 'Cartao Itau Personalite', type: 'credit', profile_id: 'PV', active: true, cartao_finais: ['2122'] }]
  const ctx = (textoPedido) => {
    const contas = classificarContas(ROWS, 'PV')
    return { contas, textoPedido, apelidos: [], perfilAtivo: 'PV', idx: { contas: new Map(contas.map(c => [c.id, c])), categorias: new Map(), favorecidos: new Map(), centros: new Map() } }
  }
  const doModelo = { tipo: 'despesa', valor: 20, data: '2026-10-23', conta_id: 'itaupers', categoria_id: null, descricao: 'VERCEL INC.', favorecido_novo: 'VERCEL INC.', confianca: { valor: 0.9, data: 0.9, conta: 0.9 }, termos: {}, final_cartao: '2122' }
  it('moeda USD e valor ORIGINAL (20), sem converter; o R$ fica para a prévia', () => {
    const r = validarAcao('registrar_lancamento', { ...doModelo, moeda: 'USD' }, ctx(SMS), '2026-10-30')
    expect(r).toMatchObject({ moeda: 'USD', valor_original: 20, valor: null, conta_id: 'itaupers' })
  })
  it('o texto manda: modelo que já converteu (106,60) ou esqueceu a moeda → USD 20', () => {
    expect(validarAcao('registrar_lancamento', { ...doModelo, valor: 106.6, moeda: 'BRL' }, ctx(SMS), '2026-10-30')).toMatchObject({ moeda: 'USD', valor_original: 20 })
  })
  it('compra em real não muda nada', () => {
    const r = validarAcao('registrar_lancamento', { ...doModelo, valor: 216, moeda: 'BRL', descricao: 'CONTA VIVO' }, ctx('Compra aprovada de R$ 216,00 em CONTA VIVO, 27/10 final 2122'), '2026-10-30')
    expect(r.valor).toBe(216)
    expect(r.moeda).toBeUndefined()
    expect(r.valor_original).toBeUndefined()
  })
})
