import { describe, it, expect } from 'vitest'
import {
  escopoFluxoPrincipal, agendamentoNoFluxoPrincipal, valorNoFluxoPrincipal, perguntaFluxoPrincipal,
  considerarFluxoParaGravar, pendentesNoFluxoPrincipal, seloFluxoPrincipal, DICA_TRANSFERENCIA_FLUXO,
} from './fluxoPrincipal'
import { calcularSaldoPrincipalBreakdown } from './saldoPrincipal'
import { computeFluxoCaixa } from './fluxoCaixa'

// Caso real (29/10/2026): a diarista (DAYANE) é paga pelo NUGI, que não é conta FC; o NUGI é
// abastecido por Pix do Itaú (FC). Ciclo 15/10–14/11/2026.
const PF = 'pf', PJ = 'pj'
const accounts = [
  { id: 'itau', name: 'Itau', type: 'checking', fluxoCaixaPrincipal: true, profileId: PF, initialBalance: 1000, balance: 1000 },
  { id: 'nugi', name: 'NUBANK CC GI', type: 'checking', fluxoCaixaPrincipal: false, profileId: PF, initialBalance: 0, balance: 0 },
  { id: 'itlumen', name: 'ITLUMEN', type: 'checking', fluxoCaixaPrincipal: true, profileId: PJ, initialBalance: 300, balance: 300 },
  { id: 'cartao', name: 'Itaupers', type: 'credit', fluxoCaixaPrincipal: false, profileId: PF },
]
const sched = (id, transactionType, accountId, extra = {}) =>
  ({ id, description: id, transactionType, accountId, amount: 230, occs: ['2026-11-05'], ...extra })
const pix = (marca) => sched('PIX PARA DIARISTA', 'transfer', 'itau', { toAccountId: 'nugi', considerarFluxoPrincipal: marca })
const diarista = (marca) => sched('DIARISTA', 'expense', 'nugi', { considerarFluxoPrincipal: marca, occs: ['2026-11-06'] })

const getNextOccurrences = (s) => s.occs || []
const saldoPrincipal = (schedules, profileId = null) => calcularSaldoPrincipalBreakdown({
  accounts, transactions: [], schedules, envelopes: [],
  settings: { financialMonthMode: 'custom', financialMonthStartDay: 15 }, gerencialGroups: [],
  profileId, getNextOccurrences,
  getFinancialPeriod: () => ({ start: new Date(2026, 9, 15), end: new Date(2026, 10, 14) }),
}, new Date(2026, 9, 29, 12))

// Fluxo de Caixa Futuro, consulta "Contas Principais" (CashFlowPanel): pool = contas FC do perfil.
const fluxoFuturo = (schedules, profileId = null) => {
  const doPerfil = accounts.filter(a => !profileId || a.profileId === profileId)
  const accountIds = new Set(doPerfil.filter(a => a.fluxoCaixaPrincipal && a.type !== 'credit').map(a => a.id))
  const r = computeFluxoCaixa({
    accountIds, currentBalance: 0, start: '2026-10-29', end: '2026-11-14', schedules, getNextOccurrences,
    fluxoPrincipal: escopoFluxoPrincipal(doPerfil, accountIds),
  })
  return Math.round(r.rows.reduce((s, l) => s + l.entrada - l.saida, 0) * 100) / 100
}

// Projeção do Painel (DashboardPanel.saldoProjetado): pendentes de hoje ao fim do ciclo.
const projecaoPainel = (schedules, profileId = null) => {
  const doPerfil = accounts.filter(a => !profileId || a.profileId === profileId)
  const pool = new Set(doPerfil.filter(a => a.fluxoCaixaPrincipal && a.type !== 'credit').map(a => a.id))
  const p = pendentesNoFluxoPrincipal(schedules, escopoFluxoPrincipal(doPerfil, pool), getNextOccurrences, { depoisDe: '2026-10-29', ate: '2026-11-14' })
  return Math.round((p.entradas - p.saidas) * 100) / 100
}

describe('caso diarista: Pix Itaú → NUGI marcado "não" + despesa no NUGI marcada "sim"', () => {
  const modeloNovo = [pix(false), diarista(true)]

  it('dá −230 uma vez só no Projetado, no Fluxo de Caixa Futuro e na Projeção do Painel', () => {
    const b = saldoPrincipal(modeloNovo, PF)
    expect(b.finalCiclo.agendamentosTotal).toBe(-230)
    expect(b.finalCiclo.agendamentos).toEqual([{ description: 'DIARISTA', amount: -230, date: '2026-11-06', occurrenceNumber: 1, totalOccurrences: 1 }])
    expect(b.projetado.total).toBe(1000 - 230)
    expect(saldoPrincipal(modeloNovo).finalCiclo.agendamentosTotal).toBe(-230) // Tudo
    expect(fluxoFuturo(modeloNovo, PF)).toBe(-230)
    expect(fluxoFuturo(modeloNovo)).toBe(-230)
    expect(projecaoPainel(modeloNovo, PF)).toBe(-230)
    expect(projecaoPainel(modeloNovo)).toBe(-230)
  })

  it('a despesa do NUGI marcada "sim" não aparece no Saldo Principal do perfil Lumen', () => {
    const b = saldoPrincipal(modeloNovo, PJ)
    expect(b.finalCiclo.agendamentos).toEqual([])
    expect(b.finalCiclo.total).toBe(300)
    expect(fluxoFuturo(modeloNovo, PJ)).toBe(0)
    expect(projecaoPainel(modeloNovo, PJ)).toBe(0)
  })

  it('como está hoje (sem os campos): só o Pix sai do fluxo (−230); marcar só a despesa contaria dobrado', () => {
    expect(saldoPrincipal([pix(null), diarista(null)], PF).finalCiclo.agendamentosTotal).toBe(-230)
    expect(saldoPrincipal([pix(null), diarista(true)], PF).finalCiclo.agendamentosTotal).toBe(-460)
  })
})

