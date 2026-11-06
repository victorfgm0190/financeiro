import { describe, it, expect } from 'vitest'
import { pagosEmConta, lancamentoPagoEmConta } from './pagosEmConta.js'
import { filtrarPagamentos } from './ocorrenciasRegistradas.js'
import { filtrarPorTipo, contarPorTipo, totaisPorTipo } from './agendamentosTipo.js'
import { SEM_CATEGORIA, casaCategoria } from './filtroCategoria.js'
import { filtrarAgendamentos } from './agendamentosFiltro.js'
import { lancamentoNasContas } from './origins.js'
import { linhasDosPagos, specAgendamentos } from './exportarAgendamentos.js'

const accounts = [
  { id: 'banco', name: 'Banco A', type: 'checking', profileId: 'pa' },
  { id: 'banco2', name: 'Banco B', type: 'checking', profileId: 'pb' },
  { id: 'cartao', name: 'Cartão qualquer', type: 'credit', profileId: 'pa' },
  { id: 'bem', name: 'Consórcio', type: 'asset', profileId: 'pa' },
  { id: 'bem_b', name: 'Bem do outro perfil', type: 'asset', profileId: 'pb' },
  { id: 'divida', name: 'Financiamento', type: 'liability', profileId: 'pa' },
  { id: 'res', name: 'Reserva', type: 'savings', profileId: 'pa' },
  { id: 'ger', name: 'Gerencial', type: 'gerencial', profileId: 'pa' },
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
  const entreContas = tx('t', 'transfer', 100, { accountId: 'banco', toAccountId: 'banco2' })
  const paraBem = tx('pb', 'transfer', 100, { accountId: 'banco', toAccountId: 'bem_b' })
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
  it('entre contas não entra: bancária, reserva, gerencial, etapa A, automática', () => {
    expect(montar([
      entreContas,
      tx('t2', 'transfer', 10, { toAccountId: 'res' }),
      tx('t3', 'transfer', 10, { accountId: 'res', toAccountId: 'banco' }),
      tx('t4', 'transfer', 10, { toAccountId: 'ger', origin: 'etapa_a' }),
      tx('t5', 'transfer', 10, { toAccountId: 'ger', origin: 'gerencial_auto' }),
    ])).toEqual([])
  })
  it('bem ou dívida entra em Transferências, uma linha origem → destino, em qualquer sentido', () => {
    const linhas = montar([paraBem, tx('d', 'transfer', 20, { toAccountId: 'divida' }), tx('v', 'transfer', 30, { accountId: 'bem', toAccountId: 'banco' })])
    expect(linhas).toHaveLength(3)
    expect(contarPorTipo(linhas, undefined, accounts)).toMatchObject({ todos: 3, transferencias: 3, pagamentos_cartao: 0 })
    expect(linhas.find(l => l.txId === 'pb')).toMatchObject({ accountId: 'banco', toAccountId: 'bem_b' })
  })
  it('o tipo da conta decide, nunca o nome', () => {
    const contas = [{ id: 'a', name: 'Banco', type: 'checking' }, { id: 'b', name: 'Consórcio e financiamento', type: 'checking' }]
    expect(pagosEmConta({ transactions: [tx('x', 'transfer', 1, { accountId: 'a', toAccountId: 'b' })], accounts: contas })).toEqual([])
  })
  it('bem de outro perfil: aparece filtrando por qualquer um dos dois e uma vez em Tudo', () => {
    const doPerfil = (contas) => montar([paraBem].filter(t => lancamentoNasContas(t, new Set(contas))))
    expect(doPerfil(['banco'])).toHaveLength(1)
    expect(doPerfil(['bem_b'])).toHaveLength(1)
    expect(doPerfil(['outra'])).toHaveLength(0)
    expect(montar([paraBem])).toHaveLength(1)
  })
  it('credit_payment com perfil: entra pela pagadora OU pelo cartão, sem duplicar', () => {
    const cp = tx('cp2', 'credit_payment', 500, { accountId: 'cartao', fromAccountId: 'banco2' })
    const pelo = (doPerfil, contas) => pagosEmConta({ transactions: doPerfil, todasTransactions: [cp], accounts, contasDoPerfil: new Set(contas) })
    expect(pelo([], ['banco2'])).toHaveLength(1)
    expect(pelo([cp], ['cartao'])).toHaveLength(1)
    expect(pelo([cp], ['banco2', 'cartao'])).toHaveLength(1)
    expect(pelo([], ['banco'])).toHaveLength(0)
  })
  it('o vínculo é achado mesmo com a lista do perfil recortada', () => {
    const linhas = pagosEmConta({ transactions: [paga], todasTransactions: [paga, reembolso], schedules: [parcela], accounts })
    expect(linhas[0].scheduleId).toBe('ag')
  })
  it('exportação mostra origem → destino', () => {
    const [l] = linhasDosPagos(montar([paraBem]), { accounts, categories: [] })
    expect(l.conta).toBe('Banco A → Bem do outro perfil')
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

describe('totais por tipo', () => {
  const linhas = montar([
    tx('e1', 'income', 1000), tx('e2', 'income', 50.5),
    tx('s1', 'expense', 200.25),
    tx('t1', 'transfer', 300, { toAccountId: 'bem' }),
    tx('f1', 'transfer', 100, { toAccountId: 'cartao' }),
  ])
  const somaDe = (tipo) => filtrarPorTipo(linhas, tipo, undefined, accounts).reduce((a, l) => a + l.amount, 0)

  it('batem com as linhas de cada tipo, e o Líquido desconta o resto', () => {
    const t = totaisPorTipo(linhas, accounts)
    expect(t).toEqual({ entradas: 1050.5, saidas: 200.25, transferencias: 300, pagamentos_cartao: 100, liquido: 450.25 })
    for (const id of ['entradas', 'saidas', 'transferencias', 'pagamentos_cartao']) expect(t[id]).toBeCloseTo(somaDe(id), 2)
  })
  it('baixa sem lançamento não soma', () => {
    expect(totaisPorTipo([{ semLancamento: true, amount: 99, transactionType: 'income' }], accounts).entradas).toBe(0)
  })
  it('Excel: mesmo resumo da tela, nos dois modos', () => {
    const todos = specAgendamentos([], { tipo: 'todos', pagos: true }).resumo
    expect(todos.map(r => r.rotulo)).toEqual(['Entradas', 'Saídas', 'Transferências', 'Pagamento de cartão', 'Líquido'].map((n, i) => (i === 3 ? todos[3].rotulo : n)))
    const exp = linhasDosPagos(linhas, { accounts, categories: [] })
    for (const r of todos.slice(0, 4)) expect(exp.some(l => l.tipo === r.onde[0].valor)).toBe(true)
    expect(todos[4].partes.map(p => p.sinal)).toEqual([1, -1, -1, -1])
    const so = specAgendamentos([], { tipo: 'saidas', pagos: true }).resumo
    expect(so).toEqual([{ rotulo: 'Saídas', soma: 'valor', cor: 'vermelho' }])
    expect(specAgendamentos([], { tipo: 'saidas' }).resumo.length).toBeGreaterThan(1) // A pagar segue igual
  })
})
