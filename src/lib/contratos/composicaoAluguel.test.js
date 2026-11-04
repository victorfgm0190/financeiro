// Recibo do aluguel: reconhecimento dos itens pelo esperado da parcela, sugestão de crédito, leitura
// (débito = +, crédito = −, sem total/"PAGAMENTO EFETUADO") e validação.
import { describe, it, expect } from 'vitest'
import { classificarRecibo, composicaoDoRecibo, validarRecibo, normalizarLeituraRecibo, esperadoDaComposicao } from './composicaoAluguel.js'
import { normalizarSaidaRecibo } from '../../../api/_leituraBoleto.js'

const ESPERADO = esperadoDaComposicao({ itens: [
  { tipo: 'base', desc: 'Aluguel contratual', valor: 3900 }, { tipo: 'bonificacao', desc: 'Bonificação', valor: -200 },
  { tipo: 'encargo', desc: 'Seguro incêndio 3/36', valor: 49.06, encargo_id: 'e_seg' }, { tipo: 'encargo', desc: 'Taxa de administração 2/12', valor: 43.08, encargo_id: 'e_tx' },
  { tipo: 'credito', desc: 'fundo de reserva cond. 10/09', valor: -79.14, credito_id: 'k_set' },
] })
const CREDITOS = [{ id: 'k_set', contrato_id: 'c1', status: 'aberto', valor: 79.14, descricao: 'fundo de reserva', itens: [{ desc: 'fundo de reserva', valor: 79.14 }] }]
const RECIBO_PAGO = [
  { desc: 'ALUGUEL', valor: 3900 }, { desc: 'BONIFICAÇÃO', valor: -200 },
  { desc: 'SEGURO INCENDIO 3/36', valor: 49.06 }, { desc: 'SEGURO INCENDIO 2/36', valor: 49.06 },
  { desc: 'IPTU 2026 PARCELA 8', valor: 43.80 }, { desc: 'TAXA DE ADMINISTRACAO', valor: 43.08 },
  { desc: 'FUNDO DE RESERVA', valor: -79.14 }, { desc: 'DESCONTO ACORDO', valor: -527.42 },
]

describe('classificarRecibo', () => {
  it('reconhece contratual, bonificação e recorrentes; liga o crédito; item novo vira único — soma 3.278,44', () => {
    const r = classificarRecibo(RECIBO_PAGO, { esperados: ESPERADO, creditos: CREDITOS })
    expect(r.map(i => [i.tipo, i.encargo_id || i.credito_id || null])).toEqual([
      ['base', null], ['bonificacao', null], ['encargo', 'e_seg'], ['unico', null], ['unico', null], ['encargo', 'e_tx'], ['credito', 'k_set'], ['unico', null],
    ])
    expect(r[7].sugestao).toBe('unico')
    const total = Math.round(r.reduce((a, i) => a + i.valor, 0) * 100) / 100
    expect(total).toBe(3278.44)
    expect(validarRecibo(r, 3278.44)).toBeNull()
  })

  it('valor diferente do recorrente: marca "difere" (vale só nesta parcela)', () => {
    const [seg] = classificarRecibo([{ desc: 'Seguro incêndio', valor: 52 }], { esperados: ESPERADO })
    expect(seg).toMatchObject({ tipo: 'encargo', encargo_id: 'e_seg', esperado: 49.06, difere: true })
  })

  it('crédito não é ligado duas vezes; validação recusa o mesmo crédito em dois itens', () => {
    const r = classificarRecibo([{ desc: 'Fundo de reserva', valor: -79.14 }, { desc: 'Fundo de reserva', valor: -79.14 }], { esperados: [], creditos: CREDITOS })
    expect(r.filter(i => i.credito_id === 'k_set')).toHaveLength(1)
    expect(validarRecibo([{ tipo: 'credito', credito_id: 'k', valor: -1 }, { tipo: 'credito', credito_id: 'k', valor: -1 }], -2)).toMatch(/uma vez/)
  })

  it('soma divergente bloqueia', () => {
    expect(validarRecibo([{ tipo: 'base', valor: 3900 }], 3700)).toMatch(/precisa ser igual/)
  })

  it('composicaoDoRecibo: substitui a prevista (informada) e mantém número/total de parcelas', () => {
    const c = composicaoDoRecibo([{ tipo: 'base', desc: 'Aluguel', valor: 3900 }, { tipo: 'credito', desc: 'FR', valor: -79.1, credito_id: 'k' }], { meta: { numero: 3, total_parcelas: 60, base: 3900, ciclo: 0 } })
    expect(c).toMatchObject({ tipo: 'aluguel', informada: true, total: 3820.9, numero: 3, total_parcelas: 60 })
  })
})

describe('leitura do recibo (PDF simulado)', () => {
  const SAIDA_IA = {
    referencia: '10/2026', vencimento: '2026-10-20', data_pagamento: '2026-10-19', valor_pago: 3278.44,
    itens: [
      { descricao: 'ALUGUEL', valor: 3900, natureza: 'debito' }, { descricao: 'BONIFICAÇÃO', valor: 200, natureza: 'credito' },
      { descricao: 'SUBTOTAL', valor: 3700, natureza: 'debito' }, { descricao: 'FUNDO DE RESERVA', valor: 79.14, natureza: 'credito' },
      { descricao: 'TOTAL', valor: 3620.86, natureza: 'debito' }, { descricao: 'PAGAMENTO EFETUADO', valor: 3278.44, natureza: 'credito' },
    ],
  }
  it('servidor: ignora subtotal, total e "PAGAMENTO EFETUADO"; natureza decide o sinal no app', () => {
    const s = normalizarSaidaRecibo(SAIDA_IA)
    expect(s.itens.map(i => i.desc)).toEqual(['ALUGUEL', 'BONIFICAÇÃO', 'FUNDO DE RESERVA'])
    const app = normalizarLeituraRecibo(s)
    expect(app.itens.map(i => i.valor)).toEqual([3900, -200, -79.14])
    expect(app).toMatchObject({ referencia: '10/2026', vencimento: '2026-10-20', data_pagamento: '2026-10-19', valor_pago: 3278.44, total: 3278.44 })
  })
})
