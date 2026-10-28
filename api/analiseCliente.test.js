import process from 'node:process'
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import jwt from 'jsonwebtoken'
import { SQL_CENTRAL, usarBancos } from './_testes/pglite.js'
import { _definirFabricaDePool } from './_conexao.js'
import { DDL_PLATAFORMA } from './_plataforma.js'
import { periodoDoMes, mesFinanceiroAtual, analisarBanco, SQL_GRUPOS } from './_analiseCliente.js'

// Análise do Cliente: regra de receita/despesa (a do Painel), período pelo dia de início do cliente,
// privacidade (nada individual sai) e a trava de acesso, com o _db.js de verdade sobre PGlite
// (central + ambiente principal + banco do cliente).

const { default: handler } = await import('./admin/analise-cliente.js')

const SECRET = 'segredo-de-teste'
const MIGRACAO = ['2026-10-14_usuarios.sql', '2026-10-17_niveis_acesso.sql', '2026-10-22_token_versao.sql']
  .map(f => readFileSync(fileURLToPath(new URL(`../supabase/migrations/${f}`, import.meta.url)), 'utf-8')).join('\n')

const TABELAS_CLIENTE = `
  CREATE TABLE configuracoes (id INT PRIMARY KEY, financial_month_start_day INT, financial_month_mode TEXT);
  CREATE TABLE reserve_functions (id TEXT PRIMARY KEY, exibir_como_despesa BOOLEAN, category_id TEXT);
  CREATE TABLE perfis (id TEXT PRIMARY KEY, name TEXT, type TEXT, document TEXT);
  CREATE TABLE categorias (id TEXT PRIMARY KEY, name TEXT, icon TEXT);
  CREATE TABLE contas (id TEXT PRIMARY KEY, name TEXT, apelido TEXT, bank TEXT, balance NUMERIC, type TEXT,
    active BOOLEAN DEFAULT true, is_reserva BOOLEAN DEFAULT false, profile_id TEXT, updated_at TIMESTAMPTZ);
  CREATE TABLE lancamentos (id TEXT PRIMARY KEY, type TEXT, date TEXT, amount NUMERIC, description TEXT, payee TEXT,
    notes TEXT, account_id TEXT, to_account_id TEXT, category_id TEXT, reserva_auto BOOLEAN, reserva_funcao_id TEXT,
    origin TEXT, created_at TIMESTAMPTZ DEFAULT '2026-10-25 12:00:00+00');
  INSERT INTO configuracoes VALUES (1, 15, 'custom');
  INSERT INTO reserve_functions VALUES ('f_poup', false, NULL), ('f_ipva', true, 'c_ipva');
  INSERT INTO perfis VALUES ('pf', 'Maria', 'pf', '529.982.247-25'), ('pj', 'Loja da Maria', 'pj', '11.222.333/0001-81');
  INSERT INTO categorias VALUES ('c_merc', 'Mercado', '🛒'), ('c_comb', 'Combustível', '⛽'), ('c_ipva', 'IPVA', '🚗');
  INSERT INTO contas VALUES
    ('cc', 'Conta Corrente Itaú', NULL, 'Itaú', 1500, 'checking', true, false, 'pf', '2026-10-27 10:00:00+00'),
    ('pj1', 'Conta PJ', 'PJ Inter', 'Inter', 3000, 'checking', true, false, 'pj', NULL),
    ('poup', 'Poupança', NULL, 'Caixa', 200, 'savings', true, true, 'pf', '2026-10-20 10:00:00+00'),
    ('velha', 'Conta antiga', NULL, 'BB', 99999, 'checking', false, false, 'pf', NULL),
    ('cartao', 'Cartão Nubank', NULL, 'Nubank', -800, 'credit', true, false, 'pf', NULL),
    ('inv', 'CDB', NULL, 'XP', 50000, 'investment', true, false, 'pf', NULL);
  INSERT INTO lancamentos (id, type, date, amount, description, payee, notes, account_id, to_account_id, category_id, reserva_auto, reserva_funcao_id, origin) VALUES
    ('r1', 'income', '2026-10-20', 10000, 'Salário outubro', 'Lumen', 'SEGREDO-NOTA', 'cc', NULL, NULL, NULL, NULL, 'manual'),
    ('r0', 'income', '2026-10-14', 500, 'Fora do período', 'Lumen', NULL, 'cc', NULL, NULL, NULL, NULL, 'manual'),
    ('r2', 'income', '2026-11-01', 200, 'Pix', NULL, NULL, 'cc', NULL, NULL, NULL, NULL, 'manual'),
    ('r3', 'income', '2026-10-21', 999, 'Rendimento', 'XP', NULL, 'inv', NULL, NULL, NULL, NULL, 'invest_auto'),
    ('d1', 'expense', '2026-10-16', 300, 'Descrição secreta', 'Extra', NULL, 'cc', NULL, 'c_merc', NULL, NULL, 'manual'),
    ('d2', 'expense', '2026-11-14', 200, 'Compra no cartão', 'Extra', NULL, 'cartao', NULL, 'c_merc', NULL, NULL, 'importacao_fatura'),
    ('d3', 'expense', '2026-10-30', 100, 'Gasolina', 'Posto', NULL, 'cc', NULL, 'c_comb', NULL, NULL, 'manual'),
    ('d4', 'expense', '2026-10-31', 50, 'Remédio', 'Farmácia', NULL, 'cc', NULL, NULL, NULL, NULL, 'manual'),
    ('d5', 'expense', '2026-11-15', 400, 'Fora do período', 'Extra', NULL, 'cc', NULL, 'c_merc', NULL, NULL, 'manual'),
    ('t1', 'transfer', '2026-10-18', 1000, 'Entre contas', NULL, NULL, 'cc', 'pj1', NULL, NULL, NULL, 'manual'),
    ('t2', 'transfer', '2026-10-19', 500, 'Pagamento fatura', NULL, NULL, 'cc', 'cartao', NULL, NULL, NULL, 'agendamento'),
    ('t3', 'credit_payment', '2026-10-19', 400, 'Pagamento fatura', NULL, NULL, 'cartao', NULL, NULL, NULL, NULL, 'manual'),
    ('t4', 'transfer', '2026-10-22', 700, 'Entre perfis', NULL, NULL, 'pj1', 'cc', NULL, NULL, NULL, 'manual'),
    ('s1', 'expense', '2026-10-23', 80, 'Reserva: Poupança', NULL, NULL, NULL, NULL, NULL, true, 'f_poup', 'reserva_auto'),
    ('s2', 'transfer', '2026-10-24', 60, 'Reserva IPVA', NULL, NULL, 'cc', 'poup', 'c_ipva', NULL, 'f_ipva', 'manual');
`

