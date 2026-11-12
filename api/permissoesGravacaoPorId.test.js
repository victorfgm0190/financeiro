import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import process from 'node:process'
import { _definirFabricaDePool } from './_conexao.js'
import { montarAmbiente, prepararChamadas, chamar, USUARIOS as U } from './_testes/ambientePerfis.js'

// Auditoria 11/2026, item 2 (P1): rotas que gravam por id conferem, no servidor, o perfil do registro
// GRAVADO no banco (e o do novo, ao gravar). Fora dos perfis permitidos → 403 e nada muda.

const H = {
  prov: (await import('./fluxo-provisorios.js')).default,
  ajustes: (await import('./reserve-adjustments.js')).default,
  periodos: (await import('./reserve-periods.js')).default,
  integridade: (await import('./integridade.js')).default,
  srf: (await import('./sync-srf.js')).default,
}

let amb
beforeAll(async () => {
  amb = await montarAmbiente(`
    INSERT INTO reserve_adjustments (id, function_id, data, valor, observacao) VALUES
      ('aj_a', 'rf_a', '2026-10-01', 5, 'A'), ('aj_b', 'rf_b', '2026-10-01', 7, 'B');
    INSERT INTO reserve_periods (id, function_id, data_inicio, saldo_inicial) VALUES
      ('pe_a', 'rf_a', '2026-01-01', 100), ('pe_b', 'rf_b', '2026-01-01', 200);
    INSERT INTO schedule_reserva_funcoes (id, schedule_id) VALUES ('srf_a1', 'ag_a'), ('srf_b1', 'ag_b');
  `)
}, 180_000)
let env
beforeEach(() => { env = { ...process.env }; prepararChamadas(amb) })
afterEach(() => { process.env = env; vi.restoreAllMocks() })
afterAll(() => { _definirFabricaDePool(null) })

const c = (handler, quem, opts) => chamar(amb, handler, quem, opts)
const um = async (sql, p) => (await amb.q(sql, p))[0]

describe('fluxo-provisorios', () => {
  const prov = (id, conta) => ({ id, date: '2026-11-20', description: 'Sim', amount: 10, type: 'saida', account_id: conta })
  beforeAll(async () => {
    prepararChamadas(amb)
    expect((await c(H.prov, U.admin, { url: '/api/fluxo-provisorios', body: prov('pv_b', 'conta_b') })).statusCode).toBe(200)
    expect((await c(H.prov, U.admin, { url: '/api/fluxo-provisorios', body: prov('pv_a', 'conta_a') })).statusCode).toBe(200)
    vi.restoreAllMocks()
  })

  it('criar em conta de outro perfil → 403', async () => {
    expect((await c(H.prov, U.restrito, { url: '/api/fluxo-provisorios', body: prov('pv_x', 'conta_b') })).statusCode).toBe(403)
    expect(await um("SELECT id FROM fluxo_provisorios WHERE id = 'pv_x'")).toBeUndefined()
  })
  it('editar provisório de outro perfil, mesmo trocando para a própria conta → 403', async () => {
    const r = await c(H.prov, U.restrito, { method: 'PUT', url: '/api/fluxo-provisorios', body: { ...prov('pv_b', 'conta_a'), amount: 999 } })
    expect(r.statusCode).toBe(403)
    expect(await um("SELECT account_id, amount FROM fluxo_provisorios WHERE id = 'pv_b'")).toMatchObject({ account_id: 'conta_b' })
  })
  it('levar o próprio provisório para conta de outro perfil → 403', async () => {
    expect((await c(H.prov, U.restrito, { method: 'PUT', url: '/api/fluxo-provisorios', body: prov('pv_a', 'conta_b') })).statusCode).toBe(403)
  })
  it('excluir e efetivar provisório de outro perfil → 403, continua lá e nenhum agendamento criado', async () => {
    expect((await c(H.prov, U.restrito, { method: 'DELETE', url: '/api/fluxo-provisorios?id=pv_b' })).statusCode).toBe(403)
    expect((await c(H.prov, U.restrito, { url: '/api/fluxo-provisorios?acao=efetivar', body: { id: 'pv_b' } })).statusCode).toBe(403)
    expect(await um("SELECT id FROM fluxo_provisorios WHERE id = 'pv_b'")).toBeTruthy()
    expect(await um("SELECT id FROM agendamentos WHERE id = 'sch_prov_pv_b'")).toBeUndefined()
  })
  it('o próprio perfil continua funcionando', async () => {
    expect((await c(H.prov, U.restrito, { method: 'PUT', url: '/api/fluxo-provisorios', body: { ...prov('pv_a', 'conta_a'), amount: 12 } })).statusCode).toBe(200)
    expect((await c(H.prov, U.restrito, { url: '/api/fluxo-provisorios?acao=efetivar', body: { id: 'pv_a' } })).statusCode).toBe(200)
  })
})

