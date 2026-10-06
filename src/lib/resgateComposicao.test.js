import { describe, it, expect } from 'vitest'
import { composicaoResgate, ehResgateDeCartao, itemSaidaFluxo, itemAbreComposicao } from './resgateComposicao'
import { computeOccurrences } from './occurrences'

const getOcc = (s, n) => computeOccurrences(s, n)

const resgate = (over = {}) => ({
  id: 'sch_res_itau_202610', tipo: 'resgate_reserva', transactionType: 'transfer',
  description: 'Resgate Reserva Itaupers - Fatura 10/2026', accountId: 'acc_reserva',
  toAccountId: 'acc_corrente', amount: 300, frequency: 'once', startDate: '2026-10-25',
  sourceExpenseIds: ['tx_a', 'tx_b', 'sch:sch_anuidade@2026-10-20'], ...over,
})

const transactions = [
  { id: 'tx_b', date: '2026-10-12', description: 'Mercado', categoryId: 'cat_merc', amount: 120 },
  { id: 'tx_a', date: '2026-10-03', description: 'Farmácia', categoryId: 'cat_saude', amount: 80 },
  { id: 'tx_fora', date: '2026-10-05', description: 'Não faz parte', amount: 999 },
]

const anuidade = {
  id: 'sch_anuidade', description: 'Anuidade', transactionType: 'expense', accountId: 'card_itau',
  categoryId: 'cat_tarifa', amount: 100, frequency: 'once', startDate: '2026-10-20', registered: [], skipped: [],
}

describe('linha de resgate no Fluxo Futuro', () => {
  it('resgate de cartão é clicável (pelo tipo, não pela descrição)', () => {
    const it_ = itemSaidaFluxo(resgate(), '2026-10-25', 300)
    expect(it_).toEqual({ date: '2026-10-25', label: 'Resgate Reserva Itaupers - Fatura 10/2026', amount: 300, resgateScheduleId: 'sch_res_itau_202610' })
    expect(itemAbreComposicao(it_)).toBe(true)
  })

  it('transferência comum não é clicável, mesmo com "Resgate" na descrição', () => {
    const comum = { id: 'sch_t', transactionType: 'transfer', description: 'Resgate Reserva manual', amount: 50 }
    expect(ehResgateDeCartao(comum)).toBe(false)
    const it_ = itemSaidaFluxo(comum, '2026-10-10', 50)
    expect(it_.resgateScheduleId).toBeUndefined()
    expect(itemAbreComposicao(it_)).toBe(false)
  })

  it('provisão / item sem schedule não é clicável', () => {
    expect(itemAbreComposicao({ date: '2026-10-01', label: 'Resgate (provisão)', amount: 10 })).toBe(false)
    expect(itemAbreComposicao(null)).toBe(false)
  })
})

describe('composicaoResgate', () => {
  it('realizados + previstos somam o amount do resgate', () => {
    const r = composicaoResgate(resgate(), transactions, [anuidade], getOcc)
    expect(r.gastos.map(g => g.key)).toEqual(['tx_a', 'tx_b', 'sch:sch_anuidade@2026-10-20'])
    expect(r.gastos.map(g => g.previsto)).toEqual([false, false, true])
    expect(r.total).toBe(300)
    expect(r.diferenca).toBe(0)
    expect(r.fecha).toBe(true)
    expect(r.qtdPrevistos).toBe(1)
    expect(r.semFontes).toBe(false)
  })

  it('aponta a diferença quando a soma não fecha', () => {
    const r = composicaoResgate(resgate({ amount: 310 }), transactions, [anuidade], getOcc)
    expect(r.fecha).toBe(false)
    expect(r.diferenca).toBe(-10)
  })

  it('soma em centavos sem erro de ponto flutuante', () => {
    const txs = [
      { id: 'x1', date: '2026-10-01', amount: 0.1 },
      { id: 'x2', date: '2026-10-02', amount: 0.2 },
    ]
    const r = composicaoResgate(resgate({ amount: 0.3, sourceExpenseIds: ['x1', 'x2'] }), txs, [], getOcc)
    expect(r.total).toBe(0.3)
    expect(r.fecha).toBe(true)
  })

  it('resgate sem sourceExpenseIds (antigo/manual) → semFontes', () => {
    const r = composicaoResgate(resgate({ sourceExpenseIds: undefined }), transactions, [], getOcc)
    expect(r.semFontes).toBe(true)
    expect(r.gastos).toEqual([])
    expect(r.fecha).toBe(false)
  })

  it('previsto de agendamento apagado continua na lista como órfão', () => {
    const r = composicaoResgate(resgate(), transactions, [], getOcc)
    const orfao = r.gastos.find(g => g.previsto)
    expect(orfao.orfao).toBe(true)
    expect(orfao.description).toBe('(agendamento removido)')
  })
})
