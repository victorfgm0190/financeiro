import process from 'node:process'
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import jwt from 'jsonwebtoken'
import { SQL_CENTRAL, usarBancos } from './_testes/pglite.js'
import { _definirFabricaDePool } from './_conexao.js'
import { recortarLancamentos } from './_permissoesApi.js'
import { rowToTx } from '../src/lib/db.js'
import { lancamentoNasContas } from '../src/lib/origins.js'

// Troca de bens entre perfis, de ponta a ponta: registra a entrada no endpoint real, lê como o /api/load
// e confere o perfil do lançamento de perda. O resultado é do bem VENDIDO; nada de coluna nova.

const { default: registrarEntrada } = await import('./bem/[id]/registrar-entrada.js')
const { default: load } = await import('./load.js')

const SECRET = 'segredo-de-teste'
const raiz = fileURLToPath(new URL('../supabase/', import.meta.url))
const SQL = readFileSync(raiz + 'estrutura_base.sql', 'utf-8') + '\n' + readdirSync(raiz + 'migrations').filter(f => f.endsWith('.sql')).sort()
  .map(f => readFileSync(raiz + 'migrations/' + f, 'utf-8')).join('\n')

let central, banco, ambId
const q = async (sql, p) => (await banco.query(sql, p)).rows

beforeAll(async () => {
  central = new PGlite()
  await central.exec(SQL_CENTRAL)
  await central.exec("UPDATE ambientes SET database_name = 'banco_vm' WHERE sigla = 'vm'")
  ambId = (await central.query("SELECT id FROM ambientes WHERE sigla = 'vm'")).rows[0].id
}, 180_000)

beforeEach(async () => {
  banco = new PGlite()
  await banco.exec(SQL)
  await banco.exec(`
    INSERT INTO usuarios (id, username, nome, email, senha_hash, nivel) VALUES ('u1', 'admin', 'Admin', 'admin@teste.local', 'x', 'admin');
    INSERT INTO perfis (id, name, type) VALUES ('pa', 'Perfil A', 'pf'), ('pb', 'Perfil B', 'pj');
    INSERT INTO categorias (id, name, type) VALUES ('perda', 'Perda de capital', 'expense'), ('ganho', 'Ganho de capital', 'income');
    INSERT INTO contas (id, name, type, balance, initial_balance, profile_id, valor_nota_fiscal, categoria_perda_bem_id, categoria_ganho_bem_id) VALUES
      ('bem_vendido', 'Carro antigo', 'asset', 80000, 80000, 'pa', 80000, 'perda', 'ganho'),
      ('bem_novo', 'Carro novo', 'asset', 100000, 100000, 'pb', 100000, 'perda', 'ganho');`)
  usarBancos({ central, banco_vm: () => banco })
  process.env.JWT_SECRET = SECRET
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
}, 120_000)
afterEach(() => { vi.restoreAllMocks() })
afterAll(() => { _definirFabricaDePool(null) })

const token = (perfis = 'todos') => jwt.sign({ sub: 'u1', org: 'o1', nivel: 'admin', permissoes: {}, perfis, username: 'admin', origem: 'db', amb: ambId, amb_sigla: 'vm' }, SECRET)
const chamar = async (handler, { method = 'GET', url, body, query = {}, tk = token() }) => {
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this }, end() { return this }, setHeader() {} }
  await handler({ method, url, body, query, headers: { host: 'www.finup.app.br', authorization: `Bearer ${tk}` } }, res)
  return res
}
const trocar = (valor = 60000) => chamar(registrarEntrada, {
  method: 'POST', url: '/api/bem/bem_novo/registrar-entrada', query: { id: 'bem_novo' },
  body: { data: '2026-08-07', transferencias: [{ bem_origem_id: 'bem_vendido', valor }] },
})
const PERFIL_A = new Set(['bem_vendido'])
const PERFIL_B = new Set(['bem_novo'])
const doLoad = async (tk) => {
  const r = await chamar(load, { url: '/api/load', tk })
  expect(r.statusCode).toBe(200)
  return (r.body.txs || r.body.transactions || r.body.lancamentos).map(rowToTx).filter(t => t.origin === 'patrimonio_auto')
}

describe('troca de bens entre perfis', () => {
  it('perda: fica no perfil do bem VENDIDO, com bem_id no bem novo e sem nada gravado a mais', async () => {
    const r = await trocar()
    expect(r.statusCode).toBe(200)
    const [gravado] = await q("SELECT * FROM lancamentos WHERE origin = 'patrimonio_auto'")
    expect(gravado.bem_id).toBe('bem_novo')
    expect(gravado).not.toHaveProperty('bem_vendido_id')
    const [tx] = await doLoad()
    expect(tx.type).toBe('expense')
    expect(tx.bemId).toBe('bem_novo')
    expect(tx.bemVendidoId).toBe('bem_vendido')
    expect(lancamentoNasContas(tx, PERFIL_A)).toBe(true)
    expect(lancamentoNasContas(tx, PERFIL_B)).toBe(false)
  }, 90_000)

  it('ganho: mesma regra', async () => {
    await trocar(90000)
    const [tx] = await doLoad()
    expect(tx.type).toBe('income')
    expect(lancamentoNasContas(tx, PERFIL_A)).toBe(true)
    expect(lancamentoNasContas(tx, PERFIL_B)).toBe(false)
  }, 90_000)

  it('usuário restrito: vê no perfil do bem vendido, não no do bem novo', async () => {
    await trocar()
    expect(await doLoad(token(['pa']))).toHaveLength(1)
    expect(await doLoad(token(['pb']))).toHaveLength(0)
    const rows = await q("SELECT * FROM lancamentos WHERE origin = 'patrimonio_auto'")
    expect(await recortarLancamentos(q, { perfis: ['pa'] }, rows.map(x => ({ ...x })))).toHaveLength(1)
    expect(await recortarLancamentos(q, { perfis: ['pb'] }, rows.map(x => ({ ...x })))).toHaveLength(0)
  }, 180_000)

  it('sem movimentação (lançamento antigo solto): vale o bem ligado; sem nenhum, nenhum perfil', async () => {
    await banco.exec(`INSERT INTO lancamentos (id, type, amount, date, origin, bem_id) VALUES
      ('solto', 'expense', 10, '2026-08-07', 'patrimonio_auto', 'bem_novo'), ('sem_bem', 'expense', 10, '2026-08-07', 'patrimonio_auto', NULL)`)
    const txs = await doLoad()
    const por = Object.fromEntries(txs.map(t => [t.id, t]))
    expect(por.solto.bemVendidoId).toBeNull()
    expect(lancamentoNasContas(por.solto, PERFIL_B)).toBe(true)
    expect(lancamentoNasContas(por.sem_bem, PERFIL_A)).toBe(false)
    expect(lancamentoNasContas(por.sem_bem, PERFIL_B)).toBe(false)
  }, 90_000)
})