const bancos = {}
const q = (nome) => async (sql, params = []) => (await bancos[nome].query(sql, params)).rows

beforeAll(async () => {
  bancos.central = new PGlite()
  await bancos.central.exec(SQL_CENTRAL)
  await bancos.central.exec(DDL_PLATAFORMA)
  await bancos.central.exec(`
    UPDATE ambientes SET database_name = 'banco_vm' WHERE sigla = 'vm';
    INSERT INTO plataforma_clientes (id, nome, email, sigla, status, empresa) VALUES
      ('cli-a', 'Maria', 'maria@x.com', 'aa', 'ativo', 'Loja da Maria'),
      ('cli-s', 'Sem banco', 's@x.com', 'ss', 'ativo', NULL),
      ('cli-p', 'Parado', 'p@x.com', 'pp', 'suspenso', NULL);
    INSERT INTO ambientes (id, sigla, nome, database_name, status, cliente_id) VALUES
      ('amb-a', 'aa', 'Cliente A', 'banco_a', 'ativo', 'cli-a'),
      ('amb-s', 'ss', 'Sem banco', 'banco_inexistente', 'ativo', 'cli-s'),
      ('amb-p', 'pp', 'Parado', 'banco_p', 'suspenso', 'cli-p');`)
  bancos.banco_vm = new PGlite()
  await bancos.banco_vm.exec(MIGRACAO + "INSERT INTO usuarios (id, username, nome, email, senha_hash, nivel) VALUES ('adm', 'vmoreira', 'V', 'v@t.local', 'x', 'admin'), ('outro', 'gislaine', 'G', 'g@t.local', 'x', 'admin')")
  bancos.banco_a = new PGlite()
  await bancos.banco_a.exec(MIGRACAO + TABELAS_CLIENTE + "INSERT INTO usuarios (id, username, nome, email, senha_hash, nivel) VALUES ('adm', 'vmoreira', 'V', 'v@t.local', 'x', 'admin')")
}, 120_000)

