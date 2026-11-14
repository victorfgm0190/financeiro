// Verificar e corrigir (lib/verificarCartao): uma verificação por seção (a–g) e o aviso da fatura.
// Dados FICTÍCIOS no formato dos casos reais (gastos sem tipo de conta, duplicata em fatura de 2024,
// faturas antigas sem pagamento).
import { describe, it, expect } from 'vitest'
import {
  verificarCartao, gastosGSemEtapaA, fantasmasDaGer, detalhamentoDivergente, saldosGerDivergentes,
  agendamentosSemGasto, faturasAntigasSemPagamento, planoDeCompetencia, avisoDaFatura, contarPendencias, situacaoDaEtapaA, etapaADevida,
} from './verificarCartao.js'
import { comTipoDaConta, lancamentosSemTipoDeConta } from './tipoDaConta.js'

const HOJE = '2026-11-14'
const CARD = { id: 'card', name: 'Cartão', apelido: 'Card', type: 'credit', closingDay: 13, profileId: 'p1' }
const CC = { id: 'cc', name: 'Conta', type: 'checking', contaCorrentePrincipal: true, profileId: 'p1', balance: 0 }
const GER = { id: 'ger', name: 'Ger. Card', type: 'gerencial', grupoGerencial: 'grp_1', balance: 100 }
const ACCOUNTS = [CC, CARD, GER]
const GRUPOS = [{ id: 'grp_1', number: 1, alias: 'G', name: 'Gerencial' }, { id: 'grp_D', number: 'D', alias: 'D', name: 'Despesa' }]
const gasto = (o) => ({ type: 'expense', accountId: 'card', accountType: 'credit', grupoGerencial: 'grp_1', ...o })

describe('a) lançamentos de cartão sem tipo de conta', () => {
  it('lista os do cartão sem "credit"; comTipoDaConta corrige pelo tipo da conta', () => {
    const txs = [gasto({ id: 'v1', accountType: null, date: '2026-10-27', amount: 216, faturaMonthYear: '2026-11' }), gasto({ id: 'ok', date: '2026-10-20', amount: 10, faturaMonthYear: '2026-11' })]
    expect(lancamentosSemTipoDeConta(txs, ACCOUNTS, 'card').map(t => t.id)).toEqual(['v1'])
    expect(comTipoDaConta(txs[0], ACCOUNTS).accountType).toBe('credit')
    expect(verificarCartao({ transactions: txs, accounts: ACCOUNTS, gerencialGroups: GRUPOS, card: CARD, faturas: ['2026-11'], hoje: HOJE }).a.map(t => t.id)).toEqual(['v1'])
  })
})

describe('b) gastos do grupo G sem etapa A', () => {
  it('etapa A automática (tx_gerA_) ou do Executar Gerenciais (tx_ger_) cobre; o resto é a diferença', () => {
    const txs = [
      gasto({ id: 'g1', date: '2026-10-20', amount: 100, faturaMonthYear: '2026-11' }),
      gasto({ id: 'g2', date: '2026-10-21', amount: 50, faturaMonthYear: '2026-11' }),
      gasto({ id: 'g3', date: '2026-10-27', amount: 216, faturaMonthYear: '2026-11', accountType: null }),
      { id: 'tx_gerA_g1', type: 'transfer', accountId: 'cc', toAccountId: 'ger', amount: 100, sourceExpenseId: 'g1', faturaRef: '11/2026' },
      { id: 'tx_ger_123_x', type: 'transfer', accountId: 'cc', toAccountId: 'ger', amount: 50, sourceExpenseId: 'g2', faturaRef: '11/2026' },
    ]
    const r = gastosGSemEtapaA({ transactions: txs, gerencialGroups: GRUPOS, card: CARD, fatura: '2026-11' })
    expect(r.itens.map(t => t.id)).toEqual(['g3'])
    expect([r.totalG, r.totalEtapas, r.diferenca]).toEqual([366, 150, 216])
  })
})

describe('c) fantasmas e detalhamento por função', () => {
  it('fantasma = entrada na Ger. sem fatura e com id desconhecido; detalhamento que não soma o resgate', () => {
    const txs = [{ id: 'x1', type: 'transfer', toAccountId: 'ger', amount: 30 }, { id: 'tx_gerA_g1', type: 'transfer', toAccountId: 'ger', amount: 5 }]
    expect(fantasmasDaGer({ transactions: txs, accounts: ACCOUNTS, card: CARD }).map(t => t.id)).toEqual(['x1'])
    const schedules = [{ id: 'r1', tipo: 'resgate_reserva', cardId: 'card', faturaMesAno: '2026-11', amount: 100 }]
    const srf = [{ scheduleId: 'r1', valor: 70 }]
    expect(detalhamentoDivergente({ schedules, scheduleReservaFuncoes: srf, card: CARD, fatura: '2026-11' })).toMatchObject([{ id: 'r1', valor: 100, soma: 70 }])
  })
})

