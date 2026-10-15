import { describe, it, expect } from 'vitest'
import { contasEnvolvidas, filtrarPorContas } from './filtroContasEnvolvidas'

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