let envOriginal
beforeEach(async () => {
  envOriginal = { ...process.env }
  process.env.JWT_SECRET = SECRET
  process.env.PLATAFORMA_ADMIN = 'vmoreira'
  usarBancos({ central: bancos.central, banco_vm: bancos.banco_vm, banco_a: bancos.banco_a })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { process.env = envOriginal; vi.restoreAllMocks() })
afterAll(() => { _definirFabricaDePool(null) })

const ambVm = async () => (await q('central')("SELECT id FROM ambientes WHERE sigla = 'vm'"))[0].id
const tokenDe = (sub, username, amb, amb_sigla) => jwt.sign({ sub, org: 'org1', nivel: 'admin', username, origem: 'db', amb, amb_sigla }, SECRET, { expiresIn: '1h' })
async function chamar({ url, auth, host = 'www.finup.app.br', method = 'GET' }) {
  const res = {
    statusCode: 200, body: undefined,
    status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this }, end() { return this }, setHeader() {},
  }
  const headers = { host }
  if (auth) headers.authorization = `Bearer ${auth}`
  await handler({ method, url, headers }, res)
  return res
}
const historico = () => q('central')("SELECT cliente_id, evento, detalhe, autor FROM plataforma_historico WHERE evento = 'analise_acesso' ORDER BY created_at")

describe('período do mês financeiro', () => {
  it('dia de início 15: "2026-10" = 15/10 a 14/11; calendário = mês cheio', () => {
    expect(periodoDoMes('2026-10', 15, 'custom')).toEqual({ inicio: '2026-10-15', fim: '2026-11-14' })
    expect(periodoDoMes('2026-12', 15, 'custom')).toEqual({ inicio: '2026-12-15', fim: '2027-01-14' })
    expect(periodoDoMes('2026-02', 1, 'custom')).toEqual({ inicio: '2026-02-01', fim: '2026-02-28' })
    expect(periodoDoMes('2026-10', 15, 'calendar')).toEqual({ inicio: '2026-10-01', fim: '2026-10-31' })
  })
  it('mês atual: antes do dia de início ainda é o mês anterior', () => {
    expect(mesFinanceiroAtual('2026-10-28', 15, 'custom')).toBe('2026-10')
    expect(mesFinanceiroAtual('2026-11-10', 15, 'custom')).toBe('2026-10')
    expect(mesFinanceiroAtual('2026-01-05', 15, 'custom')).toBe('2025-12')
    expect(mesFinanceiroAtual('2026-11-10', 15, 'calendar')).toBe('2026-11')
  })
})

describe('análise do banco (regra do Painel)', () => {
  let a
  beforeAll(async () => { a = await analisarBanco(q('banco_a'), { mes: '2026-10', hoje: '2026-10-28' }) })

  it('receita e despesa sem transferências, fatura, entre perfis, reserva-poupança e investimento', () => {
    expect(a.periodo).toEqual({ inicio: '2026-10-15', fim: '2026-11-14' })
    expect(a.receita).toBe(10200)
    // 300 + 200 (cartão, último dia) + 100 + 50 + 60 (depósito em reserva marcada como despesa)
    expect(a.despesa).toBe(710)
    expect(a.resultado).toBe(9490)
  })

  it('favorecidos: top de receita e de despesa com %, sem favorecido à parte', () => {
    expect(a.favorecidosReceita).toEqual([{ nome: 'Lumen', total: 10000, pct: 98.04 }])
    expect(a.favorecidosDespesa).toEqual([
      { nome: 'Extra', total: 500, pct: 70.42 }, { nome: 'Posto', total: 100, pct: 14.08 }, { nome: 'Farmácia', total: 50, pct: 7.04 },
    ])
    expect(a.semFavorecido).toEqual({ receita: 200, despesa: 60 })
  })

  it('categorias de despesa do maior para o menor, com %', () => {
    expect(a.categorias.map(c => [c.nome, c.total, c.pct])).toEqual([
      ['Mercado', 500, 70.42], ['Combustível', 100, 14.08], ['IPVA', 60, 8.45], ['Sem categoria', 50, 7.04],
    ])
  })

  it('contas: corrente e poupança ativas, pelo maior saldo, com perfil CPF/CNPJ (sem documento) e data', () => {
    expect(a.contas.map(c => [c.nome, c.banco, c.perfil, c.perfilTipo, c.saldo])).toEqual([
      ['PJ Inter', 'Inter', 'Loja da Maria', 'CNPJ', 3000],
      ['Conta Corrente Itaú', 'Itaú', 'Maria', 'CPF', 1500],
      ['Poupança', 'Caixa', 'Maria', 'CPF', 200],
    ])
    expect(a.totalContas).toBe(4700)
    expect(new Date(a.contas[1].atualizadoEm).toISOString()).toBe('2026-10-27T10:00:00.000Z')
    expect(a.contas[0].atualizadoEm).toBeNull()
    expect(new Date(a.saldoReferencia).toISOString()).toBe('2026-10-25T12:00:00.000Z')
  })

  it('nada individual sai: sem descrição, observação, documento ou id de lançamento', () => {
    const json = JSON.stringify(a)
    for (const s of ['SEGREDO-NOTA', 'Descrição secreta', 'Salário outubro', '529.982', '11.222', '"d1"', '"r1"']) expect(json).not.toContain(s)
    expect(SQL_GRUPOS).toMatch(/GROUP BY/)
  })

  it('sem mês → mês financeiro atual do cliente', async () => {
    expect((await analisarBanco(q('banco_a'), { mes: null, hoje: '2026-11-10' })).mes).toBe('2026-10')
  })
})

