import { describe, it, expect } from 'vitest'
import { novaTaxaForm, formParaTaxa, taxaParaForm, erroTaxa, resumoTaxa, chaveTaxas } from './taxasRepasseForm'

// Taxa única com o campo de parcelas opcional (dados fictícios).
const base = { ...novaTaxaForm('taxa_unica', '2026-02'), descricao: 'Intermediação', valor: '2.200,00' }

describe('taxa única: parcelas opcionais', () => {
  it('vazio = 1 parcela com o total na competência da 1ª parcela', () => {
    expect(erroTaxa(base)).toBe('')
    expect(formParaTaxa(base).valores_parcelas).toEqual([2200])
    expect(resumoTaxa(base)).toBe('Intermediação · R$ 2.200,00 em 1 parcela em 02/2026 · dedutível IR')
  })

  it('volta do banco vazia quando é uma parcela igual ao total (aditivo não vê mudança)', () => {
    const t = formParaTaxa(base)
    const f = taxaParaForm(t)
    expect(f.parcelas).toBe('')
    expect(chaveTaxas([formParaTaxa(f)])).toBe(chaveTaxas([t]))
    expect(taxaParaForm({ ...t, valores_parcelas: [470, 865, 865] }).parcelas).toBe('470,00; 865,00; 865,00')
  })

  it('texto inválido continua barrando', () => {
    expect(erroTaxa({ ...base, parcelas: '470; abc' })).toMatch(/valor de parcela inválido/)
  })
})
