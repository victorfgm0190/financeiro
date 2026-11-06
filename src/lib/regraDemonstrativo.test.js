import { describe, it, expect } from 'vitest'
import { criarRegraDemonstrativo, despesaPorCategoria, filtrarPerfilDemonstrativo, totaisDoDemonstrativo } from './regraDemonstrativo.js'

const accounts = [
  { id: 'itau', profileId: 'P1', type: 'checking' },
  { id: 'ca', profileId: 'P1', type: 'checking', isReserva: true },
]
const reserveFunctions = [
  { id: 'f_fralda', accountId: 'ca', categoryId: 'cat_fralda', exibirComoDespesa: true },
  { id: 'f_geral', accountId: 'ca', categoryId: 'cat_res_ger', exibirComoDespesa: false },
]
const sombra = (id, type, amount, func, cat, desc) => ({ id, type, amount, accountId: null, date: '2026-10-20', reservaAuto: true, reservaFuncaoId: func, categoryId: cat, description: desc })
const txs = [
  { id: 'tx_dep', type: 'transfer', accountId: 'itau', toAccountId: 'ca', amount: 250, date: '2026-10-20', reservaFuncaoId: 'f_fralda' },
  sombra('tx_res_1', 'expense', 250, 'f_fralda', 'cat_fralda', 'Reserva: CA'),
  { id: 'tx_gasto', type: 'expense', accountId: 'itau', amount: 300, date: '2026-10-22', categoryId: 'cat_fralda' },
  sombra('tx_rsg_1_r', 'income', 260, 'f_fralda', 'cat_fralda', 'Resgate Reserva: CA'),
  sombra('tx_rsg_1_d', 'expense', 260, 'f_fralda', 'cat_fralda', 'Resgate Reserva: CA'),
  // Função que NÃO é "exibir como despesa": fora do Orçamento/Demonstrativo.
  sombra('tx_res_2', 'expense', 100, 'f_geral', 'cat_res_ger', 'Reserva: CA'),
  sombra('tx_rsg_2_r', 'income', 80, 'f_geral', 'cat_res_ger', 'Resgate Reserva: CA'),
  sombra('tx_rsg_2_d', 'expense', 80, 'f_geral', 'cat_res_ger', 'Resgate Reserva: CA'),
  // Resgate sem gasto no período: a categoria fica negativa.
  sombra('tx_rsg_3_r', 'income', 500, 'f_fralda', 'cat_aniv', 'Resgate Reserva: CA'),
  sombra('tx_rsg_3_d', 'expense', 500, 'f_fralda', 'cat_aniv', 'Resgate Reserva: CA'),
]
const periodo = { start: '2026-10-15', end: '2026-11-14' }

describe('Orçamento = regra do Demonstrativo', () => {
  it('depósito na categoria da função + gasto − resgate (perna de despesa do resgate não conta)', () => {
    const r = despesaPorCategoria(txs, periodo, criarRegraDemonstrativo(reserveFunctions, accounts))
    expect(r.cat_fralda).toBe(290)
  })
  it('funções que não são "exibir como despesa" ficam fora; resgate sem gasto deixa negativo', () => {
    const r = despesaPorCategoria(txs, periodo, criarRegraDemonstrativo(reserveFunctions, accounts))
    expect(r.cat_res_ger).toBeUndefined()
    expect(r.cat_aniv).toBe(-500)
  })
  it('perfil: espelho só quando a conta da função é do perfil', () => {
    expect(filtrarPerfilDemonstrativo(txs, reserveFunctions, new Set(['itau', 'ca']))).toHaveLength(txs.length)
    expect(filtrarPerfilDemonstrativo(txs, reserveFunctions, new Set(['cora']))).toHaveLength(0)
  })
})

