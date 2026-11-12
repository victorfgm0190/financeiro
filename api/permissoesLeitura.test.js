import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import process from 'node:process'
import { _definirFabricaDePool } from './_conexao.js'
import { montarAmbiente, prepararChamadas, chamar, USUARIOS as U } from './_testes/ambientePerfis.js'
import { regraDeLeitura, ehLeitura, atendeLeitura } from '../src/lib/permissoes.js'

// Auditoria 11/2026, item 4 (P1, GRAFITY B2): leituras exigem "ver" no servidor (regra única
// regraDeLeitura, aplicada pelo requireAuth) e devolvem só o que é dos perfis permitidos. O /api/load
// continua trazendo o necessário para o app abrir; só as seções exclusivas de um módulo saem.

const H = {
  load: (await import('./load.js')).default,
  historico: (await import('./historico.js')).default,
  integridade: (await import('./integridade.js')).default,
  prov: (await import('./fluxo-provisorios.js')).default,
  datas: (await import('./fluxo-datas-provisorias.js')).default,
  ajustes: (await import('./reserve-adjustments.js')).default,
  periodos: (await import('./reserve-periods.js')).default,
  rft: (await import('./reserve-function-transactions.js')).default,
  search: (await import('./search.js')).default,
  importacoes: (await import('./importacoes-lancamentos.js')).default,
}

let amb
beforeAll(async () => {
  amb = await montarAmbiente(`
    INSERT INTO reserve_adjustments (id, function_id, data, valor) VALUES ('aj_a', 'rf_a', '2026-10-01', 5), ('aj_b', 'rf_b', '2026-10-01', 7);
    INSERT INTO reserve_periods (id, function_id, data_inicio, saldo_inicial) VALUES ('pe_a', 'rf_a', '2026-01-01', 1), ('pe_b', 'rf_b', '2026-01-01', 2);
    INSERT INTO orcamento (id, category_id, amount, period) VALUES ('orc1', 'c1', 100, 'monthly');
    INSERT INTO card_imports (id, account_id, mes_ano) VALUES ('imp_a', 'conta_a', '2026-10'), ('imp_b', 'conta_b', '2026-10');
    INSERT INTO importacoes_lancamentos (id, conta_id, formato) VALUES ('lote_a', 'conta_a', 'csv'), ('lote_b', 'conta_b', 'csv');
    INSERT INTO historico_alteracoes (entidade, entidade_id, lote_id, escopo, campo) VALUES
      ('lancamento', 'l_a', 'L1', 'parcela', 'amount'), ('lancamento', 'l_b', 'L1', 'parcela', 'amount'),
      ('agendamento', 'ag_a', 'L2', 'parcela', 'amount'), ('agendamento', 'ag_b', 'L2', 'parcela', 'amount'),
      ('lancamento', 'apagado', 'L3', 'parcela', 'amount');
  `)
  prepararChamadas(amb)
  // Tabelas criadas pela própria rota no primeiro uso.
  await chamar(amb, H.integridade, U.admin, { method: 'GET', url: '/api/integridade?resumo=1' })
  await chamar(amb, H.prov, U.admin, { url: '/api/fluxo-provisorios', body: { id: 'pv_a', date: '2026-11-20', description: 'A', amount: 1, type: 'saida', account_id: 'conta_a' } })
  await chamar(amb, H.prov, U.admin, { url: '/api/fluxo-provisorios', body: { id: 'pv_b', date: '2026-11-20', description: 'B', amount: 1, type: 'saida', account_id: 'conta_b' } })
  await chamar(amb, H.datas, U.admin, { url: '/api/fluxo-datas-provisorias', body: { schedule_id: 'ag_a', data_original: '2026-11-01', data_provisoria: '2026-11-03' } })
  await chamar(amb, H.datas, U.admin, { url: '/api/fluxo-datas-provisorias', body: { schedule_id: 'ag_b', data_original: '2026-11-01', data_provisoria: '2026-11-03' } })
  await amb.q(`INSERT INTO pendencias_integridade (id, regra, severidade, origem_id, conta_id, descricao, status) VALUES
    ('pd_a', 'R_X', 'auto', 'l_a', 'conta_a', 'A', 'pendente'), ('pd_b', 'R_X', 'auto', 'l_b', 'conta_b', 'B', 'pendente'),
    ('pd_sem_conta_b', 'R_Y', 'auto', 'l_b', NULL, 'B', 'pendente')`)
  vi.restoreAllMocks()
}, 180_000)
let env
beforeEach(() => { env = { ...process.env }; prepararChamadas(amb) })
afterEach(() => { process.env = env; vi.restoreAllMocks() })
afterAll(() => { _definirFabricaDePool(null) })

