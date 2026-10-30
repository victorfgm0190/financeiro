import { describe, it, expect } from 'vitest'
import { blocosDoPedido, segmentosDoPedido, trechosDosItens, MAX_ITENS_LOTE } from './lote.js'
import { pendenciasDoItem, lancamentoDireto, sugestaoComConta, MOTIVOS } from './loteApp.js'
import { classificarContas } from './contas.js'
import { validarAcao } from './acoes.js'
import { computeOccurrences } from '../occurrences.js'

const TRES = 'lançar 100 reais de combustível\nlançar 200 reais de refeição\nlançar 150 de mercado'
const uso = (name, input) => ({ type: 'tool_use', name, input })
const disp = new Set(['registrar_lancamento', 'criar_agendamento', 'consultar_saldo', 'perguntar'])

describe('lote no backend', () => {
  it('2+ chamadas de criação → lote (até 10); 1 chamada ou mistura → o 1º bloco, como sempre', () => {
    const tres = [uso('registrar_lancamento', { valor: 100 }), uso('registrar_lancamento', { valor: 200 }), uso('registrar_lancamento', { valor: 150 })]
    expect(blocosDoPedido(tres, disp)).toMatchObject({ lote: true })
    expect(blocosDoPedido(tres, disp).blocos).toHaveLength(3)
    expect(blocosDoPedido([tres[0]], disp)).toEqual({ lote: false, blocos: [tres[0]] })
    expect(blocosDoPedido([tres[0], uso('consultar_saldo', {})], disp)).toEqual({ lote: false, blocos: [tres[0]] })
    const doze = Array.from({ length: 12 }, (_, i) => uso('registrar_lancamento', { valor: i + 1 }))
    expect(blocosDoPedido(doze, disp).blocos).toHaveLength(MAX_ITENS_LOTE)
  })
  it('trechos: linhas, vírgulas, "/" e "e"; cada item pega o trecho com o SEU valor', () => {
    expect(segmentosDoPedido(TRES)).toHaveLength(3)
    expect(segmentosDoPedido('gastei 50 no uber e 80 no ifood no nubank')).toEqual(['gastei 50 no uber', '80 no ifood no nubank'])
    expect(segmentosDoPedido('100 combustível, 200 refeição / 150 mercado')).toHaveLength(3)
    expect(trechosDosItens(TRES, [200, 100, 150])).toEqual(['lançar 200 reais de refeição', 'lançar 100 reais de combustível', 'lançar 150 de mercado'])
    expect(trechosDosItens('US$ 20 na vercel e 30 reais de pão', [20, 30])).toEqual(['US$ 20 na vercel', '30 reais de pão'])
  })
})

// Contas no formato do banco (como contas.test.js): Nubank cartão, Itaú favorita.
const ROWS = [
  { id: 'nubank', name: 'Nubank', apelido: 'NUBANK', type: 'credit', profile_id: 'PV', active: true },
  { id: 'itau', name: 'Itau Principal', apelido: 'Itau', type: 'checking', is_main: true, profile_id: 'PV', active: true },
]
const CATS = new Map([['comb', { tipo: 'expense' }], ['refe', { tipo: 'expense' }], ['merc', { tipo: 'expense' }], ['transp', { tipo: 'expense' }]])
const montar = (textoPedido, trechoItem) => {
  const contas = classificarContas(ROWS, 'PV')
  return { contas, textoPedido, trechoItem, apelidos: [], perfilAtivo: 'PV', idx: { contas: new Map(contas.map(c => [c.id, c])), categorias: CATS, favorecidos: new Map(), centros: new Map() } }
}
const doModelo = (o) => ({ tipo: 'despesa', data: '2026-10-30', conta_id: null, categoria_id: null, descricao: null, confianca: { valor: 1, data: 1, conta: 0, categoria: 0.9, descricao: 0.9 }, termos: {}, ...o })

describe('cada item pelo validador de sempre', () => {
  it('as 3 linhas do exemplo: 3 despesas, valores e categorias próprios, sem conta citada', () => {
    const entradas = [doModelo({ valor: 100, categoria_id: 'comb', descricao: 'Combustível' }), doModelo({ valor: 200, categoria_id: 'refe', descricao: 'Refeição' }), doModelo({ valor: 150, categoria_id: 'merc', descricao: 'Mercado' })]
    const trechos = trechosDosItens(TRES, entradas.map(e => e.valor))
    const itens = entradas.map((e, i) => validarAcao('registrar_lancamento', e, montar(TRES, trechos[i]), '2026-10-30'))
    expect(itens.map(p => [p.valor, p.categoria_id])).toEqual([[100, 'comb'], [200, 'refe'], [150, 'merc']])
    expect(itens.every(p => !p.parcelas && !p.moeda)).toBe(true)
  })
  it('"gastei 50 no uber e 80 no ifood no nubank": a conta citada vale para os dois', () => {
    const txt = 'gastei 50 no uber e 80 no ifood no nubank'
    const entradas = [doModelo({ valor: 50, conta_id: 'nubank', descricao: 'Uber', categoria_id: 'transp' }), doModelo({ valor: 80, conta_id: 'nubank', descricao: 'iFood', categoria_id: 'refe' })]
    const trechos = trechosDosItens(txt, [50, 80])
    const itens = entradas.map((e, i) => validarAcao('registrar_lancamento', e, montar(txt, trechos[i]), '2026-10-30'))
    expect(itens.map(p => p.conta_id)).toEqual(['nubank', 'nubank'])
  })
  it('parcelas e dólar de um item não contaminam os outros', () => {
    const txt = 'US$ 20 na vercel e 300 em 3x na loja'
    const trechos = trechosDosItens(txt, [20, 300])
    const vercel = validarAcao('registrar_lancamento', doModelo({ valor: 20, conta_id: 'nubank', descricao: 'Vercel' }), montar(txt, trechos[0]), '2026-10-30')
    const loja = validarAcao('registrar_lancamento', doModelo({ valor: 300, conta_id: 'nubank', descricao: 'Loja', parcelas: 3 }), montar(txt, trechos[1]), '2026-10-30')
    expect(vercel).toMatchObject({ moeda: 'USD', valor_original: 20 })
    expect(vercel.parcelas).toBeUndefined()
    expect(loja).toMatchObject({ valor: 300, parcelas: 3 })
    expect(loja.moeda).toBeUndefined()
  })
})

