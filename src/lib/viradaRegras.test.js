// Regras da virada das Reservas: saldo negativo não rende, lançamento em período fechado, diferença que
// não é rendimento, reabertura a partir do mais recente.
import { describe, it, expect } from 'vitest'
import { ratearRendimento, rateioDoRendimento, refazerRendimentos, dataFechadaNaFuncao } from './rendimentoReserva.js'
import {
  pendenciasDaMudanca, reabertura, dataDoAjuste, agruparPendencias, conferirDecisoes, montarPrevia, rateiosDaVirada, recalcularViradas,
} from './viradaReserva.js'

const CONTA = 'conta_reserva'
const functions = [
  { id: 'a', name: 'A', accountId: CONTA, saldoInicial: 0 },
  { id: 'b', name: 'B', accountId: CONTA, saldoInicial: 0 },
  { id: 'c', name: 'C', accountId: CONTA, saldoInicial: 0 },
]
const periodo = (function_id, saldo_inicial, data_inicio = '2026-08-01', virada_id = 'v1') => ({ id: `p_${function_id}_${data_inicio}`, function_id, saldo_inicial, data_inicio, virada_id })
const periods = [periodo('a', 300), periodo('b', 100), periodo('c', -50)]
const rendimento = (id, date, amount) => ({ id, type: 'income', amount, date, accountId: CONTA, reservaFuncaoId: null })
const deposito = (id, date, amount, funcao = 'a') => ({ id, type: 'transfer', amount, date, accountId: 'corrente', toAccountId: CONTA, reservaFuncaoId: funcao, description: id })
const CORTE = '2026-07-31'

describe('saldo negativo não rende', () => {
  it('só as positivas recebem, proporcional, com soma exata', () => {
    const r = ratearRendimento([{ id: 'a', saldo: 300 }, { id: 'b', saldo: 100 }, { id: 'c', saldo: -50 }], 100)
    expect(r.partes).toEqual({ a: 75, b: 25 })
    expect(r.aDistribuir).toBe(0)
  })
  it('saldo zero também não recebe', () => {
    expect(ratearRendimento([{ id: 'a', saldo: 0 }, { id: 'b', saldo: 10 }], 7).partes).toEqual({ b: 7 })
  })
  it('nenhuma positiva: tudo fica a distribuir', () => {
    expect(ratearRendimento([{ id: 'a', saldo: -1 }, { id: 'b', saldo: 0 }], 80)).toEqual({ partes: {}, aDistribuir: 80 })
  })
  it('o rateio de um lançamento usa essa regra', () => {
    const partes = rateioDoRendimento(rendimento('r', '2026-08-05', 100), { functions, periods, adjustments: [], transactions: [] })
    expect(partes.map(p => [p.function_id, p.valor]).sort()).toEqual([['a', 75], ['b', 25]])
    expect(partes.every(p => p.lancamento_id === 'r')).toBe(true)
  })
  it('rendimento em período fechado não é rateado', () => {
    expect(dataFechadaNaFuncao(periods, 'a', '2026-07-10')).toBe(true)
    expect(rateioDoRendimento(rendimento('r', '2026-07-10', 100), { functions, periods, adjustments: [], transactions: [] })).toEqual([])
  })
})

describe('refazer os rendimentos seguintes', () => {
  it('em ordem de data, só os que mudam, cada um partindo do anterior', () => {
    const r1 = rendimento('r1', '2026-08-05', 100)
    const r2 = rendimento('r2', '2026-08-20', 40)
    const adjustments = [
      { id: 'x1', function_id: 'a', data: '2026-08-05', valor: 75, lancamento_id: 'r1' },
      { id: 'x2', function_id: 'b', data: '2026-08-05', valor: 25, lancamento_id: 'r1' },
      { id: 'novo', function_id: 'b', data: '2026-08-10', valor: 275 },
      { id: 'y1', function_id: 'a', data: '2026-08-20', valor: 30, lancamento_id: 'r2' },
      { id: 'y2', function_id: 'b', data: '2026-08-20', valor: 10, lancamento_id: 'r2' },
    ]
    const itens = refazerRendimentos({ functions, periods, adjustments, transactions: [r1, r2], desde: '2026-08-10' })
    expect(itens.map(i => i.lancamentoId)).toEqual(['r2'])
    expect(itens[0].depois.a + itens[0].depois.b).toBeCloseTo(40, 2)
    expect(itens[0].depois.b).toBeGreaterThan(10)
    expect(itens[0].depois.c).toBeUndefined()
  })
  it('nada muda: lista vazia', () => {
    const r1 = rendimento('r1', '2026-08-05', 100)
    const adjustments = rateioDoRendimento(r1, { functions, periods, adjustments: [], transactions: [] })
    expect(refazerRendimentos({ functions, periods, adjustments, transactions: [r1], desde: '2026-08-01' })).toEqual([])
  })
})

