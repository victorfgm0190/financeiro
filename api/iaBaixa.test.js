import { describe, it, expect } from 'vitest'
import { filtrarCandidatos, casaNome, ehPedidoDeExclusao, valorDitoAproximado, agendamentoDaLinha } from './_iaBaixa.js'
import { validarParametros, normalizarTermo } from './_ia.js'

const HOJE = '2026-10-29'
const ag = (o) => ({
  id: 'a1', description: 'Mensalidade', transactionType: 'income', accountId: 'itau', amount: 210, payee: 'Carlos Souza',
  frequency: 'monthly', startDate: '2026-08-25', occurrenceType: 'installment', installments: 10,
  registered: ['2026-08-25', '2026-09-25'], skipped: [], overrides: {}, nextOccurrence: '2026-10-25', ...o,
})

// Caso real (neondb, 29/10/2026): três "Carlos" vencendo em 30/10 + "TV PAPAI" (favorecido Carlos) em 20/11.
const linha = (o) => agendamentoDaLinha({
  transaction_type: 'income', account_id: 'itau', frequency: 'monthly', start_date: '2026-05-20',
  next_occurrence: new Date('2026-10-30T03:00:00.000Z'), occurrence_type: 'continuous', installments: null,
  registered: [], skipped: [], overrides: {}, ...o,
})
const CASO_REAL = [
  linha({ id: 'aluguel', description: 'CARLOS ROBERTO MOREIRA - ALUGUEL', payee: 'CARLOS ROBERTO MOREIRA', amount: '2000' }),
  linha({ id: 'unimed', description: 'UNIMED - CARLOS ROBERTO MOREIRA', payee: 'CARLOS ROBERTO MOREIRA - UNIMED', amount: '1800', transaction_type: 'expense' }),
  linha({ id: 'horarios', description: 'HORARIOS SR CARLOS - 26(ir anual parcelado) + 63(carne leao)', payee: 'CARLOS FERREIRA ANDRADE - LUCAS SOUZA', amount: '250', start_date: '2026-05-31' }),
  linha({ id: 'tv', description: 'TV PAPAI', payee: 'CARLOS ROBERTO MOREIRA', amount: '150', transaction_type: 'expense', occurrence_type: 'installment', installments: 8, start_date: '2026-06-20', next_occurrence: new Date('2026-11-20T03:00:00.000Z') }),
]

describe('baixa — caso real "Baixar o agendamento do Carlos no valor próximo de R$200"', () => {
  it('lista os três de 30/10, HORARIOS SR CARLOS (R$ 250) primeiro; TV PAPAI (20/11) fica fora da janela', () => {
    const r = filtrarCandidatos(CASO_REAL, { favorecido: 'Carlos', valor_informado: 200, valor_exato: false, tipo: null }, HOJE)
    expect(r.map(c => c.schedule_id)).toEqual(['horarios', 'unimed', 'aluguel'])
    expect(r[0]).toMatchObject({ valor: 250, data: '2026-10-30', tipo: 'receita', atrasado: false })
  })
  it('"me pagou" prioriza receita sem excluir a despesa', () => {
    const r = filtrarCandidatos(CASO_REAL, { favorecido: 'Carlos', valor_informado: 1900, tipo: 'receita' }, HOJE)
    expect(r.map(c => c.schedule_id)).toEqual(['aluguel', 'horarios', 'unimed'])
  })
  it('valor exato filtra ("de 250")', () => {
    const r = filtrarCandidatos(CASO_REAL, { favorecido: 'Carlos', valor_informado: 250, valor_exato: true }, HOJE)
    expect(r.map(c => c.schedule_id)).toEqual(['horarios'])
  })
  it('a frase do pedido é aproximada', () => {
    expect(valorDitoAproximado('Baixar o agendamento do Carlos no valor próximo de R$200')).toBe(true)
    expect(valorDitoAproximado('o Carlos me pagou uns 200, 220 no Pix')).toBe(true)
    expect(valorDitoAproximado('dá baixa no Carlos de 250')).toBe(false)
  })
})

