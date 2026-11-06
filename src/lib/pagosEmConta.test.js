import { describe, it, expect } from 'vitest'
import { pagosEmConta, lancamentoPagoEmConta } from './pagosEmConta.js'
import { filtrarPagamentos } from './ocorrenciasRegistradas.js'
import { filtrarPorTipo, contarPorTipo } from './agendamentosTipo.js'
import { SEM_CATEGORIA, casaCategoria } from './filtroCategoria.js'
import { filtrarAgendamentos } from './agendamentosFiltro.js'
import { lancamentoNasContas } from './origins.js'
import { linhasDosPagos } from './exportarAgendamentos.js'

const accounts = [
  { id: 'banco', name: 'Banco A', type: 'checking', profileId: 'pa' },
  { id: 'banco2', name: 'Banco B', type: 'checking', profileId: 'pb' },
  { id: 'cartao', name: 'Cartão qualquer', type: 'credit', profileId: 'pa' },
  { id: 'bem', name: 'Consórcio', type: 'asset', profileId: 'pa' },
]
const tx = (id, type, amount, extra = {}) => ({ id, type, amount, date: '2026-06-12', accountId: 'banco', description: id, payee: '', ...extra })
const reembolso = tx('reembolso', 'income', 341.5, { categoryId: 'cat_reembolso' })
const parcela = { id: 'ag', description: 'PARCELA', transactionType: 'transfer', accountId: 'banco', toAccountId: 'bem', amount: 341.7, frequency: 'monthly', startDate: '2026-06-08', occurrenceType: 'continuous', registered: ['2026-06-08'], skipped: [], overrides: {} }
const paga = tx('paga', 'transfer', 341.7, { date: '2026-06-08', toAccountId: 'bem', scheduleId: 'ag', description: 'PARCELA' })
const montar = (transactions, schedules = []) => pagosEmConta({ transactions, schedules, accounts })
const ids = (linhas) => linhas.map(l => l.txId)

describe('o que entra em Pagos', () => {
  it('avulso em conta entra como Entrada, com selo e sem vencimento nem parcela', () => {
    const [l] = montar([reembolso])
    expect(l).toMatchObject({ txId: 'reembolso', semVinculo: true, dataPagamento: '2026-06-12', vencimento: null, parcela: null, amount: 341.5 })
    expect(filtrarPorTipo([l], 'entradas', undefined, accounts)).toHaveLength(1)
  })
  it('compra e parcela em cartão não entram; a conta é reconhecida pelo tipo, não pelo nome', () => {
    expect(montar([tx('c1', 'expense', 10, { accountId: 'cartao' }), tx('c2', 'income', 5, { accountId: 'cartao' })])).toEqual([])
    const banco = [{ id: 'x', name: 'Cartão de crédito no nome', type: 'checking' }]
    expect(pagosEmConta({ transactions: [tx('d', 'expense', 1, { accountId: 'x' })], accounts: banco })).toHaveLength(1)
  })
  it('sintético, espelho, sombra, estimado, provisão, troca de bens e sem conta não entram', () => {
    const fora = [
      tx('sch:ag@2026-06-12', 'expense', 1),
      tx('sombra', 'expense', 1, { reservaAuto: true, accountId: null }),
      tx('sombra2', 'expense', 1, { reservaAuto: true }),
      tx('espelho', 'expense', 1, { isEspelho: true }),
      tx('iof', 'expense', 1, { estimado: true }),
      tx('prov', 'transfer', 1, { origin: 'auto-provisao', toAccountId: 'bem' }),
      tx('perda', 'expense', 1, { origin: 'patrimonio_auto', accountId: null, bemId: 'bem' }),
      tx('perda2', 'expense', 1, { origin: 'patrimonio_auto' }),
      tx('semconta', 'expense', 1, { accountId: null }),
    ]
    expect(montar(fora)).toEqual([])
  })
  it('receita de benefício de uma baixa, gravada em conta, entra; a baixa em si não é lançamento', () => {
    expect(lancamentoPagoEmConta(tx('beneficio', 'income', 7, { origin: 'bem_baixa' }), new Map(accounts.map(a => [a.id, a])))).toBe(true)
  })
})

describe('sem duplicidade', () => {
  it('baixa de agendamento aparece uma vez, com vencimento e parcela do agendamento', () => {
    const linhas = montar([paga], [parcela])
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toMatchObject({ txId: 'paga', semVinculo: false, vencimento: '2026-06-08', parcela: 1, scheduleId: 'ag' })
  })
  it('baixa sem lançamento não vira linha', () => {
    const baixada = { ...parcela, id: 'ag2', registered: ['2026-06-08'] }
    expect(montar([], [baixada])).toEqual([])
  })
  it('valor de 341,00 a 342,00: a parcela e o reembolso, uma vez cada; a sombra fica fora', () => {
    const sombra = tx('tx_inv_paga', 'expense', 341.7, { accountId: null, reservaAuto: true, origin: 'reserva_auto' })
    const linhas = filtrarPagamentos(montar([paga, sombra, reembolso], [parcela]), { min: 341, max: 342 })
    expect(ids(linhas).sort()).toEqual(['paga', 'reembolso'])
    expect(ids(filtrarPagamentos(linhas, { min: 341.5, max: 341.5 }))).toEqual(['reembolso'])
  })
})

