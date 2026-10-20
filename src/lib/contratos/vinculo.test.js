import { describe, it, expect } from 'vitest'
import { similaridadeNome, normalizarNome, candidatosVinculo, planoVinculo } from './vinculo.js'
import { computeOccurrences } from '../occurrences.js'

const CONTRATO = {
  id: 'c1', tipo: 'pagar', favorecido: 'Imobiliária Silva Ltda', favorecido_condominio: 'Condomínio Edifício Sol',
  valor_base: 3900, bonificacao_valor: 200, valor_condominio_previsto: 1300, dia_vencimento: 10,
  dia_vencimento_condominio: 8, data_inicio: '2026-01-10',
}
const ag = (o) => ({
  id: 's', description: '', transactionType: 'expense', amount: 0, payee: '', frequency: 'monthly',
  startDate: '2026-01-10', registered: [], skipped: [], overrides: {}, ...o,
})

describe('nomes', () => {
  it('normaliza acento, caixa, pontuação e abreviações', () => {
    expect(normalizarNome('IMOB. SILVA LTDA')).toBe('imobiliaria silva')
    expect(normalizarNome('Cond. Ed. Sol')).toBe('condominio edificio sol')
  })
  it('igual = 1; parcial por prefixo; diferente = 0', () => {
    expect(similaridadeNome('IMOB. SILVA', 'Imobiliária Silva Ltda')).toBe(1)
    expect(similaridadeNome('Silva Imóveis', 'Imobiliária Silva')).toBeGreaterThanOrEqual(0.5)
    expect(similaridadeNome('Silva', 'Imobiliária Silva')).toBe(0.75)
    expect(similaridadeNome('Padaria', 'Imobiliária Silva')).toBe(0)
  })
})

describe('candidatosVinculo', () => {
  const lista = [
    ag({ id: 'a', payee: 'IMOB SILVA', amount: 3700, description: 'Aluguel apto' }),
    ag({ id: 'b', payee: 'Cond. Ed. Sol', amount: 1250, startDate: '2026-01-08' }),
    ag({ id: 'c', payee: 'Fulano', description: 'Aluguel garagem', amount: 300, startDate: '2026-01-25' }),
    ag({ id: 'd', payee: 'Padaria', description: 'Pão', amount: 50 }),
    ag({ id: 'e', payee: 'IMOB SILVA', transactionType: 'income', amount: 3700 }),
    ag({ id: 'f', payee: 'IMOB SILVA', contratoId: 'outro' }),
    ag({ id: 'fsch_x_202610_pagamento_fatura', payee: 'IMOB SILVA', tipo: 'pagamento_fatura' }),
  ]
  const r = candidatosVinculo(CONTRATO, lista)
  it('só despesas soltas, sem motor nem contrato, ordenadas por pontuação', () => {
    expect(r.map(c => c.schedule.id)).toEqual(['a', 'b', 'c'])
  })
  it('motivos e papel', () => {
    expect(r[0].motivos).toEqual(['favorecido igual', 'descrição com "aluguel"', 'recorrente', 'valor próximo (±20%)', 'vencimento em dia próximo'])
    expect(r[0].papel).toBe('aluguel')
    expect(r[1].papel).toBe('condominio')
    expect(r[1].motivos[0]).toBe('favorecido do condomínio igual')
    expect(r[2].motivos).toEqual(['descrição com "aluguel"', 'recorrente'])
  })
})

describe('planoVinculo (D2)', () => {
  it('série com pagos vira parcelada até os consumidos e não tem mais pendentes', () => {
    const s = ag({ id: 'a', registered: ['2026-01-10', '2026-02-10'], skipped: ['2026-03-10'], nextOccurrence: '2026-04-10' })
    const p = planoVinculo(s, 'aluguel', 'c1')
    expect(p.changes).toEqual({ contratoId: 'c1', contratoPapel: 'aluguel', occurrenceType: 'installment', installments: 3 })
    expect(p.cobertas).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(computeOccurrences({ ...s, ...p.changes }, 5)).toEqual([])
  })
  it('série sem nada consumido vira a parcela única da próxima ocorrência', () => {
    const s = ag({ id: 'b', amount: 1250, startDate: '2026-11-08' })
    const p = planoVinculo(s, 'condominio', 'c1')
    expect(p.changes).toMatchObject({ frequency: 'once', startDate: '2026-11-08', contratoPapel: 'condominio' })
    expect(p.changes.composicao).toMatchObject({ total: 1250, manual: true })
    expect(p.cobertas).toEqual(['2026-11'])
  })
  it('única: só ganha o contrato', () => {
    const p = planoVinculo(ag({ frequency: 'once', startDate: '2026-10-10' }), 'aluguel', 'c1')
    expect(p.changes).toEqual({ contratoId: 'c1', contratoPapel: 'aluguel' })
    expect(p.cobertas).toEqual(['2026-10'])
  })
})