describe('gráfico dos 6 meses = totais do Demonstrativo', () => {
  it('líquido: o resgate abate a despesa e fica fora das receitas', () => {
    const lista = [...txs, { id: 'sal', type: 'income', amount: 1000, accountId: 'itau', date: '2026-10-20', categoryId: 'cat_sal' }]
    const regra = criarRegraDemonstrativo(reserveFunctions, accounts)
    expect(totaisDoDemonstrativo(lista, periodo, regra)).toEqual({ receita: 1000, despesa: -210 })
  })
  it('bruto: despesa inteira e resgate na receita; líquido: abate; saldo igual; mesmo sem depósito', () => {
    const f = [{ id: 'f', accountId: 'ca', categoryId: 'cat_x', exibirComoDespesa: true }]
    const lista = [
      { id: 'g', type: 'expense', amount: 300, accountId: 'itau', date: '2026-10-20', categoryId: 'cat_x' },
      sombra('tx_rsg_9_r', 'income', 300, 'f', 'cat_x', 'Resgate Reserva: CA'),
      sombra('tx_rsg_9_d', 'expense', 300, 'f', 'cat_x', 'Resgate Reserva: CA'),
    ]
    const regra = criarRegraDemonstrativo(f, accounts)
    expect(totaisDoDemonstrativo(lista, periodo, regra, 'cheio')).toEqual({ receita: 300, despesa: 300 })
    expect(totaisDoDemonstrativo(lista, periodo, regra, 'liquido')).toEqual({ receita: 0, despesa: 0 })
    expect(despesaPorCategoria(lista, periodo, regra, 'cheio').cat_x).toBe(300)
    expect(despesaPorCategoria(lista, periodo, regra, 'liquido').cat_x).toBe(0)
  })
})