describe('reserve-adjustments e reserve-periods', () => {
  it('ajuste: criar em função de outro perfil, mover para ela, editar e excluir o dela → 403', async () => {
    const novo = { id: 'aj_x', function_id: 'rf_b', data: '2026-10-02', valor: 1 }
    expect((await c(H.ajustes, U.restrito, { url: '/api/reserve-adjustments', body: novo })).statusCode).toBe(403)
    expect((await c(H.ajustes, U.restrito, { url: '/api/reserve-adjustments', body: { ...novo, id: 'aj_a' } })).statusCode).toBe(403)
    expect((await c(H.ajustes, U.restrito, { url: '/api/reserve-adjustments', body: { ...novo, id: 'aj_b', function_id: 'rf_a' } })).statusCode).toBe(403)
    expect((await c(H.ajustes, U.restrito, { method: 'PUT', url: '/api/reserve-adjustments', body: { id: 'aj_b', valor: 999 } })).statusCode).toBe(403)
    expect((await c(H.ajustes, U.restrito, { method: 'DELETE', url: '/api/reserve-adjustments?id=aj_b' })).statusCode).toBe(403)
    expect(await um("SELECT function_id, valor FROM reserve_adjustments WHERE id = 'aj_b'")).toMatchObject({ function_id: 'rf_b' })
    expect(Number((await um("SELECT valor FROM reserve_adjustments WHERE id = 'aj_b'")).valor)).toBe(7)
    expect(await um("SELECT id FROM reserve_adjustments WHERE id = 'aj_x'")).toBeUndefined()
    expect((await um("SELECT function_id FROM reserve_adjustments WHERE id = 'aj_a'")).function_id).toBe('rf_a')
  })
  it('ajuste do próprio perfil → 200', async () => {
    expect((await c(H.ajustes, U.restrito, { method: 'PUT', url: '/api/reserve-adjustments', body: { id: 'aj_a', valor: 6 } })).statusCode).toBe(200)
  })
  it('saldo inicial: criar, mover e excluir em função de outro perfil → 403', async () => {
    const novo = { id: 'pe_x', function_id: 'rf_b', data_inicio: '2026-02-01', saldo_inicial: 1 }
    expect((await c(H.periodos, U.restrito, { url: '/api/reserve-periods', body: novo })).statusCode).toBe(403)
    expect((await c(H.periodos, U.restrito, { url: '/api/reserve-periods', body: { ...novo, id: 'pe_b', function_id: 'rf_a' } })).statusCode).toBe(403)
    expect((await c(H.periodos, U.restrito, { method: 'DELETE', url: '/api/reserve-periods?id=pe_b' })).statusCode).toBe(403)
    expect((await um("SELECT function_id FROM reserve_periods WHERE id = 'pe_b'")).function_id).toBe('rf_b')
    expect(await um("SELECT id FROM reserve_periods WHERE id = 'pe_x'")).toBeUndefined()
  })
})

describe('integridade (aceitar saldo, ignorar, reabrir, resolver)', () => {
  beforeAll(async () => {
    prepararChamadas(amb)
    await c(H.integridade, U.admin, { method: 'GET', url: '/api/integridade?resumo=1' }) // cria a tabela
    vi.restoreAllMocks()
    await amb.q(`INSERT INTO pendencias_integridade (id, regra, severidade, origem_id, conta_id, descricao, status) VALUES
      ('pd_b', 'R_X', 'auto', 'l_b', 'conta_b', 'B', 'pendente'),
      ('pd_a', 'R_X', 'auto', 'l_a', 'conta_a', 'A', 'pendente'),
      ('pd_sb', 'GER_SALDO_SUBCONTA', 'aprovar', 'conta_b', NULL, 'saldo B', 'pendente')`)
  })
  it('pendência de conta de outro perfil → 403 e o status não muda', async () => {
    for (const action of ['ignorar', 'reabrir', 'resolver']) {
      expect((await c(H.integridade, U.restrito, { url: '/api/integridade', body: { action, id: 'pd_b' } })).statusCode).toBe(403)
    }
    expect((await c(H.integridade, U.restrito, { url: '/api/integridade', body: { action: 'aceitar_saldo', id: 'pd_sb', motivo: 'x' } })).statusCode).toBe(403)
    expect((await um("SELECT status FROM pendencias_integridade WHERE id = 'pd_b'")).status).toBe('pendente')
    expect((await um("SELECT count(*)::int n FROM marcos_saldo_gerencial WHERE conta_id = 'conta_b'")).n).toBe(0)
  })
  it('pendência do próprio perfil → 200', async () => {
    expect((await c(H.integridade, U.restrito, { url: '/api/integridade', body: { action: 'ignorar', id: 'pd_a' } })).statusCode).toBe(200)
  })
})

describe('sync-srf', () => {
  it('linha enviada que já é de agendamento de outro perfil → 403, a linha continua dele', async () => {
    const r = await c(H.srf, U.restrito, { url: '/api/sync-srf', body: { scheduleId: 'ag_a', rows: [{ id: 'srf_a1', schedule_id: 'ag_a' }, { id: 'srf_b1', schedule_id: 'ag_a' }] } })
    expect(r.statusCode).toBe(403)
    expect((await um("SELECT schedule_id FROM schedule_reserva_funcoes WHERE id = 'srf_b1'")).schedule_id).toBe('ag_b')
  })
  it('o schedule_id da linha é sempre o da chamada (o do corpo é ignorado)', async () => {
    const r = await c(H.srf, U.restrito, { url: '/api/sync-srf', body: { scheduleId: 'ag_a', rows: [{ id: 'srf_a1', schedule_id: 'ag_b' }, { id: 'srf_a2', schedule_id: 'ag_b' }] } })
    expect(r.statusCode).toBe(200)
    expect((await amb.q("SELECT id, schedule_id FROM schedule_reserva_funcoes WHERE id IN ('srf_a1', 'srf_a2') ORDER BY id")).map(x => x.schedule_id)).toEqual(['ag_a', 'ag_a'])
    expect((await um("SELECT count(*)::int n FROM schedule_reserva_funcoes WHERE schedule_id = 'ag_b'")).n).toBe(1)
  })
  it('agendamento de outro perfil → 403', async () => {
    expect((await c(H.srf, U.restrito, { url: '/api/sync-srf', body: { scheduleId: 'ag_b', rows: [] } })).statusCode).toBe(403)
  })
})
