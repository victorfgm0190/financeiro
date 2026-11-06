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
  it('resgate não soma como receita: abate a despesa, se a função tem depósito', () => {
    const lista = [...txs, { id: 'sal', type: 'income', amount: 1000, accountId: 'itau', date: '2026-10-20', categoryId: 'cat_sal' }]
    const regra = criarRegraDemonstrativo(reserveFunctions, accounts, lista)
    expect(totaisDoDemonstrativo(lista, periodo, regra)).toEqual({ receita: 1000, despesa: -210 })
  })
  it('resgate de função sem depósito não é receita nem abate', () => {
    const f = [{ id: 'f', accountId: 'ca', categoryId: 'cat_x', exibirComoDespesa: true }]
    const lista = [
      { id: 'g', type: 'expense', amount: 300, accountId: 'itau', date: '2026-10-20', categoryId: 'cat_x' },
      sombra('tx_rsg_9_r', 'income', 300, 'f', 'cat_x', 'Resgate Reserva: CA'),
      sombra('tx_rsg_9_d', 'expense', 300, 'f', 'cat_x', 'Resgate Reserva: CA'),
    ]
    expect(totaisDoDemonstrativo(lista, periodo, criarRegraDemonstrativo(f, accounts, lista))).toEqual({ receita: 0, despesa: 300 })
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
  const calc = (txs, ids) => despesaPorCategoria(
    filtrarPerfilDemonstrativo(txs, funcoes, ids), periodo, criarRegraDemonstrativo(funcoes, contas, txs),
  ).cat_bem

  it('função sem depósito: o resgate não abate, em Todos e no perfil', () => {
    expect(calc(lista(), null)).toBe(1000)
    expect(calc(lista(), new Set(['itau', 'ca', 'bem']))).toBe(1000)
  })
  it('função com depósito antes do resgate: o modelo de sempre (depósito + gasto − resgate)', () => {
    expect(calc(lista('2026-10-16'), null)).toBe(900)
  })
  it('depósito só depois do resgate não muda o mês do resgate', () => {
    expect(calc(lista('2026-11-20'), null)).toBe(1000)
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
  it('conta de aplicação sem espelho continua contando o aporte categorizado', () => {
    const aplic = [{ id: 'cdb', contaAplicacao: true }]
    const txs = [{ id: 'trf', type: 'transfer', accountId: 'itau', toAccountId: 'cdb', amount: 500, date: '2026-10-20', categoryId: 'cat_x' }]
    expect(despesaPorCategoria(txs, periodo, criarRegraDemonstrativo([], aplic, txs)).cat_x).toBe(500)
  })
})
