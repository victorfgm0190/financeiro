import process from 'node:process'
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import jwt from 'jsonwebtoken'
import { SQL_CENTRAL, usarBancos } from './_testes/pglite.js'
import { _definirFabricaDePool } from './_conexao.js'
import { aplicarKitBasico } from './_kitBasico.js'
import { DDL_PLATAFORMA } from './_plataforma.js'

// Ganho/perda de capital nos ambientes: migração sem duplicar, ambiente novo pelo kit, criação na hora
// (POST /api/kit-categorias) e o tipo do cliente (PF/PJ) para o botão das categorias que faltam.

const { default: handler } = await import('./kit-categorias.js')

const SECRET = 'segredo-de-teste'
const raiz = fileURLToPath(new URL('../supabase/', import.meta.url))
const ESTRUTURA = readFileSync(raiz + 'estrutura_base.sql', 'utf-8')
const NOVA = '2026-11-05d_kit_ganho_perda_capital.sql'
const MIGRACAO = readFileSync(raiz + 'migrations/' + NOVA, 'utf-8')
const antes = readdirSync(raiz + 'migrations').filter(f => f.endsWith('.sql') && f !== NOVA).sort()
  .map(f => readFileSync(raiz + 'migrations/' + f, 'utf-8')).join('\n')

let central
const novoBanco = async () => {
  const b = new PGlite()
  await b.exec(ESTRUTURA + '\n' + antes)
  await b.exec("INSERT INTO usuarios (id, username, nome, email, senha_hash, nivel) VALUES ('u1', 'admin', 'Admin', 'admin@teste.local', 'x', 'admin')")
  return b
}
const linhas = async (b, sql) => (await b.query(sql)).rows
const capital = (b) => linhas(b, "SELECT id, name, type, category_group FROM categorias WHERE lower(name) LIKE '%de capital' ORDER BY type")

beforeAll(async () => {
  central = new PGlite()
  await central.exec(SQL_CENTRAL)
  await central.exec(DDL_PLATAFORMA)
  await central.exec(`
    UPDATE ambientes SET database_name = 'banco_vm' WHERE sigla = 'vm';
    INSERT INTO plataforma_clientes (id, nome, email, tipo_pessoa, documento, empresa, sigla, status)
      VALUES ('cli-pj', 'Fulano', 'pj@teste.local', 'PJ', '00000000000000', 'Empresa', 'pj', 'ativo');
    INSERT INTO ambientes (id, sigla, nome, database_name, status, cliente_id) VALUES ('amb-pj', 'pj', 'Empresa', 'banco_pj', 'ativo', 'cli-pj');`)
}, 180_000)

let vm, pj
beforeEach(async () => {
  vm = await novoBanco()
  pj = await novoBanco()
  usarBancos({ central, banco_vm: () => vm, banco_pj: () => pj })
  process.env.JWT_SECRET = SECRET
  vi.spyOn(console, 'error').mockImplementation(() => {})
}, 120_000)
afterEach(() => { vi.restoreAllMocks() })
afterAll(() => { _definirFabricaDePool(null) })

const chamar = async ({ method = 'GET', body, sigla = 'vm', amb, nivel = 'admin' }) => {
  const [{ id }] = await linhas(central, `SELECT id FROM ambientes WHERE sigla = '${sigla}'`)
  const tk = jwt.sign({ sub: 'u1', org: 'o1', nivel, permissoes: {}, perfis: 'todos', username: 'admin', origem: 'db', amb: amb || id, amb_sigla: sigla }, SECRET)
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this }, end() { return this }, setHeader() {} }
  await handler({ method, url: '/api/kit-categorias', body, query: {}, headers: { host: sigla === 'vm' ? 'www.finup.app.br' : `${sigla}.finup.app.br`, authorization: `Bearer ${tk}` } }, res)
  return res
}

