// Fonte única da fatura de cartão (lib/faturaCartao). Dados FICTÍCIOS.
import { describe, it, expect } from 'vitest'
import {
  lancamentosDaFatura, faturasDoCartao, faturaAtualDoCartao, resumoGerencialDaFatura, situacaoDaFatura, parcelaPorExtenso, chaveDoGrupo,
} from './faturaCartao.js'

const CARD = { id: 'c1', type: 'credit', closingDay: 13 }
const GRUPOS = [
  { id: 'g1', number: 1, alias: 'G', name: 'Reserva' }, { id: 'g2', number: 2, alias: '2', name: 'Contas Anuais' },
  { id: 'gd', number: 'D', alias: 'D', name: 'Despesas' },
]
const tx = (o) => ({ accountId: 'c1', type: 'expense', ...o })
const TXS = [
  tx({ id: 'a', date: '2026-10-20', amount: 100, grupoGerencial: 'g1' }),
  // parcela de compra antiga: a data é de agosto, mas a fatura gravada é novembro
  tx({ id: 'b', date: '2026-08-10', amount: 50.1, faturaMonthYear: '2026-11', grupoGerencial: 'g2', installmentNum: 3, installmentTotal: 6 }),
  // data dentro do período de novembro, mas movida para dezembro
  tx({ id: 'c', date: '2026-11-01', amount: 999, faturaMonthYear: '2026-12' }),
  tx({ id: 'd', date: '2026-11-02', amount: 2.9 }), // sem grupo
  tx({ id: 'e', date: '2026-11-03', amount: 30, grupoGerencial: 'gd' }),
  tx({ id: 'f', date: '2026-11-05', amount: 10.01, type: 'income' }), // estorno
  { id: 'p', type: 'credit_payment', accountId: 'c1', date: '2026-11-10', amount: 5000, faturaMonthYear: '2026-11' },
  tx({ id: 'x', accountId: 'outro', date: '2026-10-20', amount: 7 }),
]

describe('lancamentosDaFatura', () => {
  it('pela competência da fatura (fatura_ref), não pelo intervalo de data; pagamento fora do total', () => {
    const f = lancamentosDaFatura(TXS, CARD, '2026-11')
    expect(f.lancamentos.map(t => t.id).sort()).toEqual(['a', 'b', 'd', 'e', 'f'])
    expect(f.total).toBe(172.99) // 100 + 50,10 + 2,90 + 30 − 10,01
    expect(f.pagamentos.map(t => t.id)).toEqual(['p'])
  })
})

describe('faturasDoCartao / fatura atual', () => {
  it('ordem decrescente, atual marcada, futuras com rótulo', () => {
    expect(faturaAtualDoCartao(CARD, '2026-11-14')).toBe('2026-12')
    const l = faturasDoCartao(TXS, CARD, '2026-11-14')
    expect(l.map(x => x.rotulo)).toEqual(['Dez/2026 · atual', 'Nov/2026'])
    expect(faturasDoCartao(TXS, CARD, '2026-11-05').map(x => x.rotulo)).toEqual(['Dez/2026 · futura', 'Nov/2026 · atual'])
  })
})

describe('resumoGerencialDaFatura', () => {
  it('grupos + sem grupo − estornos = total; sem diferença', () => {
    const f = lancamentosDaFatura(TXS, CARD, '2026-11')
    const r = resumoGerencialDaFatura(f, GRUPOS)
    expect(r.grupos.map(g => [g.grupo.alias, g.total])).toEqual([['G', 100], ['2', 50.1], ['D', 30]])
    expect([r.semGrupo, r.estornos, r.fechamento, r.diferenca]).toEqual([2.9, 10.01, 172.99, 0])
    expect(chaveDoGrupo(TXS[3], GRUPOS)).toBe('sem')
    expect(chaveDoGrupo(TXS[5], GRUPOS)).toBe('estorno')
  })
  it('parcela por extenso', () => {
    expect(parcelaPorExtenso(TXS[1])).toBe('Parcela 3 de 6')
    expect(parcelaPorExtenso(TXS[0])).toBe('')
  })
})

describe('situacaoDaFatura — regra dos previstos', () => {
  it('fatura sem lançamento com R$ 678,25 previsto: não paga, falta 678,25 (nunca "quitada")', () => {
    const s = situacaoDaFatura({ total: 0, previsto: 678.25, pago: 0 })
    expect(s).toMatchObject({ aPagar: 678.25, diferenca: -678.25, semValor: false, paga: false, parcial: false, saldoRestante: 678.25 })
  })
  it('sem lançamento e sem previsto: "nada a pagar"', () => {
    expect(situacaoDaFatura({ total: 0, previsto: 0, pago: 0 }).semValor).toBe(true)
  })
  it('pago cobre lançamentos + previstos: paga', () => {
    expect(situacaoDaFatura({ total: 100, previsto: 50, pago: 150 }).paga).toBe(true)
    expect(situacaoDaFatura({ total: 100, previsto: 50, pago: 100 })).toMatchObject({ paga: false, parcial: true, diferenca: -50 })
  })
})