const get = (handler, quem, url) => chamar(amb, handler, quem, { method: 'GET', url })
const ids = (rows, campo = 'id') => rows.map(r => r[campo]).sort()

describe('regra única de leitura (src/lib/permissoes.js)', () => {
  it('GET e as leituras via POST são leituras; gravações não', () => {
    expect(ehLeitura('/api/integridade', 'GET')).toBe(true)
    expect(ehLeitura('/api/search', 'POST')).toBe(true)
    expect(ehLeitura('/api/integridade', 'POST')).toBe(false)
  })
  it('basta "ver" em um dos módulos que usam o dado', () => {
    expect(regraDeLeitura('/api/fluxo-provisorios?x=1')).toEqual({ modulos: ['fluxo', 'relatorios'], acao: 'ver' })
    expect(atendeLeitura(U.soOrcamento, regraDeLeitura('/api/integridade'))).toBe(false)
    expect(atendeLeitura(U.soAgendamentos, regraDeLeitura('/api/historico'))).toBe(true)
    expect(regraDeLeitura('/api/feriados')).toBeNull()
  })
})

describe('sem "ver" no módulo → 403', () => {
  it('quem só vê Orçamento não lê integridade, fluxo, histórico, busca nem razão das reservas', async () => {
    expect((await get(H.integridade, U.soOrcamento, '/api/integridade?resumo=1')).statusCode).toBe(403)
    expect((await get(H.prov, U.soOrcamento, '/api/fluxo-provisorios')).statusCode).toBe(403)
    expect((await get(H.datas, U.soOrcamento, '/api/fluxo-datas-provisorias')).statusCode).toBe(403)
    expect((await get(H.historico, U.soOrcamento, '/api/historico?resumo=1')).statusCode).toBe(403)
    expect((await chamar(amb, H.search, U.soOrcamento, { url: '/api/search', body: { q: 'Mercado' } })).statusCode).toBe(403)
    expect((await chamar(amb, H.rft, U.soOrcamento, { url: '/api/reserve-function-transactions', body: { functionId: 'rf_a' } })).statusCode).toBe(403)
    expect((await get(H.importacoes, U.soOrcamento, '/api/importacoes-lancamentos')).statusCode).toBe(403)
  })
  it('histórico: quem vê só Agendamentos recebe só o histórico de agendamentos', async () => {
    const r = await get(H.historico, U.soAgendamentos, '/api/historico?resumo=1')
    expect(r.statusCode).toBe(200)
    expect([...new Set(r.body.itens.map(i => i.entidade))]).toEqual(['agendamento'])
    expect((await get(H.historico, U.soAgendamentos, '/api/historico?lote_id=L1')).body.historico).toEqual([])
  })
})

