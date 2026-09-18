import { describe, it, expect } from 'vitest'
import { totaisGerenciais } from './gerencialTotais'
import { computeOccurrences } from './occurrences'

const GRUPOS = [
  { id: 'grp_1', number: 1, name: 'Gerencial', alias: 'G' },
  { id: 'grp_2', number: 2, name: 'Contas Anuais', alias: '2' },
  { id: 'grp_3', number: 3, name: 'PharmaLog', alias: 'Phlo' },
  { id: 'grp_D', number: 'D', name: 'Despesa', alias: 'D' },
]

// Fatura de outubro/2026 do exemplo real.
const FATURA = [
  { type: 'expense', grupoGerencial: 'grp_1', amount: 3230.55 },
  { type: 'expense', grupoGerencial: 'grp_2', amount: 2317.26 },
  { type: 'expense', grupoGerencial: 'grp_3', amount: 2944.50 },
  { type: 'expense', grupoGerencial: 'grp_D', amount: 64.44 },
]

const porToken = (items) => Object.fromEntries(items.map(i => [i.g.alias, i.total]))

describe('totaisGerenciais', () => {
  it('sem previstos, soma só os lançamentos', () => {
    const { items, temPrevisto } = totaisGerenciais({ txs: FATURA, gerencialGroups: GRUPOS })
    expect(porToken(items)).toEqual({ G: 3230.55, 2: 2317.26, Phlo: 2944.50, D: 64.44 })
    expect(temPrevisto).toBe(false)
  })

  it('agendamento pendente de Contas Anuais entra no total do grupo', () => {
    const { items, temPrevisto } = totaisGerenciais({
      txs: FATURA,
      previstos: [{ grupoGerencial: 'grp_2', amount: 500 }],
      gerencialGroups: GRUPOS,
    })
    expect(porToken(items)).toEqual({ G: 3230.55, 2: 2817.26, Phlo: 2944.50, D: 64.44 })
    expect(items.find(i => i.g.id === 'grp_2').previsto).toBe(500)
    expect(temPrevisto).toBe(true)
    // Os demais grupos não são afetados.
    expect(items.filter(i => i.g.id !== 'grp_2').every(i => i.previsto === 0)).toBe(true)
  })

  it('previsto entra em qualquer grupo: G, numerados e D', () => {
    const { items } = totaisGerenciais({
      txs: FATURA,
      previstos: [
        { grupoGerencial: 'grp_1', amount: 100 },
        { grupoGerencial: 'grp_2', amount: 200 },
        { grupoGerencial: 'grp_3', amount: 300 },
        { grupoGerencial: 'grp_D', amount: 400 },
      ],
      gerencialGroups: GRUPOS,
    })
    expect(porToken(items)).toEqual({ G: 3330.55, 2: 2517.26, Phlo: 3244.50, D: 464.44 })
  })

  it('várias ocorrências do mesmo agendamento somam todas', () => {
    const { items } = totaisGerenciais({
      txs: [],
      previstos: [
        { grupoGerencial: 'grp_2', amount: 500 },
        { grupoGerencial: 'grp_2', amount: 500 },
        { grupoGerencial: 'grp_2', amount: 500 },
      ],
      gerencialGroups: GRUPOS,
    })
    expect(porToken(items)).toEqual({ 2: 1500 })
  })

  it('previsto cria o token de um grupo que não tem lançamento nenhum', () => {
    const { items } = totaisGerenciais({
      txs: [],
      previstos: [{ grupoGerencial: 'grp_3', amount: 42.5 }],
      gerencialGroups: GRUPOS,
    })
    expect(porToken(items)).toEqual({ Phlo: 42.5 })
  })

  it('previsto sem grupo é ignorado, como os lançamentos sem grupo', () => {
    const { items } = totaisGerenciais({
      txs: [...FATURA, { type: 'expense', grupoGerencial: null, amount: 999 }],
      previstos: [{ grupoGerencial: null, amount: 777 }],
      gerencialGroups: GRUPOS,
    })
    expect(porToken(items)).toEqual({ G: 3230.55, 2: 2317.26, Phlo: 2944.50, D: 64.44 })
  })

  it('estorno não entra em grupo nenhum e sai em separado', () => {
    const { items, estornos } = totaisGerenciais({
      txs: [...FATURA, { type: 'income', grupoGerencial: 'grp_2', amount: 150 }],
      previstos: [{ grupoGerencial: 'grp_2', amount: 500 }],
      gerencialGroups: GRUPOS,
    })
    expect(porToken(items)['2']).toBe(2817.26)
    expect(estornos).toBe(150)
  })

  it('pagamento de fatura é ignorado', () => {
    const { items } = totaisGerenciais({
      txs: [...FATURA, { type: 'credit_payment', grupoGerencial: 'grp_2', amount: 5000 }],
      gerencialGroups: GRUPOS,
    })
    expect(porToken(items)['2']).toBe(2317.26)
  })

  it('grupo que não existe mais na lista não vira token', () => {
    const { items } = totaisGerenciais({
      txs: [{ type: 'expense', grupoGerencial: 'grp_apagado', amount: 10 }],
      previstos: [{ grupoGerencial: 'grp_apagado', amount: 10 }],
      gerencialGroups: GRUPOS,
    })
    expect(items).toEqual([])
  })

  it('ordem de exibição: G, numerados crescentes, D por último', () => {
    const { items } = totaisGerenciais({ txs: FATURA, gerencialGroups: GRUPOS })
    expect(items.map(i => i.g.id)).toEqual(['grp_1', 'grp_2', 'grp_3', 'grp_D'])
  })

  it('não soma centavo errado ao acumular', () => {
    const { items } = totaisGerenciais({
      txs: [{ type: 'expense', grupoGerencial: 'grp_2', amount: 0.1 }],
      previstos: [{ grupoGerencial: 'grp_2', amount: 0.2 }],
      gerencialGroups: GRUPOS,
    })
    expect(porToken(items)['2']).toBe(0.3)
  })
})

