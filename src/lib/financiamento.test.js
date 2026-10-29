import { describe, it, expect } from 'vitest'
import {
  rateioComQuitacao, quitarPorPadrao, podeQuitarComDesconto, resumoFinanciamento, ehContaDeFinanciamento,
} from './financiamento'

// Caso real: TIGGO 5X PRO (SAFRA), parcela 1.092,28 = principal 665,00 + juros 427,28.
const P = 665, J = 427.28

describe('quitação com desconto por antecipação', () => {
  it('pagamento antecipado com desconto → PAGA, diferença vira desconto (nunca juros em falta)', () => {
    expect(rateioComQuitacao(1087.80, P, J, { quitar: true })).toEqual({
      principalPago: 665, jurosPago: 422.80, desvioJuros: 0, desconto: 4.48, status: 'paid', saldoRestante: 0,
    })
    expect(rateioComQuitacao(1085.32, P, J, { quitar: true })).toMatchObject({ status: 'paid', desconto: 6.96, saldoRestante: 0 })
  })
  it('principal faltando → PARCIAL, mesmo marcado para quitar', () => {
    expect(rateioComQuitacao(600, P, J, { quitar: true })).toMatchObject({ status: 'partial', principalPago: 600, desconto: 0, saldoRestante: 492.28 })
    expect(podeQuitarComDesconto(600, P, J)).toBe(false)
  })
  it('desmarcado ("não quitou") → PARCIAL com juros em falta, como hoje', () => {
    expect(rateioComQuitacao(1087.80, P, J)).toMatchObject({ status: 'partial', desvioJuros: 4.48, desconto: 0, saldoRestante: 4.48 })
  })
  it('pagamento sem desconto (valor cheio) → PAGA como hoje', () => {
    expect(rateioComQuitacao(1092.28, P, J, { quitar: true })).toEqual({
      principalPago: 665, jurosPago: 427.28, desvioJuros: 0, desconto: 0, status: 'paid', saldoRestante: 0,
    })
    expect(podeQuitarComDesconto(1092.28, P, J)).toBe(false)
  })
  it('vem marcado só quando o pagamento é antes do vencimento', () => {
    expect(quitarPorPadrao('2026-08-25', '2026-09-03')).toBe(true)
    expect(quitarPorPadrao('2026-09-03', '2026-09-03')).toBe(false)
    expect(quitarPorPadrao('2026-09-10', '2026-09-03')).toBe(false)
  })
})

describe('saldo devedor e consulta do financiamento', () => {
  const parcela = (numero, o = {}) => ({
    numero, principal_provisioned: P, juros_provisioned: J, total_provisioned: 1092.28,
    principal_pago: 0, juros_pago: 0, total_pago: 0, desconto_antecipacao: 0, status: 'open',
    data_vencimento: `2026-${String(8 + numero).padStart(2, '0')}-03`, ...o,
  })
  const pagas = [
    parcela(1, { status: 'paid', principal_pago: P, juros_pago: 422.80, total_pago: 1087.80, desconto_antecipacao: 4.48 }),
    parcela(2, { status: 'paid', principal_pago: P, juros_pago: 422.30, total_pago: 1087.30, desconto_antecipacao: 4.98 }),
    parcela(3, { status: 'paid', principal_pago: P, juros_pago: 420.32, total_pago: 1085.32, desconto_antecipacao: 6.96 }),
  ]
  const abertas = Array.from({ length: 57 }, (_, i) => parcela(i + 4))

  it('saldo devedor = principal das não quitadas (57 × 665,00); juros futuros e desconto fora', () => {
    const r = resumoFinanciamento([...pagas, ...abertas])
    expect(r.saldoPrincipal).toBe(37905)
    expect(r.totalAPagar).toBe(62259.96) // 57 × 1.092,28 — o que ainda sai da conta, com juros previstos
    expect(r).toMatchObject({ quitadas: 3, total: 60, valorPago: 3260.42, principalAmortizado: 1995, jurosPagos: 1265.42, desconto: 16.42 })
    expect(r.proxima.numero).toBe(4)
  })
  it('parcela parcial: o principal pago já amortiza; o resto fica no total a pagar', () => {
    const r = resumoFinanciamento([parcela(1, { status: 'partial', principal_pago: 600, total_pago: 600 }), parcela(2)])
    expect(r.saldoPrincipal).toBe(730)
    expect(r.totalAPagar).toBe(1584.56)
    expect(r.proxima.numero).toBe(1)
  })
  it('conta de dívida de financiamento (acc_divida_…); outras dívidas não', () => {
    expect(ehContaDeFinanciamento({ id: 'acc_divida_msjc0rqh_duoz4y', type: 'liability' })).toBe(true)
    expect(ehContaDeFinanciamento({ id: 'acc_cafe_do_bras', type: 'liability' })).toBe(false)
  })
})
