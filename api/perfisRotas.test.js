import process from 'node:process'
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import jwt from 'jsonwebtoken'
import { SQL_CENTRAL, usarBancos } from './_testes/pglite.js'
import { _definirFabricaDePool } from './_conexao.js'
import { _limparCacheSessoes } from './_sessao.js'

// PERFIS PERMITIDOS fora do /api/sync (GRAFITY B3/B4): as rotas que recebem ids gravam e leem só
// as linhas das contas dos perfis do usuário. Handlers e _db.js de verdade (PGlite), com a sessão
// conferida pelo comAmbiente. Usuário "Lumen" = operador restrito ao perfil prf_l (conta cora);
// o perfil prf_v (conta itau) é de outra pessoa.

const H = {
  bulk: (await import('./transactions-bulk-update.js')).default,
  agendamentos: (await import('./agendamentos.js')).default,
  rateios: (await import('./lancamento-rateios.js')).default,
  srf: (await import('./sync-srf.js')).default,
  historico: (await import('./transaction-history.js')).default,
  fatura: (await import('./fatura-conferencia.js')).default,
  transfs: (await import('./transferencias-executadas.js')).default,
  rft: (await import('./reserve-function-transactions.js')).default,
}

const SECRET = 'segredo-de-teste'
const raiz = fileURLToPath(new URL('../supabase/', import.meta.url))
const ESTRUTURA = readFileSync(raiz + 'estrutura_base.sql', 'utf-8')
const MIGRACOES = readdirSync(raiz + 'migrations').filter(f => f.endsWith('.sql')).sort()
  .map(f => readFileSync(raiz + 'migrations/' + f, 'utf-8')).join('\n')

let central
let banco
let AMB
const q = async (sql, p = []) => (await banco.query(sql, p)).rows

beforeAll(async () => {
  central = new PGlite()
  await central.exec(SQL_CENTRAL)
  await central.exec("UPDATE ambientes SET database_name = 'banco_vm' WHERE sigla = 'vm'")
  AMB = (await central.query("SELECT id FROM ambientes WHERE sigla = 'vm'")).rows[0].id
  banco = new PGlite()
  await banco.exec(ESTRUTURA + '\n' + MIGRACOES)
  await banco.exec(`
    INSERT INTO usuarios (id, username, nome, email, senha_hash, nivel) VALUES
      ('u_admin', 'admin', 'Admin', 'a@t.local', 'x', 'admin'), ('u_lumen', 'lumen', 'Lumen', 'l@t.local', 'x', 'operador');
    INSERT INTO perfis (id, name) VALUES ('prf_v', 'Victor'), ('prf_l', 'Lumen');
    INSERT INTO contas (id, name, type, profile_id) VALUES ('itau', 'Itaú', 'checking', 'prf_v'), ('cora', 'Cora', 'checking', 'prf_l'),
      ('cart_v', 'Cartão V', 'credit', 'prf_v'), ('res_l', 'Reserva L', 'checking', 'prf_l');
    INSERT INTO reserve_functions (id, name, account_id) VALUES ('rf_v', 'Função V', 'itau'), ('rf_l', 'Função L', 'res_l');
    INSERT INTO lancamentos (id, type, amount, date, account_id, to_account_id, description, category_id, reserva_funcao_id, schedule_id) VALUES
      ('t_v', 'expense', 10, '2026-10-01', 'itau', NULL, 'Mercado Central', 'c1', NULL, NULL),
      ('t_l', 'expense', 20, '2026-10-02', 'cora', NULL, 'Mercado Central', 'c1', NULL, NULL),
      ('tr_v', 'transfer', 30, '2026-10-03', 'itau', 'itau', 'Transf V', NULL, 'rf_v', 'a_v'),
      ('tr_l', 'transfer', 40, '2026-10-03', 'cora', 'res_l', 'Transf L', NULL, 'rf_l', 'a_l'),
      ('cv1', 'expense', 50, '2026-10-04', 'cart_v', NULL, 'Compra', NULL, NULL, NULL);
    UPDATE lancamentos SET fatura_month_year = '2026-10' WHERE id = 'cv1';
    INSERT INTO agendamentos (id, description, transaction_type, amount, frequency, start_date, account_id) VALUES
      ('a_v', 'Ag V', 'expense', 1, 'monthly', '2026-10-01', 'itau'), ('a_l', 'Ag L', 'expense', 1, 'monthly', '2026-10-01', 'cora');
  `)
  // Detalhamento: 10 linhas do a_l e 2 do a_v (apagar as 10 = mais de 20% da tabela → trava).
  for (let i = 0; i < 10; i++) await q('INSERT INTO schedule_reserva_funcoes (id, schedule_id) VALUES ($1, $2)', [`s_l${i}`, 'a_l'])
  for (let i = 0; i < 2; i++) await q('INSERT INTO schedule_reserva_funcoes (id, schedule_id) VALUES ($1, $2)', [`s_v${i}`, 'a_v'])
}, 180_000)

