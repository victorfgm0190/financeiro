import { describe, it, expect } from 'vitest'
import { filtrarCandidatos, semelhanca, ehPedidoDeExclusao, agendamentoDaLinha } from './_iaBaixa.js'
import { validarParametros, FERRAMENTAS, INSTRUCOES, normalizarTermo } from './_ia.js'

const HOJE = '2026-10-29'
const ag = (o) => ({
  id: 'a1', description: 'Mensalidade', transactionType: 'income', accountId: 'itau', amount: 210, payee: 'Carlos Souza',
  frequency: 'monthly', startDate: '2026-08-25', occurrenceType: 'installment', installments: 10,
  registered: ['2026-08-25', '2026-09-25'], skipped: [], overrides: {}, nextOccurrence: '2026-10-25', ...o,
})

describe('filtrarCandidatos', () => {
  it('"o Carlos me pagou uns 200, 220" → a próxima pendente do Carlos', () => {
    const r = filtrarCandidatos([ag()], { favorecido: 'Carlos', valor_min: 200, valor_max: 220, tipo: 'receita' }, HOJE)
    expect(r).toEqual([{ schedule_id: 'a1', ocorrencia: '2026-10-25', data: '2026-10-25', valor: 210, descricao: 'Mensalidade', favorecido: 'Carlos Souza', conta_id: 'itau', tipo: 'receita' }])
  })
  it('folga de 10% no valor', () => {
    expect(filtrarCandidatos([ag({ amount: 240 })], { favorecido: 'Carlos', valor_min: 200, valor_max: 220 }, HOJE)).toHaveLength(1)
    expect(filtrarCandidatos([ag({ amount: 250 })], { favorecido: 'Carlos', valor_min: 200, valor_max: 220 }, HOJE)).toHaveLength(0)
  })
  it('janela de vencimento −30/+15 dias', () => {
    expect(filtrarCandidatos([ag({ nextOccurrence: '2026-11-20', registered: [] , startDate: '2026-11-20' })], { favorecido: 'Carlos' }, HOJE)).toHaveLength(0)
    expect(filtrarCandidatos([ag({ nextOccurrence: '2026-09-20', registered: [], startDate: '2026-09-20' })], { favorecido: 'Carlos' }, HOJE)).toHaveLength(0)
  })
  it('tipo e favorecido filtram; sem acento/maiúsculas', () => {
    expect(filtrarCandidatos([ag()], { favorecido: 'carlos', tipo: 'despesa' }, HOJE)).toHaveLength(0)
    expect(filtrarCandidatos([ag({ payee: 'José Antônio' })], { favorecido: 'jose antonio' }, HOJE)).toHaveLength(1)
    expect(filtrarCandidatos([ag()], { favorecido: 'Marina' }, HOJE)).toHaveLength(0)
  })
  it('usa o valor efetivo da ocorrência (override) e ordena pelo mais próximo; máximo 5', () => {
    const lista = Array.from({ length: 7 }, (_, i) => ag({ id: `a${i}`, amount: 200 + i * 3 }))
    lista.push(ag({ id: 'ov', amount: 500, overrides: { '2026-10-25': { amount: 211 } } }))
    const r = filtrarCandidatos(lista, { favorecido: 'Carlos', valor_informado: 211 }, HOJE)
    expect(r).toHaveLength(5)
    expect(r[0].schedule_id).toBe('ov')
    expect(r[0].valor).toBe(211)
  })
  it('transferência e agendamento encerrado ficam fora', () => {
    expect(filtrarCandidatos([ag({ transactionType: 'transfer' })], {}, HOJE)).toHaveLength(0)
    expect(filtrarCandidatos([ag({ installments: 2 })], {}, HOJE)).toHaveLength(0)
  })
})

describe('semelhanca / linha do banco', () => {
  it('contém e palavras em comum', () => {
    expect(semelhanca('Carlos', 'Carlos Souza')).toBe(1)
    expect(semelhanca('Paulo Ferro', 'Ferro Paulo Ltda')).toBeGreaterThanOrEqual(0.8)
    expect(semelhanca('Carlos', 'Marina')).toBeLessThan(0.5)
  })
  it('agendamentoDaLinha mapeia os campos do motor', () => {
    const s = agendamentoDaLinha({ id: 'x', transaction_type: 'expense', amount: '10.5', start_date: '2026-10-01', next_occurrence: null, registered: null, overrides: null })
    expect(s).toMatchObject({ transactionType: 'expense', amount: 10.5, startDate: '2026-10-01', nextOccurrence: null, registered: [], overrides: {} })
  })
})

describe('exclusão', () => {
  it('pedido de exclusão é reconhecido', () => {
    expect(ehPedidoDeExclusao('exclui o lançamento de 100 de combustível')).toBe(true)
    expect(ehPedidoDeExclusao('Apague o agendamento do aluguel')).toBe(true)
    expect(ehPedidoDeExclusao('gastei 600 de combustível')).toBe(false)
    expect(ehPedidoDeExclusao('o Carlos me pagou 220, dá baixa')).toBe(false)
  })
  it('nenhuma ferramenta exclui e o prompt proíbe', () => {
    expect(FERRAMENTAS.map(f => f.name)).toEqual(['registrar_lancamento', 'criar_agendamento', 'baixar_agendamento', 'consultar_saldo', 'perguntar'])
    expect(INSTRUCOES).toMatch(/NUNCA exclui/)
  })
})

describe('validarParametros baixar_agendamento', () => {
  const ctx = { idx: { contas: new Map([['itau', {}]]), categorias: new Map(), favorecidos: new Map([[normalizarTermo('Carlos'), 'Carlos']]), centros: new Map() }, apelidos: [] }
  it('faixa invertida, conta inválida, data padrão hoje', () => {
    expect(validarParametros('baixar_agendamento', { favorecido: 'Carlos', valor_min: 220, valor_max: 200, tipo: 'receita', conta_id: 'zzz' }, ctx, HOJE))
      .toEqual({ favorecido: 'Carlos', descricao: null, valor_informado: null, valor_min: 200, valor_max: 220, tipo: 'receita', data_pagamento: HOJE, conta_id: null })
  })
})
