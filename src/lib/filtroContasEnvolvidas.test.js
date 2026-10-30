import { describe, it, expect } from 'vitest'
import { contasEnvolvidas, filtrarPorContas, contasReservaDaAba, filtrarPorContaReserva } from './filtroContasEnvolvidas'

const accounts = [
  { id: 'itau', name: 'Itaú Conta Corrente' },
  { id: 'ca', name: 'Contas Anuais' },
  { id: 'imp', name: 'Imperium' },
]
const t = (id, from, to) => ({ id, accountId: from, toAccountId: to })
const lista = [
  t('1', 'itau', 'ca'),
  t('2', 'ca', 'itau'),
  t('3', 'ca', 'imp'),
  t('4', 'imp', 'itau'),
  t('5', 'ca', null),
]
const ids = (arr) => arr.map(s => s.id)

describe('contasEnvolvidas', () => {
  it('conta origem+destino, ordena por quantidade e nome, ignora destino vazio', () => {
    expect(contasEnvolvidas(lista, accounts)).toEqual([
      { accountId: 'ca', nome: 'Contas Anuais', count: 4 },
      { accountId: 'itau', nome: 'Itaú Conta Corrente', count: 3 },
      { accountId: 'imp', nome: 'Imperium', count: 2 },
    ])
  })
  it('empate na quantidade → nome', () => {
    expect(contasEnvolvidas([t('a', 'itau', 'imp')], accounts).map(c => c.nome)).toEqual(['Imperium', 'Itaú Conta Corrente'])
  })
  it('origem = destino conta uma vez', () => {
    expect(contasEnvolvidas([t('x', 'ca', 'ca')], accounts)[0].count).toBe(1)
  })
})

describe('filtrarPorContas', () => {
  it('nenhuma conta → tudo', () => {
    expect(filtrarPorContas(lista, new Set())).toBe(lista)
    expect(filtrarPorContas(lista, null)).toBe(lista)
  })
  it('1 conta → origem ou destino (inclui sem destino)', () => {
    expect(ids(filtrarPorContas(lista, new Set(['ca'])))).toEqual(['1', '2', '3', '5'])
    expect(ids(filtrarPorContas(lista, ['imp']))).toEqual(['3', '4'])
  })
  it('2 contas → só entre elas; sem destino sai', () => {
    expect(ids(filtrarPorContas(lista, new Set(['itau', 'ca'])))).toEqual(['1', '2'])
  })
  it('3 contas → ambas as pontas entre as três', () => {
    expect(ids(filtrarPorContas(lista, new Set(['itau', 'ca', 'imp'])))).toEqual(['1', '2', '3', '4'])
  })
})

describe('filtro por conta de reserva', () => {
  const contas = [
    { id: 'cc', name: 'Conta Corrente' },
    { id: 'r1', name: 'Reserva B', isReserva: true },
    { id: 'r2', name: 'Reserva A', apelido: 'RA', vinculoTipo: 'reserva' },
    { id: 'poup', name: 'Poupança comum', type: 'savings' },
  ]
  const todos = [t('1', 'cc', 'r1'), t('2', 'r1', 'cc'), t('3', 'cc', 'r2'), t('4', 'cc', 'poup')]
  it('opções = contas de reserva da aba (origem ou destino), por nome; contagem do status atual', () => {
    expect(contasReservaDaAba(todos, [todos[0], todos[1]], contas)).toEqual([
      { accountId: 'r2', nome: 'RA', count: 0 },
      { accountId: 'r1', nome: 'Reserva B', count: 2 },
    ])
  })
  it('itens com o agendamento dentro (linhas de Pagos)', () => {
    const linhas = [{ schedule: todos[2] }, { schedule: todos[0] }]
    expect(contasReservaDaAba(todos, linhas, contas, l => l.schedule).find(c => c.accountId === 'r2').count).toBe(1)
    expect(filtrarPorContaReserva(linhas, 'r2', l => l.schedule)).toEqual([linhas[0]])
  })
  it('filtro: origem OU destino; Todas devolve a lista', () => {
    expect(ids(filtrarPorContaReserva(todos, 'r1'))).toEqual(['1', '2'])
    expect(filtrarPorContaReserva(todos, '')).toBe(todos)
  })
})
