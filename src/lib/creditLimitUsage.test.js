import { describe, it, expect } from 'vitest'
import { creditLimitUsage } from '../components/shared/utils'

const card = { id: 'cc', closingDay: 10, creditLimit: 1000 }
const exp = (id, amount, fat, extra = {}) => ({ id, type: 'expense', accountId: 'cc', amount, date: `${fat}-05`, faturaMonthYear: fat, ...extra })

describe('creditLimitUsage', () => {
  it('soma só o em aberto: paga = 0, parcial abatida, futura entra', () => {
    const txs = [
      exp('a', 100, '2026-07'),
      exp('b', 200, '2026-08'),
      exp('c', 50, '2026-09'),
      { id: 'e', type: 'income', accountId: 'cc', amount: 20, date: '2026-09-03', faturaMonthYear: '2026-09' },
      { id: 'p', type: 'credit_payment', accountId: 'cc', amount: 80, date: '2026-08-20', faturaMonthYear: '2026-08' },
    ]
    const schedules = [{ tipo: 'pagamento_fatura', cardId: 'cc', faturaMesAno: '2026-07', amount: 100, registered: ['2026-07-20'] }]
    // 07 paga via agendamento (0) + 08 parcial (120) + 09 (50 − 20 = 30)
    expect(creditLimitUsage(card, txs, schedules).total).toBe(150)
  })

  it('agendamento ainda não registrado não conta como pagamento', () => {
    const schedules = [{ tipo: 'pagamento_fatura', cardId: 'cc', faturaMesAno: '2026-07', amount: 100, registered: [] }]
    expect(creditLimitUsage(card, [exp('a', 100, '2026-07')], schedules).total).toBe(100)
  })

  it('fatura fechada anterior à última paga conta como paga; aberta não', () => {
    const txs = [exp('r3', 26.36, '2026-03'), exp('r4', 67.55, '2026-04'), exp('a', 100, '2026-07'), exp('f', 40, '2026-10')]
    const schedules = [{ tipo: 'pagamento_fatura', cardId: 'cc', faturaMesAno: '2026-07', amount: 100, registered: ['x'] }]
    const isFechada = (cardId, k) => k === '2026-03'
    // 03 fechada antes de 07 → 0; 04 não fechada → entra; 10 é posterior → entra
    expect(creditLimitUsage(card, txs, schedules, { isFechada }).total).toBe(107.55)
  })

  it('ignora lançamentos de outros cartões', () => {
    expect(creditLimitUsage(card, [exp('a', 100, '2026-07', { accountId: 'outro' })], []).total).toBe(0)
  })
})