describe('d) fatura errada / duplicata em qualquer fatura (Amazon gravada em 10/2024)', () => {
  it('propõe excluir a duplicata da fatura implausível', () => {
    const txs = [
      gasto({ id: 'amz_ok', grupoGerencial: null, date: '2026-09-15', dateCartao: '2026-09-15', amount: 47.4, faturaMonthYear: '2026-10', description: 'Amazon Br *Amazon Br' }),
      gasto({ id: 'amz_2024', grupoGerencial: null, date: '2026-09-15', dateCartao: '2026-09-15', amount: 47.4, faturaMonthYear: '2024-10', description: 'Amazon Br *Amazon Br' }),
    ]
    const plano = planoDeCompetencia({ transactions: txs, accounts: ACCOUNTS, schedules: [], gerencialGroups: GRUPOS, card: CARD })
    expect(plano).toHaveLength(1)
    expect(plano[0]).toMatchObject({ tipo: 'excluir_duplicata', excluir: ['amz_2024'] })
  })
})

describe('e) saldo da conta Ger. × transferências', () => {
  it('mostra o gravado e o que será regravado', () => {
    const txs = [{ id: 't', type: 'transfer', accountId: 'cc', toAccountId: 'ger', amount: 80 }]
    expect(saldosGerDivergentes({ accounts: ACCOUNTS, transactions: txs, gerencialGroups: GRUPOS })).toEqual([{ id: 'ger', nome: 'Ger. Card', gravado: 100, real: 80, diferenca: -20 }])
  })
})

describe('f) agendamentos que o recálculo removeria (fatura sem gasto)', () => {
  it('lista os geridos pendentes de fatura sem nenhum gasto; registrados e de fatura passada ficam fora', () => {
    const schedules = [
      { id: 'pag12', tipo: 'pagamento_fatura', cardId: 'card', faturaMesAno: '2026-12', amount: 20, registered: [] },
      { id: 'pag11', tipo: 'pagamento_fatura', cardId: 'card', faturaMesAno: '2026-11', amount: 20, registered: [] },
      { id: 'velho', tipo: 'pagamento_fatura', cardId: 'card', faturaMesAno: '2026-01', amount: 20, registered: [] },
      { id: 'pago', tipo: 'resgate_reserva', cardId: 'card', faturaMesAno: '2027-01', amount: 9, registered: ['2027-01-20'] },
    ]
    const txs = [gasto({ id: 'g', date: '2026-10-20', amount: 5, faturaMonthYear: '2026-11' })]
    expect(agendamentosSemGasto({ schedules, transactions: txs, card: CARD, hoje: HOJE }).map(s => s.id)).toEqual(['pag12'])
  })
})

describe('g) faturas antigas sem pagamento, anteriores à última paga', () => {
  it('Itaupers 03 e 04/2026 (parcelas lançadas antes do acompanhamento): fechar; fechada já não aparece', () => {
    const txs = [
      gasto({ id: 'p1', grupoGerencial: null, date: '2026-03-10', amount: 26.36, faturaMonthYear: '2026-03' }),
      gasto({ id: 'p2', grupoGerencial: null, date: '2026-04-10', amount: 41.19, faturaMonthYear: '2026-04' }),
      gasto({ id: 'm', grupoGerencial: null, date: '2026-05-10', amount: 100, faturaMonthYear: '2026-05' }),
      { id: 'pg', type: 'credit_payment', accountId: 'card', amount: 100, date: '2026-05-20', faturaMonthYear: '2026-05' },
    ]
    expect(faturasAntigasSemPagamento({ transactions: txs, card: CARD, hoje: HOJE }).map(f => f.fatura)).toEqual(['2026-03', '2026-04'])
    expect(faturasAntigasSemPagamento({ transactions: txs, card: CARD, hoje: HOJE, faturasFechadas: { 'card_2026-03': true } }).map(f => f.fatura)).toEqual(['2026-04'])
  })
})