let envOriginal
beforeEach(() => {
  envOriginal = { ...process.env }
  process.env.JWT_SECRET = SECRET
  usarBancos({ central, banco_vm: banco })
  _limparCacheSessoes()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { process.env = envOriginal; vi.restoreAllMocks() })
afterAll(() => { _definirFabricaDePool(null) })

const LUMEN = { sub: 'u_lumen', nivel: 'operador', perfis: ['prf_l'], username: 'lumen' }
const ADMIN = { sub: 'u_admin', nivel: 'admin', perfis: 'todos', username: 'admin' }
async function chamar(handler, quem, { method = 'POST', url = '/api/x', body } = {}) {
  const res = {
    statusCode: 200, body: undefined, headers: {},
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
    end() { return this },
    setHeader(k, v) { this.headers[k] = v },
  }
  const tk = jwt.sign({ ...quem, org: 'o1', permissoes: {}, origem: 'db', amb: AMB, amb_sigla: 'vm' }, SECRET)
  await handler({ method, url, body, query: Object.fromEntries(new URL(url, 'http://x').searchParams), headers: { host: 'www.finup.app.br', authorization: `Bearer ${tk}` } }, res)
  return res
}

describe('gravações por ids (B3): perfil não permitido → 403, nada gravado', () => {
  it('transactions-bulk-update', async () => {
    const r = await chamar(H.bulk, LUMEN, { url: '/api/transactions-bulk-update', body: { ids: ['t_l', 't_v'], categoryId: 'c9' } })
    expect(r.statusCode).toBe(403)
    expect((await q("SELECT id, category_id FROM lancamentos WHERE id IN ('t_v', 't_l') ORDER BY id")).map(x => x.category_id)).toEqual(['c1', 'c1'])
    expect((await chamar(H.bulk, LUMEN, { url: '/api/transactions-bulk-update', body: { ids: ['t_l'], categoryId: 'c9' } })).statusCode).toBe(200)
    expect((await chamar(H.bulk, ADMIN, { url: '/api/transactions-bulk-update', body: { ids: ['t_v', 't_l'], categoryId: 'c1' } })).statusCode).toBe(200)
  })

  it('agendamentos (tipo de documento em massa)', async () => {
    const r = await chamar(H.agendamentos, LUMEN, { method: 'PUT', url: '/api/agendamentos', body: { ids: ['a_v'], tipo_documento_id: null } })
    expect(r.statusCode).toBe(403)
    expect((await chamar(H.agendamentos, LUMEN, { method: 'PUT', url: '/api/agendamentos', body: { ids: ['a_l'], tipo_documento_id: null } })).statusCode).toBe(200)
  })

  it('lancamento-rateios: de lançamento e de agendamento de outro perfil, ler e gravar', async () => {
    for (const id of ['t_v', 'a_v']) {
      expect((await chamar(H.rateios, LUMEN, { url: '/api/lancamento-rateios', body: { lancamentoId: id, rateios: [] } })).statusCode).toBe(403)
      expect((await chamar(H.rateios, LUMEN, { method: 'GET', url: `/api/lancamento-rateios?lancamento_id=${id}` })).statusCode).toBe(403)
    }
    expect((await chamar(H.rateios, LUMEN, { url: '/api/lancamento-rateios', body: { lancamentoId: 't_l', rateios: [] } })).statusCode).toBe(200)
    // Lançamento ainda não sincronizado (id inexistente): não é de ninguém, passa.
    expect((await chamar(H.rateios, LUMEN, { url: '/api/lancamento-rateios', body: { lancamentoId: 'novo', rateios: [] } })).statusCode).toBe(200)
  })

  it('sync-srf: agendamento de outro perfil → 403; exclusão em massa → 409 até confirmar', async () => {
    expect((await chamar(H.srf, LUMEN, { url: '/api/sync-srf', body: { scheduleId: 'a_v', rows: [] } })).statusCode).toBe(403)
    expect((await q("SELECT count(*)::int n FROM schedule_reserva_funcoes WHERE schedule_id = 'a_v'"))[0].n).toBe(2)
    const recusa = await chamar(H.srf, LUMEN, { url: '/api/sync-srf', body: { scheduleId: 'a_l', rows: [] } })
    expect(recusa.statusCode).toBe(409)
    expect(recusa.body).toMatchObject({ codigo: 'exclusao_em_massa', apagar: 10, total: 12 })
    expect((await q("SELECT count(*)::int n FROM schedule_reserva_funcoes WHERE schedule_id = 'a_l'"))[0].n).toBe(10)
    const ok = await chamar(H.srf, LUMEN, { url: '/api/sync-srf', body: { scheduleId: 'a_l', rows: [], confirmarExclusaoEmMassa: true } })
    expect(ok.statusCode).toBe(200)
    expect((await q("SELECT count(*)::int n FROM schedule_reserva_funcoes WHERE schedule_id = 'a_l'"))[0].n).toBe(0)
  })
})

describe('leituras (B4): só as linhas dos perfis permitidos', () => {
  it('transaction-history', async () => {
    const r = await chamar(H.historico, LUMEN, { url: '/api/transaction-history', body: { description: 'Mercado Central' } })
    expect(r.body.transactions.map(t => t.id)).toEqual(['t_l'])
    expect(r.body.transactions[0]).not.toHaveProperty('account_id')
    const a = await chamar(H.historico, ADMIN, { url: '/api/transaction-history', body: { description: 'Mercado Central' } })
    expect(a.body.transactions.map(t => t.id).sort()).toEqual(['t_l', 't_v'])
  })

  it('fatura-conferencia: cartão de outro perfil → 403', async () => {
    expect((await chamar(H.fatura, LUMEN, { url: '/api/fatura-conferencia', body: { accountId: 'cart_v', faturaMonthYear: '2026-10' } })).statusCode).toBe(403)
    const a = await chamar(H.fatura, ADMIN, { url: '/api/fatura-conferencia', body: { accountId: 'cart_v', faturaMonthYear: '2026-10' } })
    expect(a.body).toMatchObject({ despesas: 50, qtd: 1 })
  })

  it('transferencias-executadas', async () => {
    const url = '/api/transferencias-executadas?ids=a_v,a_l&de=2026-10-01&ate=2026-10-31'
    expect((await chamar(H.transfs, LUMEN, { method: 'GET', url })).body.lancamentos.map(t => t.id)).toEqual(['tr_l'])
    expect((await chamar(H.transfs, ADMIN, { method: 'GET', url })).body.lancamentos.map(t => t.id).sort()).toEqual(['tr_l', 'tr_v'])
  })

  it('reserve-function-transactions: função de outro perfil → lista vazia', async () => {
    expect((await chamar(H.rft, LUMEN, { url: '/api/reserve-function-transactions', body: { functionId: 'rf_v' } })).body.transactions).toEqual([])
    expect((await chamar(H.rft, LUMEN, { url: '/api/reserve-function-transactions', body: { functionId: 'rf_l' } })).body.transactions.map(t => t.id)).toEqual(['tr_l'])
  })
})