// A exclusão de ocorrência já efetivada (o "is_paid" deste app) acontece ANTES, em
// computeOccurrences — o previsto nem chega ao totalizador. Este teste prova a ponta que
// garante que o agendamento registrado não seja contado duas vezes.
describe('ocorrência já registrada não vira previsto', () => {
  const base = {
    id: 'sch_1', description: 'Anuidade', transactionType: 'expense',
    amount: 500, frequency: 'monthly', startDate: '2026-10-10',
    grupoGerencial: 'grp_2', registered: [], skipped: [],
  }

  it('pendente aparece e soma no grupo', () => {
    const occs = computeOccurrences(base, 3)
    expect(occs).toContain('2026-10-10')
    const previstos = occs
      .filter(d => d.startsWith('2026-10'))
      .map(d => ({ grupoGerencial: base.grupoGerencial, amount: base.amount, date: d }))
    const { items } = totaisGerenciais({ txs: FATURA, previstos, gerencialGroups: GRUPOS })
    expect(porToken(items)['2']).toBe(2817.26)
  })

  it('registrada some das ocorrências → total do grupo volta ao realizado', () => {
    const pago = { ...base, registered: ['2026-10-10'] }
    const occs = computeOccurrences(pago, 3)
    expect(occs).not.toContain('2026-10-10')
    const previstos = occs
      .filter(d => d.startsWith('2026-10'))
      .map(d => ({ grupoGerencial: pago.grupoGerencial, amount: pago.amount, date: d }))
    expect(previstos).toEqual([])
    const { items, temPrevisto } = totaisGerenciais({ txs: FATURA, previstos, gerencialGroups: GRUPOS })
    expect(porToken(items)['2']).toBe(2317.26)
    expect(temPrevisto).toBe(false)
  })

  it('pulada também não vira previsto', () => {
    const occs = computeOccurrences({ ...base, skipped: ['2026-10-10'] }, 3)
    expect(occs).not.toContain('2026-10-10')
  })
})