describe('lote no app: pendências e gravação direta', () => {
  const accounts = [{ id: 'nubank', name: 'Nubank', type: 'credit', closingDay: 1 }, { id: 'itau', name: 'Itau', type: 'checking' }]
  const gerencialGroups = [{ id: 'grp_D', number: 'D' }, { id: 'grp_1', number: 1 }]
  const ctx = (extra = {}) => ({ accounts, transactions: [], preLancamentos: [], schedules: [], getNextOccurrences: computeOccurrences, categories: [], gerencialGroups, gerencialLigado: true, ...extra })
  const sug = (o) => ({ tipo: 'despesa', valor: 100, data: '2026-10-30', conta_id: 'itau', categoria_id: 'comb', descricao: 'Combustível', confianca: { valor: 1, data: 1, conta: 1, categoria: 1, descricao: 1 }, ...o })
  const item = (o) => ({ ferramenta: 'registrar_lancamento', sugestao: sug(o) })

  it('item limpo: sem pendência; grava os mesmos campos do formulário', () => {
    expect(pendenciasDoItem(item(), ctx())).toEqual([])
    expect(lancamentoDireto(sug(), { accounts, gerencialGroups })).toMatchObject({ type: 'expense', accountId: 'itau', amount: 100, date: '2026-10-30', categoryId: 'comb', description: 'Combustível', accountType: 'checking' })
    expect(lancamentoDireto(sug({ conta_id: 'nubank' }), { accounts, gerencialGroups })).toMatchObject({ accountType: 'credit', grupoGerencial: 'grp_D' })
  })
  it('sem conta: pendente até a conta da lista ("vale para todos")', () => {
    expect(pendenciasDoItem(item({ conta_id: null, confianca: { valor: 1, data: 1, conta: 0, categoria: 1, descricao: 1 } }), ctx())).toContain(MOTIVOS.conta)
    const comConta = sugestaoComConta(sug({ conta_id: null, confianca: { valor: 1, data: 1, conta: 0, categoria: 1, descricao: 1 } }), 'itau')
    expect(pendenciasDoItem({ ferramenta: 'registrar_lancamento', sugestao: comConta }, ctx())).toEqual([])
  })
  it('item que bate com agendamento pendente fica para revisão', () => {
    const vivo = { id: 'vivo', description: 'Conta Vivo', payee: 'Vivo', transactionType: 'expense', accountId: 'itau', amount: 216, frequency: 'monthly', startDate: '2026-09-29', occurrenceType: 'continuous', registered: ['2026-09-29'], skipped: [], overrides: {} }
    const p = pendenciasDoItem(item({ valor: 216, descricao: 'Conta Vivo', categoria_id: 'tel' }), ctx({ schedules: [vivo] }))
    expect(p).toEqual([MOTIVOS.agendamento])
  })
  it('duplicado, campo a conferir, parcelado, dólar, transferência, agendamento e grupo gerido → revisão', () => {
    const tx = { id: 't', type: 'expense', accountId: 'itau', amount: 100, date: '2026-10-29' }
    expect(pendenciasDoItem(item(), ctx({ transactions: [tx] }))).toContain(MOTIVOS.duplicado)
    expect(pendenciasDoItem(item({ categoria_id: null }), ctx())).toContain(MOTIVOS.conferir)
    expect(pendenciasDoItem(item({ parcelas: 3 }), ctx())).toContain(MOTIVOS.parcelado)
    expect(pendenciasDoItem(item({ moeda: 'USD', valor: null, valor_original: 20 }), ctx())).toContain(MOTIVOS.moeda)
    expect(pendenciasDoItem(item({ tipo: 'transferencia', conta_destino_id: 'nubank' }), ctx())).toContain(MOTIVOS.transferencia)
    expect(pendenciasDoItem({ ferramenta: 'criar_agendamento', sugestao: sug() }, ctx())).toEqual([MOTIVOS.agendamentoNovo])
    const cats = [{ id: 'comb', defaultGerencialGroup: 'grp_1' }]
    expect(pendenciasDoItem(item({ conta_id: 'nubank' }), ctx({ categories: cats }))).toContain(MOTIVOS.gerencial)
    expect(pendenciasDoItem(item({ conta_id: 'nubank' }), ctx({ categories: cats, gerencialLigado: false }))).toEqual([])
  })
})
