import { describe, it, expect } from 'vitest'
import {
  CONSULTA_VIRTUAL, normalizarConsulta, consultasDoPerfil, resolverConsultaAtiva, listaComVirtual, idPadrao,
  erroNome, nomeDeCopia, projetadoNoFim, contasDaConsulta,
  validarConsulta, somarDias, diasEntre, ultimoDiaDeSaldo, situacaoSaldo, linhasFuturas,
  tipoEvento, contaDaLinha, minimoProjetado, serieDiaria, totalEmAtraso, estadoMarcacao, marcarLinhas, HORIZONTES,
} from './fluxoConsultas'
import { computeFluxoCaixa } from './fluxoCaixa'
import { montarLinhasSimuladas } from './fluxoCaixaDatas'
import { computeOccurrences } from './occurrences'

const HOJE = '2026-10-11'
const round2 = n => Math.round(n * 100) / 100
const accounts = [
  { id: 'itau', name: 'Itaú', type: 'checking', balance: 1000, fluxoCaixaPrincipal: true, accountGroupId: 'g_banco' },
  { id: 'nu', name: 'Nubank', type: 'checking', balance: 500, fluxoCaixaPrincipal: false, accountGroupId: 'g_banco' },
  { id: 'poup', name: 'Poupança', type: 'savings', balance: 2000, fluxoCaixaPrincipal: true, accountGroupId: 'g_res' },
  { id: 'card', name: 'Cartão', type: 'credit', balance: -300, fluxoCaixaPrincipal: true, accountGroupId: 'g_banco' },
]
const consulta = (extra) => normalizarConsulta({ id: 'c', nome: 'X', modo: 'conta', ...extra })