describe('parcela de bem paga com resgate de reserva: a despesa aparece uma vez', () => {
  const contas = [
    { id: 'itau', profileId: 'P1', type: 'checking' },
    { id: 'ca', profileId: 'P1', type: 'savings', isReserva: true },
    { id: 'bem', profileId: 'P1', type: 'asset', isInvestimento: true, investmentCategoryId: 'cat_bem' },
    { id: 'outro', profileId: 'P2', type: 'asset', isInvestimento: true, investmentCategoryId: 'cat_bem' },
  ]
  const funcoes = [{ id: 'f_bem', accountId: 'ca', categoryId: 'cat_bem', exibirComoDespesa: true }]
  const lista = (deposito = null) => [
    ...(deposito ? [sombra('tx_res_b', 'expense', 900, 'f_bem', 'cat_bem', 'Reserva: CA'), ] .map(t => ({ ...t, date: deposito })) : []),
    { id: 'trf', type: 'transfer', accountId: 'itau', toAccountId: 'bem', amount: 1000, date: '2026-10-20' },
    { id: 'tx_inv_1', type: 'expense', amount: 1000, accountId: null, date: '2026-10-20', reservaAuto: true, reservaFuncaoId: null, categoryId: 'cat_bem', description: 'Investimento - Bem', parentTxId: 'trf' },
    { id: 'rsg', type: 'transfer', accountId: 'ca', toAccountId: 'itau', amount: 1000, date: '2026-10-21', reservaFuncaoId: 'f_bem' },
    { ...sombra('tx_rsg_b_r', 'income', 1000, 'f_bem', 'cat_bem', 'Resgate Reserva: CA'), parentTxId: 'rsg', date: '2026-10-21' },
    { ...sombra('tx_rsg_b_d', 'expense', 1000, 'f_bem', 'cat_bem', 'Resgate Reserva: CA'), parentTxId: 'rsg', date: '2026-10-21' },
  ]
  const calc = (txs, ids, modo) => despesaPorCategoria(
    filtrarPerfilDemonstrativo(txs, funcoes, ids), periodo, criarRegraDemonstrativo(funcoes, contas), modo,
  ).cat_bem

  it('bruto mostra a despesa inteira; líquido abate o resgate, em Todos e no perfil', () => {
    for (const ids of [null, new Set(['itau', 'ca', 'bem'])]) {
      expect(calc(lista(), ids, 'cheio')).toBe(1000)
      expect(calc(lista(), ids, 'liquido')).toBe(0)
    }
  })
  it('com depósito: depósito + gasto − resgate no líquido', () => {
    expect(calc(lista('2026-10-16'), null, 'liquido')).toBe(900)
    expect(calc(lista('2026-10-16'), null, 'cheio')).toBe(1900)
  })
  it('espelho de investimento fica no perfil dono do bem, não vaza para outro', () => {
    const r = filtrarPerfilDemonstrativo(lista(), funcoes, new Set(['outro']))
    expect(r.some(t => t.id === 'tx_inv_1')).toBe(false)
  })
  it('categoria do bem sem função de reserva também é despesa (não cai no bloco Reservas)', () => {
    const t = { id: 'tx_inv_2', type: 'expense', amount: 125, accountId: null, date: '2026-10-20', reservaAuto: true, reservaFuncaoId: null, categoryId: 'cat_sem_funcao', parentTxId: 'trf' }
    const regra = criarRegraDemonstrativo([], contas, [t])
    expect(regra.isReservaGerSombra(t)).toBe(false)
    expect(despesaPorCategoria([t], periodo, regra).cat_sem_funcao).toBe(125)
  })
  it('transferência categorizada para conta de aplicação com espelho conta só uma vez', () => {
    const aplic = [{ id: 'bem', isInvestimento: true, investmentCategoryId: 'cat_bem', contaAplicacao: true }]
    const txs = [
      { id: 'trf', type: 'transfer', accountId: 'itau', toAccountId: 'bem', amount: 500, date: '2026-10-20', categoryId: 'cat_bem' },
      { id: 'tx_inv_3', type: 'expense', amount: 500, accountId: null, date: '2026-10-20', reservaAuto: true, categoryId: 'cat_bem', parentTxId: 'trf' },
    ]
    expect(despesaPorCategoria(txs, periodo, criarRegraDemonstrativo([], aplic, txs)).cat_bem).toBe(500)
  })
  it('entrada em dinheiro de bem sem espelho é despesa, uma vez, no mês do pagamento', () => {
    const contasBem = [{ id: 'itau', type: 'checking' }, { id: 'carro', type: 'asset', tipoBem: 'bem_imobilizado' }, { id: 'velho', type: 'asset', tipoBem: 'bem_imobilizado' }]
    const txs = [
      { id: 'ent', type: 'transfer', accountId: 'itau', toAccountId: 'carro', bemId: 'carro', amount: 1000, date: '2026-10-20', categoryId: 'cat_car' },
      { id: 'sem', type: 'transfer', accountId: 'itau', toAccountId: 'carro', amount: 70, date: '2026-10-21', categoryId: 'cat_car' },
      { id: 'bem', type: 'transfer', accountId: 'velho', toAccountId: 'carro', bemId: 'carro', amount: 60000, date: '2026-10-22', categoryId: 'cat_car' },
    ]
    expect(despesaPorCategoria(txs, periodo, criarRegraDemonstrativo([], contasBem, txs)).cat_car).toBe(1000)
  })
  it('entrada paga com resgate: bruto mostra a entrada; líquido abate o resgate', () => {
    const contasBem = [{ id: 'itau', type: 'checking' }, { id: 'ca', type: 'savings', isReserva: true }, { id: 'carro', type: 'asset', tipoBem: 'bem_imobilizado' }]
    const f = [{ id: 'f', accountId: 'ca', categoryId: 'cat_car', exibirComoDespesa: true }]
    const txs = [
      { id: 'ent', type: 'transfer', accountId: 'itau', toAccountId: 'carro', bemId: 'carro', amount: 1000, date: '2026-10-20', categoryId: 'cat_car' },
      sombra('tx_rsg_8_r', 'income', 1000, 'f', 'cat_car', 'Resgate Reserva: CA'),
    ]
    const regra = criarRegraDemonstrativo(f, contasBem)
    expect(despesaPorCategoria(txs, periodo, regra, 'cheio').cat_car).toBe(1000)
    expect(despesaPorCategoria(txs, periodo, regra, 'liquido').cat_car).toBe(0)
  })
  it('bem com espelho não conta a entrada de novo', () => {
    const contasBem = [{ id: 'bem', type: 'asset', tipoBem: 'consorcio', isInvestimento: true, investmentCategoryId: 'cat_c' }]
    const txs = [
      { id: 'trf', type: 'transfer', accountId: 'itau', toAccountId: 'bem', bemId: 'bem', amount: 500, date: '2026-10-20', categoryId: 'cat_c' },
      { id: 'tx_inv_9', type: 'expense', amount: 500, accountId: null, date: '2026-10-20', reservaAuto: true, categoryId: 'cat_c', parentTxId: 'trf' },
    ]
    expect(despesaPorCategoria(txs, periodo, criarRegraDemonstrativo([], contasBem, txs)).cat_c).toBe(500)
  })
  it('conta de aplicação sem espelho continua contando o aporte categorizado', () => {
    const aplic = [{ id: 'cdb', contaAplicacao: true }]
    const txs = [{ id: 'trf', type: 'transfer', accountId: 'itau', toAccountId: 'cdb', amount: 500, date: '2026-10-20', categoryId: 'cat_x' }]
    expect(despesaPorCategoria(txs, periodo, criarRegraDemonstrativo([], aplic, txs)).cat_x).toBe(500)
  })
})
