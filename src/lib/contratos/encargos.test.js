// Encargos e descontos recorrentes na parcela principal (aluguel): entram enquanto ativos, saem
// sozinhos depois da última, não sofrem reajuste; contrato sem eles não muda; Despesa real.
import { describe, it, expect } from 'vitest'
import { gerarPlanoParcelas } from './parcelas.js'
import { itensEncargos, inicioPelaParcelaAtual, posicaoDoEncargo } from './encargos.js'
import { partesDaComposicao } from './despesaReal.js'

const BASE = {
  id: 'c1', tipo: 'pagar', modalidade: 'aluguel', status: 'ativo', data_inicio: '2026-01-10', data_fim: '2029-12-10',
  valor_base: 3900, periodicidade: 'mensal', dia_vencimento: 10, indice_reajuste: 'NENHUM', bonificacao_valor: 0, bonificacao_meses: 0,
  tem_condominio: false, meses_sem_cobranca: [], excluidas: [],
}
const enc = (o) => ({ id: o.descricao, sinal: 'encargo', ativo: true, parcela_inicio: 1, ...o })
const plano = (c) => gerarPlanoParcelas(c, { hoje: '2026-01-01' }).filter(p => p.papel === 'aluguel')
const porNumero = (c) => new Map(plano(c).map(p => [p.numero, p]))

describe('encargos na parcela', () => {
  it('parcela 1 sem bonificação: 3.900 + 555 + 120 = 4.575 (composição com "x/n")', () => {
    const c = { ...BASE, encargos: [enc({ descricao: 'Taxa de contrato', valor: 555, parcelas_total: 1 }), enc({ descricao: 'Vistoria', valor: 120, parcelas_total: 1 })] }
    const p1 = porNumero(c).get(1)
    expect(p1.valor).toBe(4575)
    expect(p1.composicao.itens.map(i => [i.tipo, i.desc, i.valor])).toEqual([
      ['base', expect.any(String), 3900], ['encargo', 'Taxa de contrato 1/1', 555], ['encargo', 'Vistoria 1/1', 120],
    ])
    expect(porNumero(c).get(2).valor).toBe(3900)
  })

  it('item 4 de 4 sai na parcela seguinte; 36 de 36 também', () => {
    const c = { ...BASE, encargos: [enc({ descricao: 'Taxa', valor: 43.08, parcelas_total: 4 }), enc({ descricao: 'Seguro incêndio', valor: 49.06, parcelas_total: 36 })] }
    const m = porNumero(c)
    expect(m.get(4).composicao.itens.map(i => i.desc)).toContain('Taxa 4/4')
    expect(m.get(5).composicao.itens.map(i => i.desc)).not.toContain('Taxa 5/4')
    expect(m.get(5).composicao.itens.some(i => i.desc.startsWith('Taxa'))).toBe(false)
    expect(m.get(36).composicao.itens.map(i => i.desc)).toContain('Seguro incêndio 36/36')
    expect(m.get(37).composicao.itens.some(i => i.desc.startsWith('Seguro'))).toBe(false)
    expect(m.get(37).valor).toBe(3900)
  })

  it('desconto recorrente subtrai; bonificação continua como antes', () => {
    const c = { ...BASE, bonificacao_valor: 200, bonificacao_meses: 12, encargos: [enc({ descricao: 'Desconto combinado', sinal: 'desconto', valor: 100, parcelas_total: 3 })] }
    expect(porNumero(c).get(1).valor).toBe(3600)
    expect(porNumero(c).get(4).valor).toBe(3700)
  })

  it('reajuste só no valor contratual: o encargo não muda', () => {
    const c = { ...BASE, indice_reajuste: 'FIXO', percentual_fixo: 10, mes_base_reajuste: 1, encargos: [enc({ descricao: 'Seguro', valor: 49.06, parcelas_total: 36 })] }
    const m = porNumero(c)
    const seguro = (n) => m.get(n).composicao.itens.find(i => i.tipo === 'encargo').valor
    expect(m.get(13).composicao.base).toBeGreaterThan(3900)
    expect(seguro(1)).toBe(49.06)
    expect(seguro(13)).toBe(49.06)
    expect(m.get(13).valor).toBe(Math.round((m.get(13).composicao.base + 49.06) * 100) / 100)
  })

  it('contrato já em andamento: "na parcela 4 do contrato o seguro está na 3 de 36"', () => {
    const inicio = inicioPelaParcelaAtual(4, 3)
    expect(inicio).toBe(2)
    const e = enc({ descricao: 'Seguro', valor: 49.06, parcelas_total: 36, parcela_inicio: inicio })
    expect(posicaoDoEncargo(e, 4)).toBe(3)
    expect(itensEncargos({ encargos: [e] }, 4)[0].desc).toBe('Seguro 3/36')
    // Começou antes da 1ª parcela registrada: início negativo, posição certa.
    const antigo = enc({ descricao: 'Seguro', valor: 49.06, parcelas_total: 36, parcela_inicio: inicioPelaParcelaAtual(4, 10) })
    expect(antigo.parcela_inicio).toBe(-5)
    expect(itensEncargos({ encargos: [antigo] }, 4)[0].desc).toBe('Seguro 10/36')
  })

  it('regressão: contrato sem encargos gera exatamente as mesmas parcelas', () => {
    const sem = plano(BASE)
    expect(plano({ ...BASE, encargos: [] })).toEqual(sem)
    expect(plano({ ...BASE, encargos: [enc({ descricao: 'Inativo', valor: 10, parcelas_total: 99, ativo: false })] })).toEqual(sem)
  })

  it('Despesa real: base, bonificação, encargos e descontos na categoria do contrato; créditos à parte; soma = pago', () => {
    const tx = {
      id: 'tx', contratoId: 'c1', amount: 3278.44, categoryId: 'cat_aluguel',
      composicao: { tipo: 'aluguel', informada: true, itens: [
        { tipo: 'base', desc: 'Aluguel', valor: 3900 }, { tipo: 'bonificacao', desc: 'Bonificação', valor: -200 },
        { tipo: 'encargo', desc: 'Seguro 3/36', valor: 49.06 }, { tipo: 'unico', desc: 'Seguro 2/36 (retroativo)', valor: 49.06 },
        { tipo: 'unico', desc: 'Taxa', valor: 43.80 }, { tipo: 'encargo', desc: 'Taxa 2', valor: 43.08 },
        { tipo: 'credito', desc: 'Fundo de reserva', valor: -79.14, credito_id: 'k' }, { tipo: 'unico', desc: 'Desconto', valor: -527.42 },
      ] },
    }
    const [real, cred] = partesDaComposicao(tx)
    expect(real.amount).toBe(3357.58)
    expect(real.categoryId).toBe('cat_aluguel')
    expect(cred.amount).toBe(-79.14)
    expect(Math.round((real.amount + cred.amount) * 100) / 100).toBe(3278.44)
  })
})
