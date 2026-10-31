import { describe, it, expect } from 'vitest'
import { idsComEtapaA, conciliacaoHerdada, gastoDaEtapaA } from './conciliacaoEtapaA'
import { montarProvisaoGerencial } from './provisaoGerencial'

const gasto = (id, extra = {}) => ({ id, type: 'expense', accountType: 'credit', accountId: 'card', amount: 100, date: '2026-10-05', ...extra })
const etapaA = (gastoId, extra = {}) => ({ id: `tx_gerA_${gastoId}`, type: 'transfer', accountId: 'cc', toAccountId: 'ger', amount: 100, ...extra })

// Mesmo laço do setReconciled (AppContext): marca os ids expandidos.
const aplicar = (txs, ids, value) => {
  const set = idsComEtapaA(txs, ids)
  return txs.map(t => set.has(t.id) ? { ...t, reconciled: !!value } : t)
}

describe('etapa A herda a conciliação do gasto', () => {
  const base = [
    gasto('g1'), etapaA('g1'),
    gasto('g2'), etapaA('g2'),
    { id: 'tx_ger_1', type: 'transfer', parentTxId: 'g3', accountId: 'cc', toAccountId: 'ger', amount: 50 },
    gasto('g3', { installmentNum: 2 }),
    gasto('num', { grupoGerencial: 'grp_2' }),
    { id: 'outra', type: 'transfer', accountId: 'cc', toAccountId: 'x', amount: 10 },
  ]

  it('conciliar o gasto concilia a etapa A (e só a dele)', () => {
    const r = aplicar(base, ['g1'], true)
    expect(r.find(t => t.id === 'tx_gerA_g1').reconciled).toBe(true)
    expect(r.find(t => t.id === 'tx_gerA_g2').reconciled).toBeUndefined()
  })

  it('desconciliar o gasto devolve a etapa A para pendente', () => {
    const conc = aplicar(base, ['g1', 'g2'], true)
    const r = aplicar(conc, ['g1'], false)
    expect(r.find(t => t.id === 'tx_gerA_g1').reconciled).toBe(false)
    expect(r.find(t => t.id === 'tx_gerA_g2').reconciled).toBe(true)
  })

  it('provisão do Executar Gerenciais (tx_ger_, parentTxId) também acompanha', () => {
    const r = aplicar(base, ['g3'], true)
    expect(r.find(t => t.id === 'tx_ger_1').reconciled).toBe(true)
  })

  it('mexer na etapa A não toca o gasto; gasto sem etapa A (numerado/D) só muda ele mesmo', () => {
    expect([...idsComEtapaA(base, ['tx_gerA_g1'])]).toEqual(['tx_gerA_g1'])
    expect([...idsComEtapaA(base, ['num'])]).toEqual(['num'])
    expect([...idsComEtapaA(base, 'outra')]).toEqual(['outra'])
  })

  it('gastoDaEtapaA reconhece só transferências gerenciais', () => {
    expect(gastoDaEtapaA(etapaA('g1'))).toBe('g1')
    expect(gastoDaEtapaA({ id: 'tx_ger_9', type: 'transfer', parentTxId: 'p' })).toBe('p')
    expect(gastoDaEtapaA({ id: 'tx_gerA_x', type: 'expense' })).toBeNull()
    expect(gastoDaEtapaA({ id: 'tx_1', type: 'transfer' })).toBeNull()
  })

  it('etapa A criada depois nasce com o status do gasto', () => {
    expect(conciliacaoHerdada({ reconciled: true })).toBe(true)
    expect(conciliacaoHerdada({})).toBe(false)
    expect(conciliacaoHerdada(null)).toBe(false)
  })
})

describe('provisão gerencial (Executar Gerenciais / Motor de Integridade) nasce conciliada', () => {
  const d = {
    gerencialGroups: [{ id: 'grp_1', number: 1 }],
    accounts: [
      { id: 'card', type: 'credit', profileId: 'p1', apelido: 'CART' },
      { id: 'cc', type: 'checking', contaCorrentePrincipal: true, profileId: 'p1' },
    ],
    settings: { financialMonthStartDay: 15 },
  }
  const parcela = (reconciled) => gasto('par', { grupoGerencial: 'grp_1', installmentNum: 2, faturaMonthYear: '2026-11', reconciled })

  it('com o gasto conciliado', () => {
    expect(montarProvisaoGerencial(d, parcela(true), { id: 'tx_gerA_par', origin: 'etapa_a' }).tx.reconciled).toBe(true)
  })
  it('com o gasto pendente', () => {
    expect(montarProvisaoGerencial(d, parcela(false), { id: 'tx_gerA_par', origin: 'etapa_a' }).tx.reconciled).toBe(false)
  })
})