describe('lançamento em período fechado', () => {
  const pend = (arg) => pendenciasDaMudanca({ functions, periods, corte: CORTE, ...arg })

  it('novo em período fechado: uma pendência com função, valor e vínculo', () => {
    expect(pend({ depois: deposito('t', '2026-07-10', 40) })).toEqual([expect.objectContaining({
      lancamento_id: 't', function_id: 'a', account_id: CONTA, valor: 40, data: '2026-07-10', motivo: 'novo',
    })])
  })
  it('no período aberto: nada', () => {
    expect(pend({ depois: deposito('t', '2026-08-02', 40) })).toEqual([])
  })
  it('anterior ao período mais antigo (hoje era ignorado sem avisar): também fica pendente', () => {
    const r = pendenciasDaMudanca({ functions, periods, corte: null, depois: deposito('t', '2026-01-10', 40) })
    expect(r).toHaveLength(1)
  })
  it('sem função, na conta de reserva: pendência sem função', () => {
    const [p] = pend({ depois: rendimento('r', '2026-07-10', 12) })
    expect(p).toMatchObject({ function_id: null, account_id: CONTA, valor: 12 })
  })
  it('edição: só a diferença; sem mudança: nada', () => {
    const t = deposito('t', '2026-07-10', 40)
    expect(pend({ antes: t, depois: { ...t, amount: 55 } })[0]).toMatchObject({ valor: 15, motivo: 'editado' })
    expect(pend({ antes: t, depois: t })).toEqual([])
  })
  it('exclusão: valor negativo; saída de período aberto para fechado e vice-versa', () => {
    const t = deposito('t', '2026-07-10', 40)
    expect(pend({ antes: t })[0]).toMatchObject({ valor: -40, motivo: 'excluido' })
    expect(pend({ antes: t, depois: { ...t, date: '2026-08-02' } })[0]).toMatchObject({ valor: -40 })
    expect(pend({ antes: { ...t, date: '2026-08-02' }, depois: t })[0]).toMatchObject({ valor: 40 })
  })
  it('lançamento que não toca reserva ou é sombra: nada', () => {
    expect(pend({ depois: { id: 'x', type: 'expense', amount: 5, date: '2026-07-10', accountId: 'corrente' } })).toEqual([])
    expect(pend({ depois: { ...deposito('s', '2026-07-10', 5), reservaAuto: true } })).toEqual([])
  })
  it('ajuste vai para o primeiro dia aberto', () => {
    expect(dataDoAjuste({ functionId: 'a', corte: CORTE, periods })).toBe('2026-08-01')
    expect(dataDoAjuste({ functionId: null, corte: CORTE, periods })).toBe('2026-08-01')
  })
  it('lista agrupada por conta e mês, com total', () => {
    const g = agruparPendencias([
      { id: '1', account_id: CONTA, data: '2026-07-20', valor: 10 },
      { id: '2', account_id: CONTA, data: '2026-07-05', valor: 5 },
      { id: '3', account_id: CONTA, data: '2026-06-05', valor: -1 },
    ])
    expect(g.map(x => [x.mes, x.total])).toEqual([['2026-06', -1], ['2026-07', 15]])
    expect(g[1].itens.map(i => i.id)).toEqual(['2', '1'])
  })
  it('recalcular as viradas deixa a pendência de fora', () => {
    const t = deposito('t', '2026-07-10', 40)
    const per = [{ id: 'pa', function_id: 'a', data_inicio: '2026-07-01', saldo_inicial: 0 }]
    const viradas = [{ id: 'v', data_corte: '2026-07-31' }]
    const snapshots = [{ id: 's', virada_id: 'v', function_id: 'a', saldo_inicial: 0, entradas: 0, saidas: 0, ajuste: 0, rendimentos: 0, saldo: 0, saldo_atualizado: 0 }]
    const base = { viradas, snapshots, periods: per, functions: functions.slice(0, 1), adjustments: [], transactions: [t] }
    expect(recalcularViradas(base).length).toBeGreaterThan(0)
    expect(recalcularViradas({ ...base, pendencias: [{ function_id: 'a', data: '2026-07-10', entrada: 40, saida: 0, status: 'pendente' }] })).toEqual([])
  })
})