describe('transferências', () => {
  const entrePerfis = tx('t', 'transfer', 100, { accountId: 'banco', toAccountId: 'banco2' })
  const fatura = tx('f', 'transfer', 900, { toAccountId: 'cartao' })
  const devolvido = tx('g', 'transfer', 30, { accountId: 'cartao', toAccountId: 'banco' })

  it('pagamento de fatura pela conta: uma linha em Pagamentos de cartão, não em Transferências', () => {
    const linhas = montar([fatura])
    expect(linhas).toHaveLength(1)
    expect(filtrarPorTipo(linhas, 'pagamentos_cartao', undefined, accounts)).toHaveLength(1)
    expect(filtrarPorTipo(linhas, 'transferencias', undefined, accounts)).toHaveLength(0)
  })
  it('qualquer ponta em cartão é pagamento de cartão', () => {
    expect(filtrarPorTipo(montar([devolvido]), 'pagamentos_cartao', undefined, accounts)).toHaveLength(1)
  })
  it('credit_payment: conta pagadora → cartão, em Pagamentos de cartão; sem pagadora conhecida fica fora', () => {
    const pago = tx('cp', 'credit_payment', 500, { accountId: 'cartao', fromAccountId: 'banco' })
    const [l] = montar([pago])
    expect(l).toMatchObject({ accountId: 'banco', toAccountId: 'cartao', pagamentoCartao: true })
    expect(filtrarPorTipo([l], 'pagamentos_cartao', undefined, accounts)).toHaveLength(1)
    expect(montar([{ ...pago, fromAccountId: null }])).toEqual([])
  })
  it('entre contas: em Transferências, uma linha com origem e destino', () => {
    const linhas = montar([entrePerfis])
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toMatchObject({ accountId: 'banco', toAccountId: 'banco2' })
    expect(contarPorTipo(linhas, undefined, accounts)).toMatchObject({ todos: 1, transferencias: 1 })
  })
  it('entre perfis: aparece filtrando por qualquer um deles e uma vez em Tudo', () => {
    const doPerfil = (contas) => montar([entrePerfis].filter(t => lancamentoNasContas(t, new Set(contas))))
    expect(doPerfil(['banco', 'cartao', 'bem'])).toHaveLength(1)
    expect(doPerfil(['banco2'])).toHaveLength(1)
    expect(doPerfil(['outra'])).toHaveLength(0)
    expect(montar([entrePerfis])).toHaveLength(1)
  })
  it('o vínculo é achado mesmo com a lista do perfil recortada', () => {
    const linhas = pagosEmConta({ transactions: [paga], todasTransactions: [paga, reembolso], schedules: [parcela], accounts })
    expect(linhas[0].scheduleId).toBe('ag')
  })
  it('exportação mostra origem → destino', () => {
    const [l] = linhasDosPagos(montar([entrePerfis]), { accounts, categories: [] })
    expect(l.conta).toBe('Banco A → Banco B')
  })
})

describe('filtros nos dois tipos', () => {
  const comAgenda = { ...parcela, sincronizarAgenda: true }
  const foraDaAgenda = { ...parcela, id: 'ag3', sincronizarAgenda: false }
  const pagaFora = { ...paga, id: 'paga3', scheduleId: 'ag3' }

  it('categoria: Todas, só as sem categoria, ou uma categoria', () => {
    const linhas = montar([reembolso, tx('sem', 'expense', 5)])
    expect(filtrarPagamentos(linhas, {})).toHaveLength(2)
    expect(ids(filtrarPagamentos(linhas, { categoryId: SEM_CATEGORIA }))).toEqual(['sem'])
    expect(ids(filtrarPagamentos(linhas, { categoryId: 'cat_reembolso' }))).toEqual(['reembolso'])
  })
  it('agenda do celular: avulso não sincroniza', () => {
    const linhas = montar([paga, pagaFora, reembolso], [comAgenda, foraDaAgenda])
    expect(ids(filtrarPagamentos(linhas, { agenda: 'sim' }))).toEqual(['paga'])
    expect(ids(filtrarPagamentos(linhas, { agenda: 'nao' })).sort()).toEqual(['paga3', 'reembolso'])
  })
  it('descrição, favorecido e datas valem para o avulso', () => {
    const linhas = montar([tx('r', 'income', 1, { description: 'Reembolso X', payee: 'Fulano' })])
    expect(filtrarPagamentos(linhas, { desc: 'reembolso', payee: 'ful', from: '2026-06-01', to: '2026-06-30' })).toHaveLength(1)
    expect(filtrarPagamentos(linhas, { to: '2026-06-01' })).toHaveLength(0)
  })
})

describe('filtro de categoria das listas', () => {
  it('Todas não filtra; Sem categoria mostra só as vazias', () => {
    expect(casaCategoria('x', '')).toBe(true)
    expect(casaCategoria(null, '')).toBe(true)
    expect(casaCategoria(null, SEM_CATEGORIA)).toBe(true)
    expect(casaCategoria('x', SEM_CATEGORIA)).toBe(false)
    expect(casaCategoria('x', 'y')).toBe(false)
  })
  it('vale também para A pagar, sem mudar o restante', () => {
    const lista = [{ id: 'a', categoryId: 'x', amount: 1 }, { id: 'b', categoryId: null, amount: 1 }]
    const prox = () => []
    expect(filtrarAgendamentos(lista, { categoryId: SEM_CATEGORIA }, prox, '2026-06-01').map(s => s.id)).toEqual(['b'])
    expect(filtrarAgendamentos(lista, { categoryId: '' }, prox, '2026-06-01')).toHaveLength(2)
  })
})
