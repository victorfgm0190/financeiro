import { describe, it, expect } from 'vitest'
import {
  CONSULTA_VIRTUAL, normalizarConsulta, consultasDoPerfil, consultaInicial, contasDaConsulta,
  validarConsulta, somarDias, diasEntre, ultimoDiaDeSaldo, situacaoSaldo, linhasFuturas,
  tipoEvento, contaDaLinha, minimoProjetado, serieDiaria, totalEmAtraso,
} from './fluxoConsultas'
import { computeFluxoCaixa } from './fluxoCaixa'
import { montarLinhasSimuladas } from './fluxoCaixaDatas'
import { computeOccurrences } from './occurrences'

const HOJE = '2026-10-11'
const accounts = [
  { id: 'itau', name: 'Itaú', type: 'checking', balance: 1000, fluxoCaixaPrincipal: true, accountGroupId: 'g_banco' },
  { id: 'nu', name: 'Nubank', type: 'checking', balance: 500, fluxoCaixaPrincipal: false, accountGroupId: 'g_banco' },
  { id: 'poup', name: 'Poupança', type: 'savings', balance: 2000, fluxoCaixaPrincipal: true, accountGroupId: 'g_res' },
  { id: 'card', name: 'Cartão', type: 'credit', balance: -300, fluxoCaixaPrincipal: true, accountGroupId: 'g_banco' },
]
const consulta = (extra) => normalizarConsulta({ id: 'c', nome: 'X', modo: 'conta', ...extra })

describe('normalização e escolha da consulta', () => {
  it('normaliza jsonb em string, defaults e horizonte inválido', () => {
    const c = normalizarConsulta({ id: '1', nome: 'A', modo: 'grupo', group_ids: '["g1"]', horizonte_padrao: 90, incluir_envelopes: null })
    expect(c).toMatchObject({ group_ids: ['g1'], account_ids: [], perfil_ids: [], horizonte_padrao: 30, incluir_envelopes: true, ocultar_reserva: false, padrao: false })
  })

  it('perfil: vazio = todos; sem perfil ativo mostra todas; ordena por ordem e nome', () => {
    const cs = [
      consulta({ id: 'a', nome: 'B', perfil_ids: [], ordem: 2 }),
      consulta({ id: 'b', nome: 'A', perfil_ids: ['pj'], ordem: 1 }),
      consulta({ id: 'c', nome: 'C', perfil_ids: ['pf'], ordem: 3 }),
    ]
    expect(consultasDoPerfil(cs, 'pf').map(c => c.id)).toEqual(['a', 'c'])
    expect(consultasDoPerfil(cs, null).map(c => c.id)).toEqual(['b', 'a', 'c'])
  })

  it('abre a padrão; senão a primeira; sem nenhuma, a virtual FC Principal', () => {
    const a = consulta({ id: 'a' })
    const b = consulta({ id: 'b', padrao: true })
    expect(consultaInicial([a, b]).id).toBe('b')
    expect(consultaInicial([a]).id).toBe('a')
    expect(consultaInicial([])).toBe(CONSULTA_VIRTUAL)
  })
})

describe('contasDaConsulta', () => {
  it('Por Conta: só as escolhidas, nunca cartão', () => {
    expect(contasDaConsulta(consulta({ account_ids: ['itau', 'card'] }), accounts).map(a => a.id)).toEqual(['itau'])
  })
  it('Por Grupo: união das contas dos grupos', () => {
    expect(contasDaConsulta(consulta({ modo: 'grupo', group_ids: ['g_banco', 'g_res'] }), accounts).map(a => a.id)).toEqual(['itau', 'nu', 'poup'])
  })
  it('Contas Principais: as FC (sem cartão) — é a consulta virtual', () => {
    expect(contasDaConsulta(CONSULTA_VIRTUAL, accounts).map(a => a.id)).toEqual(['itau', 'poup'])
  })
})