describe('aviso automático da fatura', () => {
  const txs = [
    gasto({ id: 'g1', date: '2026-10-20', amount: 100, faturaMonthYear: '2026-11' }),
    { id: 'tx_gerA_g1', type: 'transfer', accountId: 'cc', toAccountId: 'ger', amount: 100, sourceExpenseId: 'g1', faturaRef: '11/2026', cardId: 'card' },
    gasto({ id: 'v1', accountType: null, date: '2026-10-27', amount: 216, faturaMonthYear: '2026-11', description: 'VIVO' }),
  ]
  it('com pendência: conta, aponta a seção a e o valor sem etapa A (o mesmo lançamento conta uma vez)', () => {
    const a = avisoDaFatura({ transactions: txs, accounts: ACCOUNTS, gerencialGroups: GRUPOS, card: CARD, fatura: '2026-11', hoje: HOJE })
    // VIVO (sem tipo E sem etapa A; também GER_ETAPA_A_FALTANDO no motor) conta 1; o saldo da Ger. só
    // difere por ele e não conta de novo; o fechamento da fatura conta (não há devolução nenhuma).
    expect(a.erro.regras).toEqual(['GER_ETAPA_A_FALTANDO', 'GER_FECHAMENTO_FATURA', 'GER_SALDO_SUBCONTA'])
    expect(a.erro.total).toBe(2)
    expect(a.erro.secao).toBe('a')
    expect(a.erro.semEtapa).toBe(216)
    expect(a.mes).toBeNull()
  })
  it('sem diferença: nada', () => {
    const devolucao = [{ id: 'dev', tipo: 'gerencial_devolucao', cardId: 'card', faturaMesAno: '2026-11', faturaRef: '11/2026', amount: 100, transactionType: 'transfer', accountId: 'ger', toAccountId: 'cc', registered: [], skipped: [] }]
    expect(avisoDaFatura({ transactions: txs.slice(0, 2), accounts: ACCOUNTS, schedules: devolucao, gerencialGroups: GRUPOS, card: CARD, fatura: '2026-11', hoje: HOJE })).toBeNull()
  })
  it('controle gerencial desligado: só o não gerencial (sem seções b, c, e, f)', () => {
    const v = verificarCartao({ transactions: txs, accounts: ACCOUNTS, gerencialGroups: GRUPOS, card: CARD, faturas: ['2026-11'], hoje: HOJE, gerencialLigado: false })
    expect(Object.keys(v).sort()).toEqual(['a', 'd', 'g'])
    expect(contarPendencias(v).a).toBe(1)
    const a = avisoDaFatura({ transactions: txs, accounts: ACCOUNTS, gerencialGroups: GRUPOS, card: CARD, fatura: '2026-11', hoje: HOJE, gerencialLigado: false })
    expect(a.erro).toMatchObject({ secao: 'a', semEtapa: 0, semTipo: 1 })
    expect(a.mes).toBeNull()
  })
})

describe('falsos alarmes (teste no teste1, 14/11)', () => {
  // Hoje 14/11/2026, fechamento dia 13: a fatura 11/2026 abriu em 14/10 (devida); a 12/2026 abre em
  // 14/11 (devida a partir de hoje); a 01/2027 abre em 14/12 (ainda não).
  const parcelas = [
    gasto({ id: 'p11', date: '2026-10-15', amount: 10, faturaMonthYear: '2026-11', installmentNum: 5, installmentTotal: 12 }),
    gasto({ id: 'p01', date: '2026-12-15', amount: 39.95, faturaMonthYear: '2027-01', installmentNum: 7, installmentTotal: 12, description: 'Vindi *Finclasssp 7/12' }),
    gasto({ id: 'p03', date: '2027-02-15', amount: 39.95, faturaMonthYear: '2027-03', installmentNum: 9, installmentTotal: 12 }),
  ]
  it('B: parcela de fatura que ainda não entrou no ciclo fica aguardando (fora da diferença e do aviso)', () => {
    const v = verificarCartao({ transactions: parcelas, accounts: ACCOUNTS, gerencialGroups: GRUPOS, card: CARD, faturas: ['2026-11', '2027-01', '2027-03'], hoje: HOJE, settings: { financialMonthStartDay: 1 } })
    // Mês começando dia 1: ciclo 01–30/11 → a fatura 11/2026 (fecha 13/11) é do mês; 01 e 03/2027 aguardam.
    expect(v.b.semEtapa.flatMap(x => x.doMes.map(t => t.id))).toEqual(['p11'])
    expect(v.b.diferenca).toBe(0)
    expect(v.b.valorDoMes).toBe(10)
    expect(v.b.aguardando).toEqual({ qtd: 2, valor: 79.9 })
    expect(avisoDaFatura({ transactions: parcelas, accounts: ACCOUNTS, gerencialGroups: GRUPOS, card: CARD, fatura: '2027-01', hoje: HOJE, settings: { financialMonthStartDay: 1 } })?.erro).toBeFalsy()
  })
  it('F: fatura futura com compra AGENDADA não é "sem gasto"; sem nada (nem lançado nem agendado) aparece', () => {
    const schedules = [
      { id: 'res_nov27', tipo: 'resgate_reserva', cardId: 'card', faturaMesAno: '2027-11', amount: 48.29, registered: [], description: 'Resgate Reserva Card - Fatura 11/2027' },
      { id: 'pag_dez27', tipo: 'pagamento_fatura', cardId: 'card', faturaMesAno: '2027-12', amount: 20, registered: [], description: 'Pagamento Fatura Card 12/2027' },
    ]
    const previstoDe = (f) => (f === '2027-11' ? 48.29 : 0) // compra mensal agendada cai em 11/2027
    expect(agendamentosSemGasto({ schedules, transactions: [], card: CARD, hoje: HOJE, previstoDe }).map(s => s.id)).toEqual(['pag_dez27'])
  })
})