describe('perfis permitidos nas leituras', () => {
  it('histórico: só registros do perfil (resumo, por lote e por registro); registro apagado não aparece', async () => {
    const r = await get(H.historico, U.restrito, '/api/historico?resumo=1')
    expect(r.body.itens.map(i => `${i.entidade}:${i.entidade_id}`).sort()).toEqual(['agendamento:ag_a', 'lancamento:l_a'])
    expect(ids((await get(H.historico, U.restrito, '/api/historico?lote_id=L1')).body.historico, 'entidade_id')).toEqual(['l_a'])
    expect((await get(H.historico, U.restrito, '/api/historico?entidade_id=l_b')).body.historico).toEqual([])
    expect((await get(H.historico, U.admin, '/api/historico?resumo=1')).body.itens).toHaveLength(5)
  })
  it('integridade: lista e resumo só com as pendências do perfil', async () => {
    expect(ids((await get(H.integridade, U.restrito, '/api/integridade')).body.pendencias)).toEqual(['pd_a'])
    expect((await get(H.integridade, U.restrito, '/api/integridade?resumo=1')).body.pendentes).toBe(1)
    expect((await get(H.integridade, U.admin, '/api/integridade?resumo=1')).body.pendentes).toBe(3)
  })
  it('fluxo: provisórios e datas provisórias só do perfil', async () => {
    expect(ids((await get(H.prov, U.restrito, '/api/fluxo-provisorios')).body.provisorios)).toEqual(['pv_a'])
    expect((await get(H.datas, U.restrito, '/api/fluxo-datas-provisorias')).body.datas.map(d => d.schedule_id)).toEqual(['ag_a'])
  })
  it('reservas: ajustes e saldos iniciais só das funções do perfil (sem exigir o módulo: entram no saldo do Painel)', async () => {
    expect(ids((await get(H.ajustes, U.restrito, '/api/reserve-adjustments')).body.adjustments)).toEqual(['aj_a'])
    expect(ids((await get(H.periodos, U.restrito, '/api/reserve-periods')).body.periods)).toEqual(['pe_a'])
    expect((await get(H.periodos, U.soOrcamento, '/api/reserve-periods')).statusCode).toBe(200)
    expect(ids((await get(H.ajustes, U.admin, '/api/reserve-adjustments')).body.adjustments)).toEqual(['aj_a', 'aj_b'])
  })
  it('importação de lançamentos: lote de conta de outro perfil → 403 (ler e concluir)', async () => {
    expect((await get(H.importacoes, U.restrito, '/api/importacoes-lancamentos?acao=lote&id=lote_b')).statusCode).toBe(403)
    expect((await chamar(amb, H.importacoes, U.restrito, { url: '/api/importacoes-lancamentos?acao=concluir', body: { id: 'lote_b' } })).statusCode).toBe(403)
    expect((await get(H.importacoes, U.restrito, '/api/importacoes-lancamentos?acao=lote&id=lote_a')).statusCode).toBe(200)
  })
})

describe('/api/load: o app continua abrindo', () => {
  it('acesso total: tudo vem', async () => {
    const r = await get(H.load, U.admin, '/api/load')
    expect(r.statusCode).toBe(200)
    expect(ids(r.body.txs)).toEqual(['l_a', 'l_b'])
    expect(ids(r.body.buds)).toEqual(['orc1'])
    expect(ids(r.body.imports)).toEqual(['imp_a', 'imp_b'])
  })
  it('restrito ao perfil A: contas, lançamentos, agendamentos e funções do perfil; importações do cartão também por perfil', async () => {
    const r = await get(H.load, U.restrito, '/api/load')
    expect(r.statusCode).toBe(200)
    expect(ids(r.body.accs)).toEqual(['conta_a'])
    expect(ids(r.body.txs)).toEqual(['l_a'])
    expect(ids(r.body.scheds)).toEqual(['ag_a'])
    expect(ids(r.body.rfns)).toEqual(['rf_a'])
    expect(ids(r.body.imports)).toEqual(['imp_a'])
    expect(r.body.cats.length).toBeGreaterThan(0)
  })
  it('sem "ver" no Orçamento / na Importação: essas seções vêm vazias, o resto vem', async () => {
    const r = await get(H.load, U.soAgendamentos, '/api/load')
    expect(r.statusCode).toBe(200)
    expect(r.body.buds).toEqual([])
    expect(r.body.imports).toEqual([])
    expect(ids(r.body.txs)).toEqual(['l_a', 'l_b'])
    const o = await get(H.load, U.soOrcamento, '/api/load')
    expect(ids(o.body.buds)).toEqual(['orc1'])
    expect(o.body.imports).toEqual([])
  })
})