describe('GET /api/admin/analise-cliente', () => {
  it('admin da plataforma no www: 200 e o acesso fica no histórico', async () => {
    const antes = (await historico()).length
    const r = await chamar({ url: '/api/admin/analise-cliente?cliente=aa&mes=2026-10', auth: tokenDe('adm', 'vmoreira', await ambVm(), 'vm') })
    expect(r.statusCode).toBe(200)
    expect(r.body).toMatchObject({ cliente: { nome: 'Loja da Maria', sigla: 'aa' }, mes: '2026-10', receita: 10200, despesa: 710 })
    const h = await historico()
    expect(h.length).toBe(antes + 1)
    expect(h.at(-1)).toMatchObject({ cliente_id: 'cli-a', evento: 'analise_acesso', autor: 'vmoreira' })
    expect(h.at(-1).detalhe).toContain('2026-10')
  })

  it('outro usuário admin, ou o admin fora do www → 403, sem registrar acesso', async () => {
    const antes = (await historico()).length
    const outro = await chamar({ url: '/api/admin/analise-cliente?cliente=aa', auth: tokenDe('outro', 'gislaine', await ambVm(), 'vm') })
    expect(outro.statusCode).toBe(403)
    const noCliente = await chamar({ url: '/api/admin/analise-cliente?cliente=aa', host: 'aa.finup.app.br', auth: tokenDe('adm', 'vmoreira', 'amb-a', 'aa') })
    expect(noCliente.statusCode).toBe(403)
    expect((await chamar({ url: '/api/admin/analise-cliente?cliente=aa' })).statusCode).toBe(401)
    expect((await historico()).length).toBe(antes)
  })

  it('entradas inválidas, cliente inexistente/principal/suspenso', async () => {
    const t = tokenDe('adm', 'vmoreira', await ambVm(), 'vm')
    expect((await chamar({ url: "/api/admin/analise-cliente?cliente=a'a", auth: t })).statusCode).toBe(400)
    expect((await chamar({ url: '/api/admin/analise-cliente?cliente=aa&mes=2026-13', auth: t })).statusCode).toBe(400)
    expect((await chamar({ url: '/api/admin/analise-cliente?cliente=zz', auth: t })).statusCode).toBe(404)
    expect((await chamar({ url: '/api/admin/analise-cliente?cliente=vm', auth: t })).statusCode).toBe(404)
    expect((await chamar({ url: '/api/admin/analise-cliente?cliente=pp', auth: t })).statusCode).toBe(409)
    expect((await chamar({ method: 'POST', url: '/api/admin/analise-cliente?cliente=aa', auth: t })).statusCode).toBe(405)
  })

  it('banco do cliente indisponível → 502 com código, e o acesso fica registrado', async () => {
    const antes = (await historico()).length
    const r = await chamar({ url: '/api/admin/analise-cliente?cliente=ss', auth: tokenDe('adm', 'vmoreira', await ambVm(), 'vm') })
    expect(r.statusCode).toBe(502)
    expect(r.body.codigo).toBe('banco_cliente')
    expect((await historico()).length).toBe(antes + 1)
  })
})