describe('regra do valor no fluxo principal', () => {
  const fluxo = escopoFluxoPrincipal(accounts, new Set(['itau', 'itlumen']), PF)

  it('despesa em conta não FC marcada entra, com o sinal do fluxo (saída)', () => {
    expect(agendamentoNoFluxoPrincipal(diarista(true), fluxo)).toBe(true)
    expect(valorNoFluxoPrincipal(diarista(true), 230, fluxo)).toBe(-230)
    expect(valorNoFluxoPrincipal({ ...diarista(true), transactionType: 'income' }, 230, fluxo)).toBe(230)
  })
  it('transferência FC → não FC desmarcada não entra; marcada (ou vazia) sai do fluxo', () => {
    expect(valorNoFluxoPrincipal(pix(false), 230, fluxo)).toBe(0)
    expect(valorNoFluxoPrincipal(pix(true), 230, fluxo)).toBe(-230)
    expect(valorNoFluxoPrincipal(pix(null), 230, fluxo)).toBe(-230)
    expect(valorNoFluxoPrincipal({ ...pix(false), accountId: 'nugi', toAccountId: 'itau' }, 230, fluxo)).toBe(0)
  })
  it('sem o campo segue igual a hoje', () => {
    expect(agendamentoNoFluxoPrincipal(diarista(null), fluxo)).toBe(false)
    expect(valorNoFluxoPrincipal(diarista(null), 230, fluxo)).toBe(0)
    expect(valorNoFluxoPrincipal(sched('luz', 'expense', 'itau'), 230, fluxo)).toBe(-230)
    expect(valorNoFluxoPrincipal(sched('ped', 'transfer', 'itau', { toAccountId: 'itlumen' }), 230, fluxo)).toBe(0)
  })
  it('marca fora do lugar é ignorada: conta FC, cartão, outro perfil, FC → FC', () => {
    expect(valorNoFluxoPrincipal(sched('luz', 'expense', 'itau', { considerarFluxoPrincipal: false }), 230, fluxo)).toBe(-230)
    expect(valorNoFluxoPrincipal(sched('compra', 'expense', 'cartao', { considerarFluxoPrincipal: true }), 230, fluxo)).toBe(0)
    expect(valorNoFluxoPrincipal(sched('fatura', 'transfer', 'itau', { toAccountId: 'cartao', considerarFluxoPrincipal: false }), 230, fluxo)).toBe(-230)
    const fluxoPJ = escopoFluxoPrincipal(accounts, new Set(['itlumen']), PJ)
    expect(agendamentoNoFluxoPrincipal(diarista(true), fluxoPJ)).toBe(false)
  })
})

describe('pergunta do formulário e o que se grava', () => {
  const p = (form) => perguntaFluxoPrincipal(form, accounts)
  it('despesa/receita em conta não FC → pergunta, padrão Não', () => {
    expect(p({ transactionType: 'expense', accountId: 'nugi' })).toEqual({ padrao: false, dica: null })
    expect(p({ transactionType: 'income', accountId: 'nugi' })).toEqual({ padrao: false, dica: null })
  })
  it('transferência FC ↔ não FC → pergunta, padrão Sim, com a dica', () => {
    expect(p({ transactionType: 'transfer', accountId: 'itau', toAccountId: 'nugi' })).toEqual({ padrao: true, dica: DICA_TRANSFERENCIA_FLUXO })
    expect(p({ transactionType: 'transfer', accountId: 'nugi', toAccountId: 'itau' })?.padrao).toBe(true)
  })
  it('não pergunta: conta FC, FC → FC, não FC → não FC, cartão', () => {
    expect(p({ transactionType: 'expense', accountId: 'itau' })).toBeNull()
    expect(p({ transactionType: 'transfer', accountId: 'itau', toAccountId: 'itlumen' })).toBeNull()
    expect(p({ transactionType: 'transfer', accountId: 'nugi', toAccountId: 'nugi2' })).toBeNull()
    expect(p({ transactionType: 'expense', accountId: 'cartao' })).toBeNull()
    expect(p({ transactionType: 'transfer', accountId: 'itau', toAccountId: 'cartao' })).toBeNull()
  })
  it('grava a escolha só onde a pergunta aparece; selo só com o campo preenchido', () => {
    expect(considerarFluxoParaGravar({ transactionType: 'expense', accountId: 'nugi', considerarFluxoPrincipal: true }, accounts)).toBe(true)
    expect(considerarFluxoParaGravar({ transactionType: 'expense', accountId: 'nugi', considerarFluxoPrincipal: null }, accounts)).toBeNull()
    expect(considerarFluxoParaGravar({ transactionType: 'expense', accountId: 'itau', considerarFluxoPrincipal: true }, accounts)).toBeNull()
    expect(seloFluxoPrincipal({ considerarFluxoPrincipal: true })).toBe('no fluxo')
    expect(seloFluxoPrincipal({ considerarFluxoPrincipal: false })).toBe('fora do fluxo')
    expect(seloFluxoPrincipal({ considerarFluxoPrincipal: null })).toBeNull()
  })
})
