import { describe, it, expect } from 'vitest'
import {
  planejarCorrecoesCompetencia, acoesDoPlano, linhasHistoricoRevisao, faturaCorretaDoGasto, acharEquivalente,
} from './revisaoCompetencia'
import { executarRegras, REGRAS_COMPETENCIA } from './integridade/regras'
import { formatarValorHistorico, rotuloCampo } from './historico'

// Cenário do bug de 15/10/2026 (fatura 10/2024 gravada em compras de set–out/2026), em miniatura.
const card = { id: 'card', name: 'ITAU AZUL', apelido: 'ITAUAZUL', type: 'credit', closingDay: 14, dueDay: 20 }
const ger = { id: 'ger', name: 'Ger. ITAUAZUL', type: 'gerencial', grupoGerencial: 'g1' }
const itau = { id: 'itau', name: 'Itau', type: 'checking' }
const accounts = [card, ger, itau]
const gerencialGroups = [{ id: 'g1', number: 1, name: 'Gerencial' }]

const gasto = (id, extra) => ({ id, type: 'expense', accountId: 'card', accountType: 'credit', origin: 'importacao_fatura', ...extra })
const etapa = (gastoId, extra) => ({
  id: `tx_gerA_${gastoId}`, type: 'transfer', accountId: 'itau', toAccountId: 'ger', origin: 'etapa_a',
  sourceExpenseId: gastoId, grupoGerencial: 'g1', ...extra,
})

const transactions = [
  // Certos (fatura 10/2026)
  gasto('apple_ok', { description: 'Apple.com/bill', amount: 19.9, date: '2026-10-07', dateCartao: '2026-10-07', faturaMonthYear: '2026-10', grupoGerencial: 'g1', createdAt: '2026-10-09' }),
  etapa('apple_ok', { description: 'Reserva Gerencial - Apple.com/bill', amount: 19.9, date: '2026-10-07', faturaRef: '10/2026' }),
  gasto('parc_ok', { description: 'Shopee *Guardanapo 8/10', amount: 54.93, date: '2026-09-15', dateCartao: '2026-03-08', installmentNum: 8, installmentTotal: 10, faturaMonthYear: '2026-10' }),
  // Mesmo Apple em outro mês (recorrente): não é equivalente — data diferente.
  gasto('apple_set', { description: 'Apple.com/bill', amount: 19.9, date: '2026-09-07', dateCartao: '2026-09-07', faturaMonthYear: '2026-09' }),
  // Duplicatas na 10/2024
  gasto('apple_dup', { description: 'Apple.com/bill', amount: 19.9, date: '2026-10-07', dateCartao: '2026-10-07', faturaMonthYear: '2024-10', grupoGerencial: 'g1', createdAt: '2026-10-15' }),
  etapa('apple_dup', { description: 'Reserva Gerencial - Apple.com/bill', amount: 19.9, date: '2026-10-07', faturaRef: '10/2024' }),
  gasto('parc_dup', { description: 'Shopee *Guardanapo 8/10', amount: 54.93, date: '2024-09-15', dateCartao: '2026-03-08', installmentNum: 8, installmentTotal: 10, faturaMonthYear: '2024-10' }),
  // Sem equivalente → mover para a fatura da compra (setembro/2026, fechamento 14 → 10/2026)
  gasto('google_sozinho', { description: 'Google G1sk003m', amount: 49.99, date: '2026-09-18', dateCartao: '2026-09-18', faturaMonthYear: '2024-10' }),
  // Gasto legítimo cuja reserva tem rótulo de fatura errado → excluir só a reserva
  gasto('legit', { description: 'Padaria', amount: 30, date: '2026-09-20', dateCartao: '2026-09-20', faturaMonthYear: '2026-10', grupoGerencial: 'g1' }),
  etapa('legit', { description: 'Reserva Gerencial - Padaria', amount: 30, date: '2026-09-20', faturaRef: '08/2026' }),
]

const divergencias = executarRegras({ transactions, accounts, schedules: [], gerencialGroups }, { desde: null, regras: REGRAS_COMPETENCIA })
  .filter(d => d.conta_id === 'card' || d.conta_id === 'ger')
const { itens, resumo } = planejarCorrecoesCompetencia({ divergencias, transactions, card })
const porOrigem = (id) => itens.find(i => i.origemId === id)