describe('normalização e escolha da consulta', () => {
  it('normaliza jsonb em string, defaults e horizonte inválido', () => {
    const c = normalizarConsulta({ id: '1', nome: 'A', modo: 'grupo', group_ids: '["g1"]', horizonte_padrao: 100, incluir_envelopes: null })
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

  it('FC Principal é sempre o primeiro cartão, mesmo com consultas salvas', () => {
    expect(listaComVirtual([consulta({ id: 'a' })]).map(c => c.id)).toEqual([CONSULTA_VIRTUAL.id, 'a'])
    expect(listaComVirtual([])).toEqual([CONSULTA_VIRTUAL])
  })

  it('abre a última escolhida; senão a padrão; senão FC Principal', () => {
    const a = consulta({ id: 'a' })
    const b = consulta({ id: 'b', padrao: true })
    expect(resolverConsultaAtiva([a, b], 'a').id).toBe('a')
    expect(resolverConsultaAtiva([a, b], 'sumiu').id).toBe('b')
    expect(resolverConsultaAtiva([a], null)).toBe(CONSULTA_VIRTUAL)
    expect(resolverConsultaAtiva([a], CONSULTA_VIRTUAL.id)).toBe(CONSULTA_VIRTUAL)
    expect(idPadrao([a])).toBe(CONSULTA_VIRTUAL.id)
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

describe('nome da consulta', () => {
  const cs = [consulta({ id: 'a', nome: 'Só Itaú', perfil_ids: ['pf'] }), consulta({ id: 'b', nome: 'Lumen', perfil_ids: ['pj'] })]
  it('obrigatório, até 40 caracteres', () => {
    expect(erroNome('  ', cs, [], null)).toMatch(/Informe/)
    expect(erroNome('x'.repeat(41), cs, [], null)).toMatch(/40/)
    expect(erroNome('x'.repeat(40), cs, [], null)).toBeNull()
  })
  it('repetido no mesmo perfil (sem diferenciar maiúsculas); outro perfil pode', () => {
    expect(erroNome('só itaú ', cs, ['pf'], null)).toMatch(/Já existe/)
    expect(erroNome('Só Itaú', cs, ['pj'], null)).toBeNull()
    expect(erroNome('Só Itaú', cs, [], null)).toMatch(/Já existe/) // todos os perfis cruza com pf
    expect(erroNome('Só Itaú', cs, ['pf'], 'a')).toBeNull()         // renomear para o próprio nome
    expect(erroNome('fc principal', cs, ['pf'], null)).toMatch(/Já existe/)
  })
  it('cópia ganha sufixo único e respeita 40 caracteres', () => {
    expect(nomeDeCopia('Só Itaú', cs, ['pf'])).toBe('Só Itaú (cópia)')
    const comCopia = [...cs, consulta({ id: 'c', nome: 'Só Itaú (cópia)', perfil_ids: ['pf'] })]
    expect(nomeDeCopia('Só Itaú', comCopia, ['pf'])).toBe('Só Itaú (cópia 2)')
    expect(nomeDeCopia('y'.repeat(40), cs, ['pf'])).toHaveLength(40)
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
  it('prazos de 15 a 120 dias, de 15 em 15; os novos valem como horizonte padrão', () => {
    expect(HORIZONTES).toEqual([15, 30, 45, 60, 75, 90, 105, 120])
    for (const h of [75, 90, 105, 120]) {
      expect(validarConsulta({ nome: 'P', modo: 'principais', horizonte_padrao: h })).toBeNull()
      expect(consulta({ horizonte_padrao: h }).horizonte_padrao).toBe(h)
    }
  })
})

describe('marcar / desmarcar todos', () => {
  const linhas = [{ _key: 'a' }, { _key: 'b' }, { _key: 'c' }]
  it('estado: todas, nenhuma, parcial (indeterminado) e lista vazia', () => {
    expect(estadoMarcacao(linhas, new Set())).toMatchObject({ ativas: 3, total: 3, todas: true, parcial: false })
    expect(estadoMarcacao(linhas, new Set(['a', 'b', 'c']))).toMatchObject({ ativas: 0, nenhuma: true, todas: false, parcial: false })
    expect(estadoMarcacao(linhas, new Set(['b']))).toMatchObject({ ativas: 2, parcial: true, todas: false })
    expect(estadoMarcacao([], new Set())).toMatchObject({ total: 0, todas: false, nenhuma: true, parcial: false })
  })
  it('mexe só nas linhas passadas: as de fora do prazo/filtro ficam como estavam', () => {
    expect([...marcarLinhas(new Set(['x', 'b']), linhas, false)].sort()).toEqual(['a', 'b', 'c', 'x'])
    expect([...marcarLinhas(new Set(['x', 'b']), linhas, true)]).toEqual(['x'])
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
    // Evento depois do fim do horizonte não entra.
    const depois = [...rows, { _key: 'tarde', date: '2026-11-14', real: false, entrada: 0, saida: 50 }]
    expect(linhasFuturas(depois, { hoje: HOJE, fim: '2026-11-10' }).map(x => x._key)).toEqual(['fut', 'agd'])
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

  const FIM = '2026-11-10'
  const serieDe = (linhas, opts = {}) => {
    const sim = montarLinhasSimuladas(linhasFuturas(linhas, { hoje: HOJE, fim: FIM }), { start: HOJE, end: FIM, saldoBase: 1000, ...opts })
    return serieDiaria(sim.rowsView, 1000, HOJE, FIM)
  }

  it('mínimo = menor saldo diário, com a data; linha desmarcada não conta', () => {
    expect(minimoProjetado(serieDe(rows))).toEqual({ valor: 200, data: '2026-10-15' })
    expect(minimoProjetado(serieDe(rows, { excluidas: new Set(['agd']) }))).toEqual({ valor: 900, data: '2026-10-15' })
    expect(minimoProjetado(serieDiaria([], 1000, HOJE, HOJE))).toEqual({ valor: 1000, data: HOJE })
  })

  it('envelope com ciclo fechando após o horizonte → restante no último dia do horizonte', () => {
    const env = { _key: 'env_1_2026-11-14', date: '2026-11-14', description: 'Envelope: Mercado', real: false, entrada: 0, saida: 640.5, _envelope: true }
    const r = linhasFuturas([...rows, env], { hoje: HOJE, fim: FIM })
    const e = r.find(x => x._key === env._key)
    expect(e).toMatchObject({ date: FIM, saida: 640.5, _cicloAte: '2026-11-14', _envelope: true })
    expect(e.description).toMatch(/^Envelope Mercado \(restante R\$\s640,50 · ciclo até 14\/11\)$/)
    // e entra no projetado do último dia
    expect(projetadoNoFim(serieDe([...rows, env]))).toBe(round2(200 - 640.5))
  })

  it('evento depois do horizonte não entra no mínimo nem no projetado; mínimo cai dentro do período', () => {
    const comTarde = [...rows, { _key: 'tarde', date: '2026-11-14', real: false, entrada: 0, saida: 5000 }]
    const s = serieDe(comTarde)
    expect(s[0].date).toBe(HOJE)
    expect(s[s.length - 1].date).toBe(FIM)
    const min = minimoProjetado(s)
    expect(min.data >= HOJE && min.data <= FIM).toBe(true)
    expect(min).toEqual({ valor: 200, data: '2026-10-15' })
    expect(projetadoNoFim(s)).toBe(200)
  })

  it('Projetado (último dia) difere do Mínimo quando há entrada no fim', () => {
    const s = serieDe([...rows, { _key: 'sal', date: '2026-11-09', real: false, entrada: 3000, saida: 0 }])
    expect(minimoProjetado(s)).toEqual({ valor: 200, data: '2026-10-15' })
    expect(projetadoNoFim(s)).toBe(3200)
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
    const s = serieDiaria(sim.rowsView, 1000 + total, HOJE, fim)
    expect(minimoProjetado(s)).toEqual({ valor: 200, data: HOJE })
    expect(projetadoNoFim(s)).toBe(2400)
  })

  it('15 dias pega o salário de 20/10 mas não chega ao 05/11', () => {
    const main = computeFluxoCaixa({ ...comum, start: HOJE, end: somarDias(HOJE, 15) })
    expect(main.rows.map(r => r.date)).toEqual(['2026-10-20'])
  })
})
