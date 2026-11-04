// "Ainda posso gastar" no topo da tela Envelopes (e nos cards "Envelopes do mês" do Painel e do
// Início no celular — todos via totaisEnvelopes): a soma do que cada card mostra. Mensal = limite −
// gasto (negativo quando estourou); Diário = A gastar. Total limite e Já gasto continuam somas simples.
import { describe, it, expect } from 'vitest'
import { resumoEnvelope, totaisEnvelopes, gastoEnvelopes } from './envelopes'
import { ENVELOPES, transacoes, SEMENTES } from './__fixtures__/envelopesSaldos'

const mensal = (limite, gasto) => resumoEnvelope({ env: { limitAmount: limite }, txs: [], spent: gasto })
const diario = (orcamento, gasto, aGastar) => resumoEnvelope({ env: { tipoOrcamento: 'diario' }, txs: [], spent: gasto, orc: { orcamento, aGastar, estado: 'atual' } })
const r2 = (n) => Math.round(n * 100) / 100

describe('totaisEnvelopes — Ainda posso gastar = soma dos cards', () => {
  it('Mensais 496,33 / −326,76 / 262,69 + Diários A gastar 288,00 e 96,00 → 816,26; limite 8.720,00; gasto 7.416,44', () => {
    const resumos = [
      mensal(2000, 1503.67), mensal(1500, 1826.76), mensal(1000, 737.31),
      diario(2640, 2200, 288), diario(1580, 1148.70, 96),
    ]
    expect(resumos.map(r => r.disponivel)).toEqual([496.33, -326.76, 262.69, 288, 96])
    const t = totaisEnvelopes(resumos)
    expect(t.disponivel).toBe(816.26)
    expect(t.limite).toBe(8720)
    expect(t.gasto).toBe(7416.44)
    // A conta antiga (limite − gasto) devolvia a economia dos dias passados do diário:
    expect(r2(t.limite - t.gasto)).toBe(1303.56)
  })

  it('regressão: só com envelopes Mensais, igual à conta de antes (limite − gasto), também estourado', () => {
    for (const seed of SEMENTES) {
      const resumos = gastoEnvelopes(ENVELOPES, transacoes(seed), 2026 * 12 + 10, 1).map(resumoEnvelope)
      const t = totaisEnvelopes(resumos)
      expect(t.disponivel, `semente ${seed}`).toBe(r2(t.limite - t.gasto))
    }
    const estourado = totaisEnvelopes([mensal(100, 250), mensal(300, 120)])
    expect(estourado.disponivel).toBe(30)
    expect(totaisEnvelopes([mensal(100, 250)]).disponivel).toBe(-150)
  })
})