describe('planejarCorrecoesCompetencia', () => {
  it('gasto implausível com o mesmo gasto na fatura certa → excluir duplicata (e a etapa A dele)', () => {
    const it1 = porOrigem('apple_dup')
    expect(it1.tipo).toBe('excluir_duplicata')
    expect(it1.equivalente).toEqual({ id: 'apple_ok', fatura: '2026-10' })
    expect(it1.excluir).toEqual(['apple_dup', 'tx_gerA_apple_dup'])
  })

  it('parcela: casa pela data ORIGINAL da compra e pelo nº da parcela', () => {
    expect(porOrigem('parc_dup')).toMatchObject({ tipo: 'excluir_duplicata', equivalente: { id: 'parc_ok', fatura: '2026-10' } })
  })

  it('sem equivalente → mover para a fatura calculada pela data da compra', () => {
    expect(porOrigem('google_sozinho')).toMatchObject({ tipo: 'mover', mover: { id: 'google_sozinho', de: '2024-10', para: '2026-10' }, aviso: null })
  })

  it('reserva do gasto duplicado fica coberta; reserva de gasto legítimo → excluir só a reserva', () => {
    expect(porOrigem('tx_gerA_apple_dup')).toMatchObject({ tipo: 'coberta', excluir: [] })
    const r = porOrigem('tx_gerA_legit')
    expect(r).toMatchObject({ tipo: 'excluir_reserva', excluir: ['tx_gerA_legit'], gastoId: 'legit' })
    // nunca apaga o gasto de origem
    expect(itens.flatMap(i => i.excluir)).not.toContain('legit')
  })

  it('nada do que está certo é tocado', () => {
    const tocados = new Set([...itens.flatMap(i => i.excluir), ...itens.filter(i => i.mover).map(i => i.mover.id)])
    for (const id of ['apple_ok', 'tx_gerA_apple_ok', 'parc_ok', 'apple_set', 'legit']) expect(tocados.has(id)).toBe(false)
  })

  it('resumo e ações: exclusões primárias sem repetir; etapa A sai na cascata do gasto', () => {
    expect(resumo).toMatchObject({ qtdGastosExcluidos: 2, totalGastosExcluidos: 74.83, qtdReservasExcluidas: 2, totalReservasExcluidas: 49.9, totalMovido: 49.99 })
    const a = acoesDoPlano(itens)
    expect(a.excluir.sort()).toEqual(['apple_dup', 'parc_dup', 'tx_gerA_legit'])
    expect(a.mover).toEqual([{ id: 'google_sozinho', de: '2024-10', para: '2026-10' }])
  })

  it('dois suspeitos iguais não casam com o mesmo equivalente', () => {
    const tx2 = [...transactions, gasto('apple_dup2', { description: 'Apple.com/bill', amount: 19.9, date: '2026-10-07', dateCartao: '2026-10-07', faturaMonthYear: '2024-11' })]
    const usados = new Set()
    const e1 = acharEquivalente(tx2.find(t => t.id === 'apple_dup'), card, tx2, usados); usados.add(e1.id)
    const e2 = acharEquivalente(tx2.find(t => t.id === 'apple_dup2'), card, tx2, usados)
    expect(e1.id).toBe('apple_ok')
    expect(e2).toBeNull()
  })
})

describe('faturaCorretaDoGasto', () => {
  it('à vista: fatura do dia da compra (fechamento 14)', () => {
    expect(faturaCorretaDoGasto({ dateCartao: '2026-10-14' }, card)).toEqual({ fatura: '2026-10', conferir: false })
    expect(faturaCorretaDoGasto({ dateCartao: '2026-10-15' }, card)).toEqual({ fatura: '2026-11', conferir: false })
  })
  it('parcela N: N−1 faturas depois da compra, marcada para conferir', () => {
    expect(faturaCorretaDoGasto({ dateCartao: '2026-03-08', installmentNum: 8 }, card)).toEqual({ fatura: '2026-10', conferir: true })
  })
})

describe('linhasHistoricoRevisao', () => {
  const txById = new Map(transactions.map(t => [t.id, t]))
  const linhas = linhasHistoricoRevisao(itens, txById, { loteId: 'L' })

  it('1 linha por lançamento excluído (gasto + etapa A) e 1 por mudança de fatura, todas com origem', () => {
    expect(linhas.map(l => [l.entidade_id, l.campo]).sort()).toEqual([
      ['apple_dup', 'exclusao'], ['google_sozinho', 'faturaMonthYear'], ['parc_dup', 'exclusao'],
      ['tx_gerA_apple_dup', 'exclusao'], ['tx_gerA_legit', 'exclusao'],
    ])
    for (const l of linhas) expect(l).toMatchObject({ entidade: 'lancamento', lote_id: 'L', escopo: 'parcela', origem: 'revisao_automatica' })
  })

  it('a exclusão guarda a foto do lançamento; a mudança de fatura guarda de/para', () => {
    const ex = linhas.find(l => l.entidade_id === 'apple_dup')
    expect(ex.valor_anterior).toMatchObject({ id: 'apple_dup', amount: 19.9, faturaMonthYear: '2024-10' })
    expect(ex.valor_novo).toBeNull()
    expect(ex.motivo).toMatch(/duplicata de apple_ok \(fatura 10\/2026\)/)
    expect(linhas.find(l => l.campo === 'faturaMonthYear')).toMatchObject({ valor_anterior: '2024-10', valor_novo: '2026-10' })
  })

  it('o histórico exibe os campos novos de forma legível', () => {
    expect(rotuloCampo('exclusao')).toBe('Lançamento excluído')
    expect(formatarValorHistorico('faturaMonthYear', '2024-10')).toBe('10/2024')
    expect(formatarValorHistorico('exclusao', { description: 'Apple', amount: 19.9, date: '2026-10-07', faturaMonthYear: '2024-10' }))
      .toMatch(/^Apple · R\$\s?19,90 · 07\/10\/2026 · fatura 10\/2024$/)
  })
})