describe('migração em ambientes existentes', () => {
  it('ambiente sem elas: cria o grupo e as duas; é idempotente', async () => {
    await vm.exec("INSERT INTO categorias (id, name, type) VALUES ('c1', 'Mercado', 'expense'); INSERT INTO configuracoes (id, category_groups) VALUES (1, '[\"Casa\"]'::jsonb)")
    await vm.exec(MIGRACAO)
    await vm.exec(MIGRACAO)
    expect(await capital(vm)).toEqual([
      { id: 'cat_kit_perda_capital', name: 'Perda de capital', type: 'expense', category_group: 'Ganho e perda de capital' },
      { id: 'cat_kit_ganho_capital', name: 'Ganho de capital', type: 'income', category_group: 'Ganho e perda de capital' },
    ])
    expect((await linhas(vm, 'SELECT category_groups FROM configuracoes'))[0].category_groups).toEqual(['Casa', 'Ganho e perda de capital'])
  })

  it('nome parecido (maiúscula/acento) não duplica; o grupo existente fica como está', async () => {
    await vm.exec(`INSERT INTO categorias (id, name, type, category_group) VALUES
      ('p', 'PERDA DE CÁPITAL', 'expense', 'Ganho e perda de Capital'), ('g', 'Ganho de capital', 'income', 'Ganho e perda de Capital');
      INSERT INTO configuracoes (id, category_groups) VALUES (1, '["Ganho e perda de Capital"]'::jsonb)`)
    await vm.exec(MIGRACAO)
    expect((await linhas(vm, 'SELECT id FROM categorias ORDER BY id')).map(r => r.id)).toEqual(['g', 'p'])
    expect((await linhas(vm, 'SELECT category_groups FROM configuracoes'))[0].category_groups).toEqual(['Ganho e perda de Capital'])
  })

  it('só uma existe: cria só a outra', async () => {
    await vm.exec("INSERT INTO categorias (id, name, type) VALUES ('p', 'Perda de Capital', 'expense')")
    await vm.exec(MIGRACAO)
    expect((await linhas(vm, 'SELECT id FROM categorias ORDER BY id')).map(r => r.id)).toEqual(['cat_kit_ganho_capital', 'p'])
  })

  it('banco vazio não recebe nada; o ambiente novo nasce com elas pelo kit (PF e PJ), sem conflito com a migração', async () => {
    await pj.exec(MIGRACAO)
    expect(await linhas(pj, 'SELECT id FROM categorias')).toEqual([])
    const q = async (sql, p) => (await pj.query(sql, p)).rows
    await aplicarKitBasico(q, { nome: 'Empresa', tipo_pessoa: 'PJ', empresa: 'Empresa', email: 'a@b.c' })
    expect((await capital(pj)).map(c => c.id)).toEqual(['cat_kit_perda_capital', 'cat_kit_ganho_capital'])
    expect((await linhas(pj, 'SELECT category_groups FROM configuracoes'))[0].category_groups).toContain('Ganho e perda de capital')
  })
})

describe('/api/kit-categorias', () => {
  it('GET: tipo do cliente; sem cliente é PF', async () => {
    expect((await chamar({})).body).toEqual({ tipo: 'PF' })
    expect((await chamar({ sigla: 'pj', amb: 'amb-pj' })).body).toEqual({ tipo: 'PJ' })
  })

  it('POST capital: cria no banco na hora, só o que falta e sem duplicar', async () => {
    await vm.exec("INSERT INTO categorias (id, name, type) VALUES ('p', 'Perda de Capital', 'expense')")
    const r = await chamar({ method: 'POST', body: { acao: 'capital' } })
    expect(r.statusCode).toBe(200)
    expect(r.body.criadas.map(c => c.id)).toEqual(['cat_kit_ganho_capital'])
    expect((await chamar({ method: 'POST', body: { acao: 'capital' } })).body.criadas).toEqual([])
    expect((await linhas(vm, 'SELECT id FROM categorias ORDER BY id')).map(x => x.id)).toEqual(['cat_kit_ganho_capital', 'p'])
  })

  it('sem permissão de incluir em Cadastros: recusado', async () => {
    const r = await chamar({ method: 'POST', body: { acao: 'capital' }, nivel: 'consulta' })
    expect(r.statusCode).toBe(403)
    expect(await linhas(vm, 'SELECT id FROM categorias')).toEqual([])
  })

  it('dois clientes não se misturam', async () => {
    await chamar({ method: 'POST', body: { acao: 'capital' } })
    expect((await capital(vm))).toHaveLength(2)
    expect(await capital(pj)).toEqual([])
  })
})

describe('/api/bem/criar: ganho e perda', () => {
  const criar = async (body) => {
    const { default: bem } = await import('./bem/criar.js')
    const [{ id }] = await linhas(central, "SELECT id FROM ambientes WHERE sigla = 'vm'")
    const tk = jwt.sign({ sub: 'u1', org: 'o1', nivel: 'admin', permissoes: {}, perfis: 'todos', username: 'admin', origem: 'db', amb: id, amb_sigla: 'vm' }, SECRET)
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this }, end() { return this }, setHeader() {} }
    await bem({ method: 'POST', url: '/api/bem/criar', body, query: {}, headers: { host: 'www.finup.app.br', authorization: `Bearer ${tk}` } }, res)
    return res
  }
  const BASE = { nome: 'Carro', valor_nota_fiscal: 1000, categoria_prestacao_id: 'pre', categoria_taxa_finan_id: 'jur' }

  it('sem informar, usa as de capital do ambiente (nome parecido); sem elas, recusa explicando', async () => {
    await vm.exec("INSERT INTO categorias (id, name, type) VALUES ('pre', 'Prestação', 'expense'), ('jur', 'Juros', 'expense')")
    const semElas = await criar(BASE)
    expect(semElas.statusCode).toBe(400)
    expect(semElas.body.error).toMatch(/perda, ganho/)
    await vm.exec("INSERT INTO categorias (id, name, type) VALUES ('p', 'PERDA DE CAPITAL', 'expense'), ('g', 'Ganho de Capital', 'income')")
    const ok = await criar(BASE)
    expect(ok.statusCode).toBe(200)
    const [c] = await linhas(vm, "SELECT categoria_perda_bem_id AS p, categoria_ganho_bem_id AS g FROM contas WHERE name = 'Carro'")
    expect(c).toEqual({ p: 'p', g: 'g' })
  }, 60_000)
})
