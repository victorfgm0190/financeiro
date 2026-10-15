import { describe, it, expect } from 'vitest'
import { executarRegras, REGRAS_COMPETENCIA } from './regras.js'
import { GRUPOS, CONTAS, gasto, etapaA } from './fixtures.js'
import { competenciasImplausiveis, distanciaCompetencia, divergenciaMesArquivo } from '../competenciaFatura.js'

describe('distanciaCompetencia', () => {
  it('à vista: fatura do mês seguinte à compra', () => {
    expect(distanciaCompetencia({ faturaMY: '2026-10', dateCartao: '2026-09-18' })).toBe(1)
  })
  it('parcela N desconta N−1 meses da data original da compra', () => {
    expect(distanciaCompetencia({ faturaMY: '2026-10', dateCartao: '2026-03-08', installmentNum: 8 })).toBe(0)
  })
  it('caso de 15/10/2026: compra de set/2026 na fatura 10/2024', () => {
    const r = competenciasImplausiveis([
      { description: 'Google G1sk003m', faturaMonthYear: '2024-10', _dateCartao: '2026-09-18', date: '2026-09-18' },
      { description: 'Google G1sk003m', faturaMonthYear: '2026-10', _dateCartao: '2026-09-18', date: '2026-09-18' },
    ])
    expect(r.map(x => x.distancia)).toEqual([-23])
  })
  it('mês do arquivo × mês escolhido', () => {
    expect(divergenciaMesArquivo('2024-10', '2026-10')).toMatch(/10\/2026.*10\/2024/)
    expect(divergenciaMesArquivo('2026-10', '2026-10')).toBeNull()
    expect(divergenciaMesArquivo('2026-10', '')).toBeNull()
  })
})

describe('regras de competência', () => {
  const certo = gasto('tx_ok', 'Google G1sk003m', 49.99, '2026-10', { date: '2026-09-18', dateCartao: '2026-09-18' })
  const errado = gasto('tx_bad', 'Google G1sk003m', 49.99, '2024-10', { date: '2026-09-18', dateCartao: '2026-09-18' })
  const dados = (transactions) => ({ transactions, accounts: CONTAS, schedules: [], gerencialGroups: GRUPOS })
  const rodar = (transactions) => executarRegras(dados(transactions), { hoje: '2026-10-15', regras: REGRAS_COMPETENCIA })

  it('acusa o gasto, a reserva incoerente e a duplicata entre faturas — fora da janela `desde`', () => {
    const out = rodar([certo, etapaA(certo), errado, etapaA(errado)])
    expect(out.map(d => `${d.regra}|${d.origem_id}`)).toEqual([
      'COMPETENCIA_IMPLAUSIVEL|tx_bad',
      'GER_RESERVA_DUPLICADA_ENTRE_FATURAS|tx_gerA_tx_bad',
      'GER_RESERVA_FATURA_INCOERENTE|tx_gerA_tx_bad',
    ])
  })

  it('rótulo da reserva diferente da fatura do gasto', () => {
    const out = rodar([certo, etapaA(certo, { faturaRef: '11/2026' })])
    expect(out.map(d => d.regra)).toEqual(['GER_RESERVA_FATURA_INCOERENTE'])
  })

  it('gêmeas legítimas na mesma fatura não são duplicata', () => {
    const g2 = { ...certo, id: 'tx_ok2' }
    expect(rodar([certo, etapaA(certo), g2, etapaA(g2)])).toEqual([])
  })
})
