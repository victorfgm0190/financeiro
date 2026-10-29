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

// ── Provisão (ProvisaoForm): conta escolhida + a mesma marca ─────────────────────────────────
describe('provisão: conta da provisão e "Considerar no Fluxo de Caixa principal?"', () => {
  const contas = [...accounts, { id: 'reserva', name: 'Contas Anuais', type: 'savings', fluxoCaixaPrincipal: false, profileId: PF, isReserva: true }]
  const reserveFunctions = [{ id: 'f1', name: 'Diarista', accountId: 'reserva' }]
  const prov = (accountId, marca, extra = {}) => ({
    id: 'prov', description: 'DIARISTA', transactionType: 'expense', accountId, amount: 230, occs: ['2026-11-06'],
    isProvisao: true, provisaoEfetivada: false, considerarFluxoPrincipal: marca, ...extra,
  })
  const sp = (schedules, profileId = PF) => calcularSaldoPrincipalBreakdown({
    accounts: contas, transactions: [], schedules, envelopes: [],
    settings: { financialMonthMode: 'custom', financialMonthStartDay: 15 }, gerencialGroups: [],
    profileId, getNextOccurrences, getFinancialPeriod: () => ({ start: new Date(2026, 9, 15), end: new Date(2026, 10, 14) }),
  }, new Date(2026, 9, 29, 12)).finalCiclo.agendamentosTotal
  const ff = (schedules, profileId = PF) => {
    const doPerfil = contas.filter(a => a.profileId === profileId)
    const ids = new Set(doPerfil.filter(a => a.fluxoCaixaPrincipal && a.type !== 'credit').map(a => a.id))
    const r = computeFluxoCaixa({
      accountIds: ids, currentBalance: 0, start: '2026-10-29', end: '2026-11-14', schedules, getNextOccurrences,
      reserveFunctions, fluxoPrincipal: escopoFluxoPrincipal(doPerfil, ids),
    })
    return Math.round(r.rows.reduce((s, l) => s + l.entrada - l.saida, 0) * 100) / 100
  }
  const pp = (schedules, profileId = PF) => {
    const doPerfil = contas.filter(a => a.profileId === profileId)
    const ids = new Set(doPerfil.filter(a => a.fluxoCaixaPrincipal && a.type !== 'credit').map(a => a.id))
    const p = pendentesNoFluxoPrincipal(schedules, escopoFluxoPrincipal(doPerfil, ids), getNextOccurrences, { depoisDe: '2026-10-29', ate: '2026-11-14' })
    return Math.round((p.entradas - p.saidas) * 100) / 100
  }

  it('provisão DIARISTA no NUGI marcada Sim dá −230 uma vez só (com o Pix marcado Não)', () => {
    const s = [pix(false), prov('nugi', true)]
    expect(sp(s)).toBe(-230)
    expect(ff(s)).toBe(-230)
    expect(pp(s)).toBe(-230)
    expect(sp(s, PJ)).toBe(0)
  })
  it('provisão na Conta central (FC), sem marca: igual a hoje', () => {
    expect(sp([prov('itau', null)])).toBe(-230)
    expect(ff([prov('itau', null)])).toBe(-230)
    expect(pp([prov('itau', null)])).toBe(-230)
    expect(sp([prov('nugi', null)])).toBe(0) // conta não FC sem marca: fora, como qualquer agendamento
  })
  it('com função de reserva: no NUGI marcada Sim o resgate segue a marca — mesmo resultado da Conta central', () => {
    const naCentral = [prov('itau', null, { reservaFuncaoId: 'f1' })]
    const noNugiSim = [prov('nugi', true, { reservaFuncaoId: 'f1' })]
    const noNugiNao = [prov('nugi', false, { reservaFuncaoId: 'f1' })]
    expect(ff(naCentral)).toBe(0) // resgate +230, despesa −230
    expect(ff(noNugiSim)).toBe(0)
    expect(ff(noNugiNao)).toBe(0)
    expect(sp(noNugiSim)).toBe(sp(naCentral))
    expect(pp(noNugiSim)).toBe(pp(naCentral))
  })
  it('depois de efetivar: despesa (NUGI, Sim) + resgate reserva → NUGI (Sim) = líquido 0, igual à Conta central', () => {
    const efetivados = (conta, marca) => [
      { id: 'd', description: 'DIARISTA', transactionType: 'expense', accountId: conta, amount: 230, occs: ['2026-11-06'], considerarFluxoPrincipal: marca },
      { id: 'r', description: 'Resgate provisão — DIARISTA', transactionType: 'transfer', accountId: 'reserva', toAccountId: conta, amount: 230, occs: ['2026-11-06'], considerarFluxoPrincipal: marca, reservaFuncaoId: 'f1' },
    ]
    for (const f of [sp, ff, pp]) {
      expect(f(efetivados('nugi', true))).toBe(0)
      expect(f(efetivados('nugi', true))).toBe(f(efetivados('itau', null)))
    }
  })
  it('a marca do resgate não FC → não FC sobrevive à edição; sem marca segue fora', () => {
    const resgate = { transactionType: 'transfer', accountId: 'reserva', toAccountId: 'nugi' }
    expect(perguntaFluxoPrincipal(resgate, contas)).toBeNull()
    expect(considerarFluxoParaGravar({ ...resgate, considerarFluxoPrincipal: true }, contas)).toBe(true)
    expect(considerarFluxoParaGravar({ ...resgate, considerarFluxoPrincipal: null }, contas)).toBeNull()
    const fluxo = escopoFluxoPrincipal(contas, new Set(['itau']), PF)
    expect(valorNoFluxoPrincipal({ ...resgate, considerarFluxoPrincipal: null }, 230, fluxo)).toBe(0)
    expect(valorNoFluxoPrincipal({ ...resgate, considerarFluxoPrincipal: true }, 230, fluxo)).toBe(230)
  })
})
