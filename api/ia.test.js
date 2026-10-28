import { describe, it, expect } from 'vitest'
import { validarParametros, normalizarTermo, textoCadastros } from './_ia.js'

const ctx = (() => {
  const contas = [{ id: 'itau', name: 'Itaú', apelido: null, type: 'checking', bank: 'Itaú' }, { id: 'nu', name: 'Nubank', type: 'credit' }]
  const categorias = [
    { id: 'gas', tipo: 'expense', caminho: 'Carro › Gasolina' },
    { id: 'sal', tipo: 'income', caminho: 'Receitas › Salário' },
  ]
  const favorecidos = ['Paulo Ferro', 'Posto Shell']
  const centros = ['Casa']
  return {
    contas, categorias, favorecidos, centros,
    apelidos: [{ tipo: 'categoria', termo: 'combustivel', ref_id: 'gas', usos: 2 }],
    maisUsados: { categorias: ['gas'], contas: ['itau'], favorecidos: [] },
    idx: {
      contas: new Map(contas.map(c => [c.id, c])),
      categorias: new Map(categorias.map(c => [c.id, c])),
      favorecidos: new Map(favorecidos.map(n => [normalizarTermo(n), n])),
      centros: new Map(centros.map(n => [normalizarTermo(n), n])),
    },
  }
})()

const base = { tipo: 'despesa', valor: 100, data: '2026-10-28', conta_id: 'itau', categoria_id: 'gas', descricao: 'Combustível', confianca: { conta: 0.9, categoria: 0.9 }, termos: {} }

describe('validarParametros', () => {
  it('id inexistente vira null com confiança 0', () => {
    const r = validarParametros('registrar_lancamento', { ...base, conta_id: 'xxx', categoria_id: 'yyy' }, ctx, '2026-10-28')
    expect(r.conta_id).toBeNull()
    expect(r.categoria_id).toBeNull()
    expect(r.confianca.conta).toBe(0)
    expect(r.confianca.categoria).toBe(0)
  })
  it('categoria de receita numa despesa é recusada', () => {
    expect(validarParametros('registrar_lancamento', { ...base, categoria_id: 'sal' }, ctx).categoria_id).toBeNull()
  })
  it('apelido vence o palpite quando o termo citado bate', () => {
    const r = validarParametros('registrar_lancamento', { ...base, categoria_id: null, termos: { categoria: 'Combustível' } }, ctx)
    expect(r.categoria_id).toBe('gas')
  })
  it('favorecido por nome (sem diferenciar maiúscula/acento) e favorecido novo', () => {
    expect(validarParametros('registrar_lancamento', { ...base, favorecido_id: 'paulo ferro' }, ctx).favorecido_id).toBe('Paulo Ferro')
    const novo = validarParametros('registrar_lancamento', { ...base, favorecido_id: null, favorecido_novo: 'Maria Lima' }, ctx)
    expect(novo).toMatchObject({ favorecido_id: null, favorecido_novo: 'Maria Lima' })
    expect(validarParametros('registrar_lancamento', { ...base, favorecido_novo: 'POSTO SHELL' }, ctx)).toMatchObject({ favorecido_id: 'Posto Shell', favorecido_novo: null })
  })
  it('data inválida cai em hoje; agendamento com recorrência e parcelas', () => {
    const r = validarParametros('criar_agendamento', { ...base, data: 'amanhã', vencimento: null, recorrencia: 'xx', parcelas: 1 }, ctx, '2026-10-28')
    expect(r).toMatchObject({ data: '2026-10-28', vencimento: '2026-10-28', recorrencia: 'once', parcelas: null })
  })
  it('consultar_saldo só com conta existente', () => {
    expect(validarParametros('consultar_saldo', { conta_id: 'itau' }, ctx)).toEqual({ conta_id: 'itau' })
    expect(validarParametros('consultar_saldo', { conta_id: 'zzz' }, ctx)).toEqual({ conta_id: null })
  })
  it('valor não positivo vira null', () => {
    expect(validarParametros('registrar_lancamento', { ...base, valor: -5 }, ctx).valor).toBeNull()
  })
})

describe('textoCadastros', () => {
  it('lista ids e caminhos, sem data', () => {
    const t = textoCadastros(ctx)
    expect(t).toContain('gas | Carro › Gasolina | expense')
    expect(t).toContain('itau | Itaú')
    expect(t).not.toMatch(/\d{4}-\d{2}-\d{2}/)
  })
})
