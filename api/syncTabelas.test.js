import process from 'node:process'
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import jwt from 'jsonwebtoken'
import { SQL_CENTRAL, usarBancos } from './_testes/pglite.js'
import { _definirFabricaDePool } from './_conexao.js'
import {
  _limparCacheColunasOpcionais, _limparCacheColunasDaTabela, citarIdent, montarUpsertSql, ErroIdentificador,
} from './_db.js'
import { TABELAS_DO_SYNC } from './_syncTrava.js'
import { SECOES_SYNC } from '../src/lib/db.js'

// /api/sync com nome de tabela/coluna vindo do navegador: lista fechada de tabelas, identificadores
// validados e entre aspas, colunas conferidas com as reais. Handler e _db.js de verdade (PGlite).

const { default: syncHandler } = await import('./sync.js')

const SECRET = 'segredo-de-teste'
const raiz = fileURLToPath(new URL('../supabase/', import.meta.url))
const ESTRUTURA = readFileSync(raiz + 'estrutura_base.sql', 'utf-8')
const MIGRACOES = readdirSync(raiz + 'migrations').filter(f => f.endsWith('.sql')).sort()
  .map(f => readFileSync(raiz + 'migrations/' + f, 'utf-8')).join('\n')

let central
let banco
let consultasNoBanco = 0
const q = async (sql, p = []) => (await banco.query(sql, p)).rows

beforeAll(async () => {
  central = new PGlite()
  await central.exec(SQL_CENTRAL)
  await central.exec("UPDATE ambientes SET database_name = 'banco_vm' WHERE sigla = 'vm'")
  banco = new PGlite()
  await banco.exec(ESTRUTURA + '\n' + MIGRACOES)
  await banco.exec("INSERT INTO usuarios (id, username, nome, email, senha_hash, nivel) VALUES ('u_alvo', 'alvo', 'Alvo', 'alvo@teste.local', 'hash-original', 'consulta')")
}, 180_000)