describe('reabrir a partir do mais recente', () => {
  const snapshots = [{ data_fim: '2026-06-30' }, { data_fim: '2026-07-31' }, { data_fim: '2026-08-31' }]
  const viradas = [{ data_corte: '2026-07-31' }, { data_corte: '2026-08-31' }]
  it('desfaz do mais recente até o mês do lançamento', () => {
    expect(reabertura({ data: '2026-07-10' }, { viradas, snapshots })).toEqual({ pode: true, cortes: ['2026-08-31', '2026-07-31'], motivo: null })
  })
  it('fechamento antigo no caminho: não pode', () => {
    const r = reabertura({ data: '2026-06-10' }, { viradas, snapshots })
    expect(r.pode).toBe(false)
    expect(r.motivo).toMatch(/antes da virada assistida/)
  })
  it('antes do saldo inicial informado: não pode', () => {
    const r = reabertura({ data: '2026-08-10', function_id: 'a' }, { viradas, snapshots, periods: [{ function_id: 'a', data_inicio: '2026-08-20', virada_id: null }] })
    expect(r.pode).toBe(false)
  })
  it('sem fechamento na data: não pode', () => {
    expect(reabertura({ data: '2026-09-10' }, { viradas, snapshots }).pode).toBe(false)
  })
})

describe('diferença que não é rendimento', () => {
  const mes = { inicio: '2026-08-01', fim: '2026-08-31' }
  const accounts = [{ id: CONTA, name: 'Reserva', initialBalance: 350 }]
  const base = { mes, functions, periods, accounts }

  it('diferença = rendimento real: rateia só nas positivas e não pede decisão', () => {
    const transactions = [rendimento('r', '2026-08-05', 100)]
    expect(rateiosDaVirada({ ...base, transactions }).map(a => a.function_id).sort()).toEqual(['a', 'b'])
    const p = montarPrevia({ ...base, transactions })
    expect(p.contas[0].resto).toBe(0)
    expect(p.contas[0].rendimentoARatear).toBe(100)
    const c = p.linhas.find(l => l.functionId === 'c')
    expect(c.rendimentos).toBe(0)
    expect(p.linhas.find(l => l.functionId === 'a').rendimentos).toBe(75)
    expect(conferirDecisoes(p, null).faltam).toEqual([])
  })
  it('diferença sem explicação: para e não distribui; decisão só com função e observação', () => {
    const p = montarPrevia({ ...base, accounts: [{ ...accounts[0], initialBalance: 450 }] })
    const conta = p.contas[0]
    expect(conta.resto).toBe(100)
    expect(p.rateios).toEqual([])
    expect(p.linhas.every(l => l.rendimentos === 0)).toBe(true)
    expect(conferirDecisoes(p, null).faltam).toHaveLength(1)
    expect(conferirDecisoes(p, { [CONTA]: { tipo: 'ajuste', functionId: 'a' } }).faltam).toHaveLength(1)
    expect(conferirDecisoes(p, { [CONTA]: { tipo: 'ajuste', functionId: 'outra', observacao: 'x' } }).faltam).toHaveLength(1)
    expect(conferirDecisoes(p, { [CONTA]: { tipo: 'a_distribuir' } })).toEqual({ faltam: [], ajustes: [] })
    expect(conferirDecisoes(p, { [CONTA]: { tipo: 'ajuste', functionId: 'a', observacao: 'x' } }).ajustes).toEqual([{ accountId: CONTA, function_id: 'a', valor: 100, observacao: 'x' }])
  })
  it('separa o que tem explicação: lançamento pendente de período fechado não para a virada', () => {
    const p = montarPrevia({ ...base, accounts: [{ ...accounts[0], initialBalance: 390 }], pendencias: [{ status: 'pendente', account_id: CONTA, valor: 40 }] })
    expect(p.contas[0].pendenciasFechado).toBe(40)
    expect(p.contas[0].resto).toBe(0)
  })
  it('valor já aceito a distribuir não para de novo; distribuído depois, também não', () => {
    const conta = (initialBalance, aceito) => montarPrevia({ ...base, accounts: [{ ...accounts[0], initialBalance }], aceitos: { [CONTA]: aceito } }).contas[0]
    expect(conta(450, 100).resto).toBe(0)
    expect(conta(420, 100).resto).toBe(0)
    expect(conta(480, 100).resto).toBe(30)
    expect(conta(300, 100).resto).toBe(-50)
  })
  it('nenhuma positiva: rendimento fica a distribuir, sem pedir decisão', () => {
    const negativos = [periodo('a', -10), periodo('b', -10), periodo('c', -10)]
    const p = montarPrevia({ ...base, periods: negativos, accounts: [{ ...accounts[0], initialBalance: -30 }], transactions: [rendimento('r', '2026-08-05', 60)] })
    expect(p.rateios).toEqual([])
    expect(p.contas[0].rendimentoSemBase).toBe(60)
    expect(p.contas[0].resto).toBe(0)
    expect(p.contas[0].aDistribuir).toBe(60)
    expect(p.avisos.map(a => a.codigo)).toContain('receita_sem_rateio')
  })
})