describe('etapa A das parcelas 2..N pelo CICLO FINANCEIRO (fechamento da fatura)', () => {
  // Cartão como o Itaupers: fecha dia 13, vence dia 20.
  const CARD13 = { ...CARD, closingDay: 13, dueDay: 20 }
  const dez = gasto({ id: 'dez9', date: '2026-11-15', amount: 49.37, faturaMonthYear: '2026-12', installmentNum: 2, installmentTotal: 3, description: 'Amazon 2/3' })
  const avista = gasto({ id: 'vista', date: '2026-10-27', amount: 216, faturaMonthYear: '2026-11', description: 'VIVO' })
  const S15 = { financialMonthStartDay: 15, financialMonthMode: 'custom' }

  it('mês começando no dia 15: a parcela da fatura 12/2026 (fecha 13/12) aguarda em 14/11 e é devida a partir de 15/11', () => {
    expect(situacaoDaEtapaA(CARD13, '2026-12', '2026-11-14', S15)).toBe('futura')
    expect(situacaoDaEtapaA(CARD13, '2026-12', '2026-11-15', S15)).toBe('mes')
    expect(etapaADevida(CARD13, '2026-12', '2026-11-14', {}, S15, dez)).toBe(false)
    expect(etapaADevida(CARD13, '2026-12', '2026-11-15', {}, S15, dez)).toBe(true)
    const em14 = gastosGSemEtapaA({ transactions: [dez], gerencialGroups: GRUPOS, card: CARD13, fatura: '2026-12', hoje: '2026-11-14', settings: S15 })
    const em15 = gastosGSemEtapaA({ transactions: [dez], gerencialGroups: GRUPOS, card: CARD13, fatura: '2026-12', hoje: '2026-11-15', settings: S15 })
    expect([em14.aguardando.length, em14.doMes.length]).toEqual([1, 0])
    expect([em15.aguardando.length, em15.doMes.length, em15.faltando.length]).toEqual([0, 1, 0])
  })

  it('a regra acompanha a configuração: mês começando no dia 1 e mês de calendário', () => {
    expect(situacaoDaEtapaA(CARD13, '2026-12', '2026-11-15', { financialMonthStartDay: 1 })).toBe('futura') // ciclo 01–30/11
    expect(situacaoDaEtapaA(CARD13, '2026-11', '2026-11-15', { financialMonthStartDay: 1 })).toBe('mes')
    expect(situacaoDaEtapaA(CARD13, '2026-12', '2026-12-01', { financialMonthStartDay: 1 })).toBe('mes')
    expect(situacaoDaEtapaA(CARD13, '2026-10', '2026-11-15', { financialMonthMode: 'calendar' })).toBe('passada')
  })

  it('à vista / parcela 1 sem etapa A é sempre erro; parcela de ciclo passado também', () => {
    const r = gastosGSemEtapaA({ transactions: [avista], gerencialGroups: GRUPOS, card: CARD13, fatura: '2026-11', hoje: '2026-11-14', settings: S15 })
    expect(r.faltando.map(t => t.id)).toEqual(['vista'])
    const antiga = gasto({ id: 'old', date: '2026-08-15', amount: 5, faturaMonthYear: '2026-09', installmentNum: 3, installmentTotal: 5 })
    expect(gastosGSemEtapaA({ transactions: [antiga], gerencialGroups: GRUPOS, card: CARD13, fatura: '2026-09', hoje: '2026-11-15', settings: S15 }).faltando.map(t => t.id)).toEqual(['old'])
  })

  it('faixas: erro e tarefa do mês ao mesmo tempo, cada uma com o seu conteúdo', () => {
    const a = avisoDaFatura({ transactions: [avista, dez], accounts: ACCOUNTS, gerencialGroups: GRUPOS, card: CARD13, fatura: '2026-11', hoje: '2026-11-15', settings: S15 })
    expect(a.erro).toMatchObject({ semEtapa: 216, secao: 'b' })
    expect(a.erro.total).toBe(2) // à vista sem etapa A (1x) + fatura sem devolução; saldo da Ger. não conta de novo
    expect(a.mes).toEqual({ qtd: 1, valor: 49.37, fatura: '2026-12', ids: ['dez9'] })
    // Em 14/11 a parcela de 12/2026 ainda aguarda: só a faixa de erro.
    expect(avisoDaFatura({ transactions: [avista, dez], accounts: ACCOUNTS, gerencialGroups: GRUPOS, card: CARD13, fatura: '2026-11', hoje: '2026-11-14', settings: S15 }).mes).toBeNull()
  })
})
