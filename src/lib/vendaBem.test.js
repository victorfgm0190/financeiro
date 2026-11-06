import { describe, it, expect } from 'vitest'
import { saldoContabilDoBem, resultadoDaVenda } from './vendaBem.js'
import { valorPatrimonial, totaisPatrimonio, categorizarPatrimonio } from './patrimonio.js'
import { rowToAccount } from './db.js'

describe('venda: contas', () => {
  it('saldo contábil: o saldo; sem saldo, o valor digitado pelo método do bem', () => {
    expect(saldoContabilDoBem({ balance: 500 })).toBe(500)
    expect(saldoContabilDoBem({ balance: 0, patrimonio_use_method: 'nota_fiscal', valor_nota_fiscal: 30000 })).toBe(30000)
    expect(saldoContabilDoBem({ balance: 0, patrimonio_use_method: 'valor_pago', valor_pago_manual: 20000, valor_nota_fiscal: 30000 })).toBe(20000)
    expect(saldoContabilDoBem({ balance: 0, patrimonio_use_method: 'valor_pago', valor_nota_fiscal: 30000 })).toBe(0)
  })
  it('resultado = recebido − custos − saldo contábil − quitação', () => {
    expect(resultadoDaVenda({ valor: 58000, saldoContabil: 50000 })).toBe(8000)
    expect(resultadoDaVenda({ valor: 49000, custos: 500, saldoContabil: 50000 })).toBe(-1500)
    expect(resultadoDaVenda({ valor: 90000, saldoContabil: 50000, quitacao: 20000 })).toBe(20000)
    expect(resultadoDaVenda({ valor: 100.1, custos: 0.1, saldoContabil: 100 })).toBe(0)
  })
})

describe('bem vendido no patrimônio', () => {
  const vendido = { id: 'v', type: 'asset', balance: 0, tipoBem: 'bem_imobilizado', patrimonioUseMethod: 'nota_fiscal', valorNotaFiscal: 90000, foiVendido: true }
  const ativo = { id: 'a', type: 'asset', balance: 100, patrimonioUseMethod: 'nota_fiscal', valorNotaFiscal: 500 }
  it('sai dos totais mesmo com nota fiscal preenchida, mas continua nas categorias para o filtro', () => {
    expect(valorPatrimonial(vendido)).toBe(0)
    const cat = categorizarPatrimonio([vendido, ativo], [])
    expect(cat.bens).toHaveLength(2)
    const t = totaisPatrimonio(cat, () => 0)
    expect(t.bens).toBe(500)
    expect(t.itens.bens.map(i => i.conta.id)).toEqual(['a'])
  })
  it('a conta do banco diz que foi vendida', () => {
    expect(rowToAccount({ id: 'x', foi_vendido: true, data_venda: '2026-10-15T03:00:00.000Z' })).toMatchObject({ foiVendido: true, dataVenda: '2026-10-15' })
    expect(rowToAccount({ id: 'y' })).toMatchObject({ foiVendido: false, dataVenda: null })
  })
})