describe('filtrarCandidatos', () => {
  it('nome por palavra contida no favorecido OU na descrição, sem acento/maiúsculas', () => {
    expect(casaNome('Carlos', 'CARLOS FERREIRA ANDRADE - LUCAS SOUZA', '')).toBe(true)
    expect(casaNome('carlos', '', 'HORARIOS SR CARLOS')).toBe(true)
    expect(casaNome('José Antônio', 'JOSE ANTONIO LTDA', '')).toBe(true)
    expect(casaNome('Marina', 'Carlos Souza', 'Mensalidade')).toBe(false)
    expect(filtrarCandidatos([ag()], { favorecido: 'Marina' }, HOJE)).toHaveLength(0)
  })
  it('valor aproximado (ou faixa) nunca exclui', () => {
    expect(filtrarCandidatos([ag({ amount: 400 })], { favorecido: 'Carlos', valor_min: 200, valor_max: 220 }, HOJE)).toHaveLength(1)
  })
  it('janela −30/+15 dias, atrasados inclusive', () => {
    const atrasado = filtrarCandidatos([ag({ nextOccurrence: '2026-10-10', registered: [], startDate: '2026-10-10' })], { favorecido: 'Carlos' }, HOJE)
    expect(atrasado[0]).toMatchObject({ atrasado: true, data: '2026-10-10' })
    expect(filtrarCandidatos([ag({ nextOccurrence: '2026-11-20', registered: [], startDate: '2026-11-20' })], { favorecido: 'Carlos' }, HOJE)).toHaveLength(0)
    expect(filtrarCandidatos([ag({ nextOccurrence: '2026-09-20', registered: [], startDate: '2026-09-20' })], { favorecido: 'Carlos' }, HOJE)).toHaveLength(0)
  })
  it('usa o valor efetivo da ocorrência (override); máximo 5, o mais próximo primeiro', () => {
    const lista = Array.from({ length: 7 }, (_, i) => ag({ id: `a${i}`, amount: 300 + i * 10 }))
    lista.push(ag({ id: 'ov', amount: 900, overrides: { '2026-10-25': { amount: 211 } } }))
    const r = filtrarCandidatos(lista, { favorecido: 'Carlos', valor_informado: 211 }, HOJE)
    expect(r).toHaveLength(5)
    expect(r[0]).toMatchObject({ schedule_id: 'ov', valor: 211 })
  })
  it('transferência e agendamento encerrado ficam fora', () => {
    expect(filtrarCandidatos([ag({ transactionType: 'transfer' })], {}, HOJE)).toHaveLength(0)
    expect(filtrarCandidatos([ag({ installments: 2 })], {}, HOJE)).toHaveLength(0)
  })
})

describe('exclusão e estorno', () => {
  it('exclusão é recusada; estorno NÃO é exclusão', () => {
    expect(ehPedidoDeExclusao('exclui o lançamento do posto')).toBe(true)
    expect(ehPedidoDeExclusao('Apague o agendamento do aluguel')).toBe(true)
    expect(ehPedidoDeExclusao('estorna o lançamento do posto')).toBe(false)
    expect(ehPedidoDeExclusao('gastei 600 de combustível')).toBe(false)
  })
})

describe('validarParametros baixar_agendamento', () => {
  const ctx = { idx: { contas: new Map([['itau', {}]]), categorias: new Map(), favorecidos: new Map([[normalizarTermo('Carlos'), 'Carlos']]), centros: new Map() }, apelidos: [] }
  it('faixa invertida vira min/max e nunca é exata; conta inválida some; data padrão hoje', () => {
    expect(validarParametros('baixar_agendamento', { favorecido: 'Carlos', valor_min: 220, valor_max: 200, valor_informado: 210, valor_exato: true, tipo: 'receita', conta_id: 'zzz' }, ctx, HOJE))
      .toEqual({ favorecido: 'Carlos', descricao: null, valor_informado: 210, valor_min: 200, valor_max: 220, valor_exato: false, tipo: 'receita', data_pagamento: HOJE, conta_id: null })
  })
})
