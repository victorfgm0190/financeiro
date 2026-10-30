import { describe, it, expect } from 'vitest'
import { funcaoPadraoDoLancamento, grupoExigeFuncao, funcaoUnicaDaConta } from './funcaoReserva.js'

const accounts = [
  { id: 'itau', type: 'checking' },
  { id: 'pharma', type: 'savings', isReserva: true },
  { id: 'ca', type: 'savings', isReserva: true },
]
const reserveFunctions = [
  { id: 'f_ph', accountId: 'pharma' },
  { id: 'f_gas', accountId: 'ca' },
  { id: 'f_salao', accountId: 'ca' },
]
const gerencialGroups = [
  { id: 'g1', number: 1, defaultAccountId: 'itau' },
  { id: 'g_ph', number: 3, defaultAccountId: 'pharma' },
  { id: 'g_ca', number: 2, defaultAccountId: 'ca' },
]
const ctx = { accounts, gerencialGroups, reserveFunctions }

describe('função de reserva padrão', () => {
  it('reserva com UMA função: transferência de/para ela recebe a função', () => {
    expect(funcaoPadraoDoLancamento({ type: 'transfer', accountId: 'pharma', toAccountId: 'itau' }, ctx)).toBe('f_ph')
    expect(funcaoPadraoDoLancamento({ type: 'transfer', accountId: 'itau', toAccountId: 'pharma' }, ctx)).toBe('f_ph')
  })
  it('reserva com várias funções, diferença "a distribuir" ou função já escolhida → nada', () => {
    expect(funcaoPadraoDoLancamento({ type: 'transfer', accountId: 'ca', toAccountId: 'itau' }, ctx)).toBeNull()
    expect(funcaoPadraoDoLancamento({ type: 'transfer', accountId: 'itau', toAccountId: 'pharma', origin: 'reserva_a_distribuir' }, ctx)).toBeNull()
    expect(funcaoPadraoDoLancamento({ type: 'transfer', accountId: 'pharma', toAccountId: 'itau', reservaFuncaoId: 'x' }, ctx)).toBeNull()
  })
  it('gasto de cartão em grupo numerado de reserva com UMA função → ela; Grupo G / várias → nada', () => {
    expect(funcaoPadraoDoLancamento({ type: 'expense', grupoGerencial: 'g_ph' }, ctx)).toBe('f_ph')
    expect(funcaoPadraoDoLancamento({ type: 'expense', grupoGerencial: 'g_ca' }, ctx)).toBeNull()
    expect(funcaoPadraoDoLancamento({ type: 'expense', grupoGerencial: 'g1' }, ctx)).toBeNull()
  })
  it('grupo exige função só quando a conta de reserva tem mais de uma', () => {
    expect(grupoExigeFuncao('g_ca', gerencialGroups, reserveFunctions)).toBe(true)
    expect(grupoExigeFuncao('g_ph', gerencialGroups, reserveFunctions)).toBe(false)
    expect(grupoExigeFuncao('g1', gerencialGroups, reserveFunctions)).toBe(false)
    expect(funcaoUnicaDaConta('ca', reserveFunctions)).toBeNull()
  })
})
