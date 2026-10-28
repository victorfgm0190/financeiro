import { describe, it, expect } from 'vitest'
import { initialDaSugestao, camposParaConferir, apelidosAprendidos } from './assistente'

const sugestao = {
  tipo: 'despesa', valor: 600, data: '2026-10-28', conta_id: 'c1', conta_destino_id: null, categoria_id: 'gas',
  centro_custo_id: null, favorecido_id: null, favorecido_novo: null, descricao: 'Combustível',
  confianca: { valor: 1, data: 0.9, conta: 0.4, categoria: 0.95, descricao: 0.9 },
  termos: { categoria: 'combustível', conta: null, favorecido: null },
}

describe('initialDaSugestao', () => {
  it('lançamento → campos do TransactionForm', () => {
    expect(initialDaSugestao('registrar_lancamento', sugestao)).toMatchObject({
      type: 'expense', amount: '600', date: '2026-10-28', accountId: 'c1', categoryId: 'gas', payee: '', description: 'Combustível',
    })
  })
  it('agendamento parcelado → campos do ScheduleForm', () => {
    const r = initialDaSugestao('criar_agendamento', { ...sugestao, vencimento: '2026-11-10', recorrencia: 'monthly', parcelas: 3, favorecido_novo: 'Paulo Ferro' })
    expect(r).toMatchObject({ transactionType: 'expense', startDate: '2026-11-10', frequency: 'monthly', occurrenceType: 'installment', installments: 3, payee: 'Paulo Ferro' })
  })
  it('valor ausente fica vazio', () => {
    expect(initialDaSugestao('registrar_lancamento', { ...sugestao, valor: null }).amount).toBe('')
  })
})

describe('camposParaConferir', () => {
  it('marca vazios e confiança baixa', () => {
    expect(camposParaConferir('registrar_lancamento', sugestao)).toEqual(['accountId'])
    expect(camposParaConferir('registrar_lancamento', { ...sugestao, categoria_id: null, valor: null })).toEqual(['amount', 'accountId', 'categoryId'])
  })
  it('favorecido novo é sempre conferido', () => {
    expect(camposParaConferir('registrar_lancamento', { ...sugestao, favorecido_novo: 'Paulo', confianca: { ...sugestao.confianca, favorecido: 1 } })).toContain('payee')
  })
  it('transferência confere destino, não categoria', () => {
    const r = camposParaConferir('registrar_lancamento', { ...sugestao, tipo: 'transferencia', categoria_id: null })
    expect(r).toContain('toAccountId')
    expect(r).not.toContain('categoryId')
  })
})

describe('apelidosAprendidos', () => {
  it('só campos alterados com termo citado', () => {
    expect(apelidosAprendidos(sugestao, { categoryId: 'gasolina', accountId: 'c2', payee: '' }))
      .toEqual([{ tipo: 'categoria', termo: 'combustível', ref_id: 'gasolina' }])
  })
  it('nada muda → nada a aprender', () => {
    expect(apelidosAprendidos(sugestao, { categoryId: 'gas', accountId: 'c1' })).toEqual([])
  })
  it('favorecido corrigido', () => {
    const s = { ...sugestao, favorecido_novo: 'Paulo Fero', termos: { favorecido: 'Paulo Fero' } }
    expect(apelidosAprendidos(s, { categoryId: 'gas', accountId: 'c1', payee: 'Paulo Ferro' }))
      .toEqual([{ tipo: 'favorecido', termo: 'Paulo Fero', ref_id: 'Paulo Ferro' }])
  })
})