describe('validarConsulta', () => {
  it('exige nome, contas/grupos conforme o modo e horizonte válido', () => {
    expect(validarConsulta({ nome: ' ', modo: 'conta', account_ids: ['x'], horizonte_padrao: 30 })).toMatch(/nome/)
    expect(validarConsulta({ nome: 'Só Itaú', modo: 'conta', account_ids: [], horizonte_padrao: 30 })).toMatch(/conta/)
    expect(validarConsulta({ nome: 'G', modo: 'grupo', group_ids: [], horizonte_padrao: 30 })).toMatch(/grupo/)
    expect(validarConsulta({ nome: 'P', modo: 'principais', horizonte_padrao: 20 })).toMatch(/Horizonte/)
    expect(validarConsulta({ nome: 'Só Itaú', modo: 'conta', account_ids: ['itau'], horizonte_padrao: 45 })).toBeNull()
  })
})

describe('datas e situação do saldo', () => {
  it('somarDias/diasEntre sem fuso, virando mês', () => {
    expect(somarDias(HOJE, 30)).toBe('2026-11-10')
    expect(somarDias('2026-10-01', -1)).toBe('2026-09-30')
    expect(diasEntre('2026-10-01', HOJE)).toBe(10)
  })

  it('último dia = último lançamento realizado (data <= hoje) que toca a conta', () => {
    const txs = [
      { date: '2026-10-05', accountId: 'itau' },
      { date: '2026-10-09', accountId: 'nu', toAccountId: 'itau', type: 'transfer' },
      { date: '2026-10-20', accountId: 'itau' }, // futuro: não conta
      { date: '2026-10-10', type: 'credit_payment', accountId: 'card', fromAccountId: 'poup' },
    ]
    expect(ultimoDiaDeSaldo('itau', txs, HOJE)).toBe('2026-10-09')
    expect(ultimoDiaDeSaldo('poup', txs, HOJE)).toBe('2026-10-10')
    expect(ultimoDiaDeSaldo('outra', txs, HOJE)).toBeNull()
  })

  it('situação: atualizada (hoje/ontem), há N dias (≤7), sem movimento há N dias (>7)', () => {
    expect(situacaoSaldo(HOJE, HOJE).rotulo).toBe('atualizada')
    expect(situacaoSaldo('2026-10-10', HOJE).rotulo).toBe('atualizada')
    expect(situacaoSaldo('2026-10-04', HOJE)).toMatchObject({ tipo: 'recente', rotulo: 'há 7 dias' })
    expect(situacaoSaldo('2026-10-03', HOJE)).toMatchObject({ tipo: 'parada', rotulo: 'sem movimento há 8 dias' })
    expect(situacaoSaldo(null, HOJE).tipo).toBe('sem')
  })
})

