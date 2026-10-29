import { describe, it, expect } from 'vitest'
import { criarRegraDemonstrativo, despesaPorCategoria, filtrarPerfilDemonstrativo } from './regraDemonstrativo.js'

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
