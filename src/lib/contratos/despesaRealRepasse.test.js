import { describe, it, expect } from 'vitest'
import { lancamentosNoModo, partesDaComposicao, ADMINISTRADORA_ID } from './despesaReal.js'

// Dados fictícios.
const REPASSE = {
  id: 't1', type: 'income', amount: 1977, categoryId: 'cat-aluguel', contratoId: 'c9', date: '2026-07-10',
  composicao: { tipo: 'repasse', competencia: '2026-06', itens: [{ tipo: 'aluguel', valor: 2200 }, { tipo: 'taxa_adm', valor: -220 }, { tipo: 'tarifa', valor: -3 }] },
}

describe('repasse nos relatórios por categoria', () => {
  it('padrão (despesa real ou valor pago): linha única, nunca vira "créditos com o proprietário"', () => {
    expect(partesDaComposicao(REPASSE)).toBeNull()
    expect(lancamentosNoModo([REPASSE], 'real')).toEqual([REPASSE])
    expect(lancamentosNoModo([REPASSE], 'pago')).toEqual([REPASSE])
  })

  it('visão por composição: aluguel bruto como receita, deduções como despesa nas categorias delas', () => {
    const abrir = () => [
      { tipo: 'aluguel', valor: 2200, categoria_id: null }, { tipo: 'taxa_adm', valor: -220, categoria_id: 'cat-adm' },
      { tipo: 'tarifa', valor: -3, categoria_id: null },
    ]
    const r = lancamentosNoModo([REPASSE], 'real', { abrirRepasse: abrir })
    expect(r.map(t => [t.type, t.amount, t.categoryId])).toEqual([
      ['income', 2200, 'cat-aluguel'], ['expense', 220, 'cat-adm'], ['expense', 3, ADMINISTRADORA_ID],
    ])
    expect(r.every(t => t._composicaoDe === 't1')).toBe(true)
  })
})