describe('linhas, mínimo e série', () => {
  const rows = [
    { _key: 'hoje', date: HOJE, real: true, entrada: 50, saida: 0 },
    { _key: 'fut', date: '2026-10-15', real: true, entrada: 0, saida: 100, type: 'expense', fromAccountId: 'itau' },
    { _key: 'agd', date: '2026-10-13', real: false, entrada: 0, saida: 700, _scheduleId: 's' },
  ]

  it('lançamento até hoje sai (já está no saldo); futuro vira evento desmarcável', () => {
    const r = linhasFuturas(rows, { hoje: HOJE })
    expect(r.map(x => x._key)).toEqual(['fut', 'agd'])
    expect(r[0]).toMatchObject({ real: false, _lancamento: true })
    expect(linhasFuturas(rows, { hoje: HOJE, incluirLancamentosFuturos: false }).map(x => x._key)).toEqual(['agd'])
  })

  it('tipo do evento e conta da linha', () => {
    expect([{ _provisorio: {} }, { _envelope: true }, { _lancamento: true }, {}].map(tipoEvento))
      .toEqual(['provisório', 'envelope', 'lançamento', 'agendamento'])
    const ids = new Set(['itau'])
    expect(contaDaLinha({ type: 'transfer', entrada: 10, fromAccountId: 'nu', toAccountId: 'itau' }, ids)).toBe('itau')
    expect(contaDaLinha({ type: 'expense', saida: 10, fromAccountId: 'itau' }, ids)).toBe('itau')
  })

  it('mínimo projetado com a data; linha desmarcada não conta', () => {
    const sim = montarLinhasSimuladas(linhasFuturas(rows, { hoje: HOJE }), { start: HOJE, end: '2026-11-10', saldoBase: 1000 })
    expect(minimoProjetado(sim.rowsView, 1000, HOJE)).toEqual({ valor: 200, data: '2026-10-15', key: 'fut' })
    const sem = montarLinhasSimuladas(linhasFuturas(rows, { hoje: HOJE }), { start: HOJE, end: '2026-11-10', saldoBase: 1000, excluidas: new Set(['agd']) })
    expect(minimoProjetado(sem.rowsView, 1000, HOJE)).toEqual({ valor: 900, data: '2026-10-15', key: 'fut' })
    expect(minimoProjetado([], 1000, HOJE)).toEqual({ valor: 1000, data: HOJE, key: null })
  })

  it('série diária: um ponto por dia de hoje ao fim, saldo no fim do dia', () => {
    const sim = montarLinhasSimuladas(linhasFuturas(rows, { hoje: HOJE }), { start: HOJE, end: '2026-10-16', saldoBase: 1000 })
    const s = serieDiaria(sim.rowsView, 1000, HOJE, '2026-10-16')
    expect(s).toHaveLength(6)
    expect(s.map(p => p.balance)).toEqual([1000, 1000, 300, 300, 200, 200])
    expect(s[2].label).toBe('13/10')
  })

  it('pendências em atraso: soma só as não desmarcadas', () => {
    const atraso = [{ _key: 'a', entrada: 0, saida: 300 }, { _key: 'b', entrada: 100, saida: 0 }]
    expect(totalEmAtraso(atraso, new Set())).toEqual({ total: -200, ativas: 2 })
    expect(totalEmAtraso(atraso, new Set(['a']))).toEqual({ total: 100, ativas: 1 })
  })
})

describe('cenário da tela (computeFluxoCaixa de hoje ao horizonte + atraso)', () => {
  // Itaú com saldo 1000: aluguel mensal todo dia 5 com outubro em atraso, salário dia 20.
  const aluguel = { id: 'alug', transactionType: 'expense', accountId: 'itau', amount: 800, frequency: 'monthly', occurrenceType: 'continuous', startDate: '2026-09-05', nextOccurrence: '2026-10-05', registered: ['2026-09-05'], skipped: [], overrides: {} }
  const salario = { id: 'sal', transactionType: 'income', accountId: 'itau', amount: 3000, frequency: 'monthly', occurrenceType: 'continuous', startDate: '2026-10-20', registered: [], skipped: [], overrides: {} }
  const comum = { accountIds: new Set(['itau']), currentBalance: 1000, schedules: [aluguel, salario], getNextOccurrences: (s, n) => computeOccurrences(s, n) }

  it('atraso fica fora do período e entra como linha própria; 30 dias pega o 05/11', () => {
    const fim = somarDias(HOJE, 30)
    const main = computeFluxoCaixa({ ...comum, start: HOJE, end: fim })
    const atraso = computeFluxoCaixa({ ...comum, start: '0001-01-01', end: somarDias(HOJE, -1) }).rows
    expect(atraso.map(r => [r.date, r.saida])).toEqual([['2026-10-05', 800]])
    const { total } = totalEmAtraso(atraso, new Set())
    const sim = montarLinhasSimuladas(linhasFuturas(main.rows, { hoje: HOJE }), { start: HOJE, end: fim, saldoBase: 1000 + total })
    expect(sim.rowsView.map(r => [r.date, r.saldo])).toEqual([['2026-10-20', 3200], ['2026-11-05', 2400]])
    expect(minimoProjetado(sim.rowsView, 1000 + total, HOJE)).toMatchObject({ valor: 200, data: HOJE })
  })

  it('15 dias pega o salário de 20/10 mas não chega ao 05/11', () => {
    const main = computeFluxoCaixa({ ...comum, start: HOJE, end: somarDias(HOJE, 15) })
    expect(main.rows.map(r => r.date)).toEqual(['2026-10-20'])
  })
})