let envOriginal
beforeEach(() => {
  envOriginal = { ...process.env }
  process.env.JWT_SECRET = SECRET
  // Getter contado: cada consulta ao banco do ambiente passa por aqui.
  usarBancos({ central, banco_vm: () => { consultasNoBanco++; return banco } })
  _limparCacheColunasOpcionais()
  _limparCacheColunasDaTabela()
  consultasNoBanco = 0
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { process.env = envOriginal; vi.restoreAllMocks() })
afterAll(() => { _definirFabricaDePool(null) })

function resposta() {
  return {
    statusCode: 200, body: undefined, headers: {},
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
    end() { return this },
    setHeader(k, v) { this.headers[k] = v },
  }
}
const token = async () => {
  const [{ id }] = (await central.query("SELECT id FROM ambientes WHERE sigla = 'vm'")).rows
  return jwt.sign({ sub: 'u1', org: 'o1', nivel: 'admin', permissoes: {}, perfis: 'todos', username: 'admin', origem: 'db', amb: id, amb_sigla: 'vm' }, SECRET)
}
async function sync(body) {
  const res = resposta()
  await syncHandler({ method: 'POST', body, url: '/api/sync', headers: { host: 'www.finup.app.br', authorization: `Bearer ${await token()}` } }, res)
  return res
}
const usuarioIntacto = async () => {
  const [u] = await q("SELECT senha_hash, nivel FROM usuarios WHERE id = 'u_alvo'")
  expect(u).toEqual({ senha_hash: 'hash-original', nivel: 'consulta' })
}

describe('lista fechada de tabelas do /api/sync', () => {
  it('bate com as seções do sync do app (SECOES_SYNC) + de-para Dindin', () => {
    expect([...TABELAS_DO_SYNC].sort()).toEqual([...SECOES_SYNC.map(s => s.tabela), 'account_mapping'].sort())
    for (const t of ['usuarios', 'membros', 'senha_tokens', 'login_bloqueios', 'organizacoes', 'configuracoes', '_migracoes']) {
      expect(TABELAS_DO_SYNC.has(t)).toBe(false)
    }
  })

  it('tabela permitida grava', async () => {
    const r = await sync({ type: 'section', table: 'categorias', upsert: [{ id: 'cat_ok', name: 'Mercado', type: 'expense' }], delete: [] })
    expect(r.statusCode).toBe(200)
    expect(r.body.written.upserted).toBe(1)
    expect(await q("SELECT name FROM categorias WHERE id = 'cat_ok'")).toEqual([{ name: 'Mercado' }])
  })

  it('tabela fora da lista → 400 sem nenhuma consulta ao banco', async () => {
    const r = await sync({ type: 'section', table: 'usuarios', upsert: [{ id: 'u_alvo', senha_hash: 'x', nivel: 'admin' }], delete: [] })
    expect(r.statusCode).toBe(400)
    expect(r.body.codigo).toBe('tabela_nao_permitida')
    expect(consultasNoBanco).toBe(0)
    await usuarioIntacto()
  })

  it('nome de tabela com aspas ou ponto-e-vírgula → 400', async () => {
    for (const table of ['categorias; DROP TABLE usuarios; --', 'categorias"', '"usuarios"', 'public.usuarios', 'Categorias']) {
      const r = await sync({ type: 'section', table, upsert: [{ id: 'x', name: 'y' }], delete: ['u_alvo'] })
      expect(r.statusCode, table).toBe(400)
    }
    expect(consultasNoBanco).toBe(0)
    await usuarioIntacto()
  })

  it('table ausente ou não-texto → 400', async () => {
    expect((await sync({ type: 'section', upsert: [], delete: [] })).statusCode).toBe(400)
    expect((await sync({ type: 'section', table: ['categorias'], upsert: [], delete: [] })).statusCode).toBe(400)
  })
})

describe('colunas conferidas com as reais da tabela', () => {
  it('coluna inexistente → 400 e nada gravado', async () => {
    const r = await sync({ type: 'section', table: 'categorias', upsert: [{ id: 'cat_x', name: 'X', nao_existe: 1 }], delete: [] })
    expect(r.statusCode).toBe(400)
    expect(r.body.error).toMatch(/nao_existe/)
    expect(await q("SELECT id FROM categorias WHERE id = 'cat_x'")).toEqual([])
  })

  it('coluna inexistente só na segunda linha também → 400', async () => {
    const r = await sync({ type: 'section', table: 'categorias', upsert: [{ id: 'cat_y', name: 'Y' }, { id: 'cat_z', name: 'Z', nao_existe: 1 }], delete: [] })
    expect(r.statusCode).toBe(400)
    expect(await q("SELECT id FROM categorias WHERE id IN ('cat_y', 'cat_z')")).toEqual([])
  })

  it('nome de coluna com aspas ou ponto-e-vírgula → 400', async () => {
    for (const col of ['name" = \'x\'; UPDATE usuarios SET nivel = \'admin\'; --', 'name;', 'Name']) {
      const r = await sync({ type: 'section', table: 'categorias', upsert: [{ id: 'cat_w', [col]: 'w' }], delete: [] })
      expect(r.statusCode, col).toBe(400)
    }
    await usuarioIntacto()
  })

  it('_limpar_parcela de lancamentos não é coluna, mas continua aceito', async () => {
    await banco.exec("INSERT INTO contas (id, name, type, balance) VALUES ('c1', 'Corrente', 'checking', 0) ON CONFLICT DO NOTHING")
    const r = await sync({ type: 'section', table: 'lancamentos', delete: [], upsert: [{
      id: 'tx_lp', type: 'expense', account_id: 'c1', amount: 5, date: '2026-10-01', description: 'Teste', _limpar_parcela: false,
    }] })
    expect(r.statusCode).toBe(200)
    expect(await q("SELECT id FROM lancamentos WHERE id = 'tx_lp'")).toHaveLength(1)
  })
})

describe('identificadores no SQL', () => {
  it('citarIdent aceita só nome simples em minúsculas e devolve entre aspas', () => {
    expect(citarIdent('reservas_funcoes')).toBe('"reservas_funcoes"')
    for (const ruim of ['a"b', 'a;b', 'a b', '1a', 'A', '', null, undefined, 'x.y']) {
      expect(() => citarIdent(ruim)).toThrow(ErroIdentificador)
    }
  })

  it('montarUpsertSql cita tabela e colunas, e recusa coluna ou tabela inválida', () => {
    expect(montarUpsertSql('categorias', ['id', 'name'], 1, 'id'))
      .toBe('INSERT INTO "categorias" ("id", "name") VALUES ($1, $2) ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name"')
    expect(() => montarUpsertSql('categorias', ['id', 'x";--'], 1, 'id')).toThrow(ErroIdentificador)
    expect(() => montarUpsertSql('categorias; --', ['id'], 1, 'id')).toThrow(ErroIdentificador)
  })
})
