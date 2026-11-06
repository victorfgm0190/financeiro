import process from 'node:process'
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { abrirPGlite, bancoDoArquivo } from './_testes/bancoTeste.js'
import jwt from 'jsonwebtoken'
import { SQL_CENTRAL, usarBancos } from './_testes/pglite.js'
import { _definirFabricaDePool } from './_conexao.js'

// Rotas do bem e do financiamento dele: usuário restrito a outro perfil recebe 403 e nada muda no banco;
// o usuário do perfil do bem e o sem restrição continuam conseguindo.

const rota = async (f) => (await import(f)).default
const registrar = await rota('./bem/[id]/registrar-entrada.js')
const estornar = await rota('./bem/[id]/estornar-entrada.js')
const atualizar = await rota('./bem/[id]/atualizar-valores.js')
const criarBem = await rota('./bem/criar.js')
const lerBem = await rota('./bem/[id].js')
const movimentacoes = await rota('./bem/[id]/movimentacoes.js')
const criarFin = await rota('./financiamento/criar.js')
const finId = await rota('./financiamento/[id].js')
const parcelas = await rota('./financiamento/[id]/parcelas.js')
const pagar = await rota('./financiamento/parcela/[id]/pagar.js')
const favorecido = await rota('./financiamento/parcela/[id]/favorecido.js')
const popular = await rota('./financiamento/parcelas/popular-rateios.js')

const SECRET = 'segredo-de-teste'
const raiz = fileURLToPath(new URL('../supabase/', import.meta.url))
const SQL = readFileSync(raiz + 'estrutura_base.sql', 'utf-8') + '\n' + readdirSync(raiz + 'migrations').filter(f => f.endsWith('.sql')).sort()
  .map(f => readFileSync(raiz + 'migrations/' + f, 'utf-8')).join('\n')
const TABELAS = ['contas', 'lancamentos', 'bem_movimentacoes', 'financing', 'financing_installments', 'agendamentos']

let central, banco, ambId
const q = async (sql, p) => (await banco.query(sql, p)).rows
const fotografia = async () => {
  const out = {}
  for (const t of TABELAS) out[t] = await q(`SELECT * FROM ${t} ORDER BY id`)
  return JSON.stringify(out)
}

beforeAll(async () => {
  central = abrirPGlite()
  await central.exec(SQL_CENTRAL)
  await central.exec("UPDATE ambientes SET database_name = 'banco_vm' WHERE sigla = 'vm'")
  ambId = (await central.query("SELECT id FROM ambientes WHERE sigla = 'vm'")).rows[0].id
}, 180_000)

beforeEach(async () => {
  banco = await bancoDoArquivo(async (b) => {
    await b.exec(SQL)
    await b.exec(`
      INSERT INTO usuarios (id, username, nome, email, senha_hash, nivel) VALUES ('u1', 'admin', 'Admin', 'admin@teste.local', 'x', 'admin');
      INSERT INTO perfis (id, name, type) VALUES ('pa', 'Perfil A', 'pf'), ('pb', 'Perfil B', 'pj');
      INSERT INTO categorias (id, name, type) VALUES ('perda', 'Perda', 'expense'), ('ganho', 'Ganho', 'income');
      INSERT INTO contas (id, name, type, balance, initial_balance, profile_id) VALUES ('cc_a', 'Conta A', 'checking', 5000, 5000, 'pa');
      INSERT INTO contas (id, name, type, balance, initial_balance, profile_id, valor_nota_fiscal, categoria_perda_bem_id, categoria_ganho_bem_id) VALUES
        ('bem_a', 'Bem A', 'asset', 100000, 100000, 'pa', 100000, 'perda', 'ganho'),
        ('bem_a2', 'Bem A2', 'asset', 80000, 80000, 'pa', 80000, 'perda', 'ganho');
      UPDATE contas SET categoria_prestacao_id = 'perda', categoria_taxa_finan_id = 'perda' WHERE type = 'asset';`)
  })
  usarBancos({ central, banco_vm: () => banco })
  process.env.JWT_SECRET = SECRET
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
}, 120_000)
afterEach(() => { vi.restoreAllMocks() })
afterAll(() => { _definirFabricaDePool(null) })

const token = (perfis) => jwt.sign({ sub: 'u1', org: 'o1', nivel: 'admin', permissoes: {}, perfis, username: 'admin', origem: 'db', amb: ambId, amb_sigla: 'vm' }, SECRET)
const TODOS = () => token('todos')
const DONO = () => token(['pa'])
const OUTRO = () => token(['pb'])
const chamar = async (handler, { method = 'POST', url, body, query = {}, tk }) => {
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this }, end() { return this }, setHeader() {} }
  await handler({ method, url, body, query, headers: { host: 'www.finup.app.br', authorization: `Bearer ${tk}` } }, res)
  return res
}
const entrada = (tk, id = 'bem_a', origem = 'bem_a2') => chamar(registrar, {
  url: `/api/bem/${id}/registrar-entrada`, query: { id }, tk,
  body: { data: '2026-08-07', transferencias: [{ bem_origem_id: origem, valor: 70000 }] },
})
const estorno = (tk, id = 'bem_a') => chamar(estornar, { url: `/api/bem/${id}/estornar-entrada`, query: { id }, tk, body: {} })
const novoFin = (tk) => chamar(criarFin, {
  url: '/api/financiamento/criar', tk,
  body: { bem_id: 'bem_a', valor_principal: 1000, num_parcelas: 2, valor_parcela: 500, banco: 'Banco', data_primeira_parcela: '2026-09-01', conta_origem_id: 'cc_a' },
})
const umaParcela = async () => (await q('SELECT id, financing_id FROM financing_installments ORDER BY numero_parcela LIMIT 1'))[0]

describe('entrada do bem', () => {
  it('outro perfil: 403 ao registrar e ao estornar, e nada muda', async () => {
    const antes = await fotografia()
    expect((await entrada(OUTRO())).statusCode).toBe(403)
    expect(await fotografia()).toBe(antes)
    expect((await entrada(TODOS())).statusCode).toBe(200)
    const depois = await fotografia()
    expect((await estorno(OUTRO())).statusCode).toBe(403)
    expect(await fotografia()).toBe(depois)
  }, 120_000)

  it('dono registra e estorna; sem restrição também', async () => {
    expect((await entrada(DONO())).statusCode).toBe(200)
    expect((await estorno(DONO())).statusCode).toBe(200)
    expect((await entrada(TODOS())).statusCode).toBe(200)
    expect((await estorno(TODOS())).statusCode).toBe(200)
  }, 120_000)

  it('bem dado em troca de outro perfil também barra, mesmo com o bem novo permitido', async () => {
    await banco.exec("INSERT INTO contas (id, name, type, balance, initial_balance, profile_id, valor_nota_fiscal) VALUES ('bem_b', 'Bem B', 'asset', 50000, 50000, 'pb', 50000)")
    const antes = await fotografia()
    expect((await entrada(DONO(), 'bem_a', 'bem_b')).statusCode).toBe(403)
    expect(await fotografia()).toBe(antes)
  }, 120_000)

  it('estorno sem ganho/perda (o caso que passava antes) também barra', async () => {
    await q("UPDATE contas SET valor_nota_fiscal = 70000 WHERE id = 'bem_a2'")
    expect((await entrada(TODOS())).statusCode).toBe(200)
    expect(await q("SELECT id FROM lancamentos WHERE origin = 'patrimonio_auto'")).toHaveLength(0)
    expect((await estorno(OUTRO())).statusCode).toBe(403)
  }, 120_000)
})

describe('demais rotas do bem', () => {
  const atualizarValores = (tk) => chamar(atualizar, { url: '/api/bem/bem_a/atualizar-valores', query: { id: 'bem_a' }, tk, body: { valor_nota_fiscal: 120000 } })
  const transformar = (tk) => chamar(criarBem, { url: '/api/bem/criar', tk, body: { nome: 'Virou bem', valor_nota_fiscal: 10, conta_id: 'cc_a' } })

  it('gravação: outro perfil 403 e nada muda; dono e sem restrição conseguem', async () => {
    const antes = await fotografia()
    expect((await atualizarValores(OUTRO())).statusCode).toBe(403)
    expect((await transformar(OUTRO())).statusCode).toBe(403)
    expect(await fotografia()).toBe(antes)
    expect((await atualizarValores(DONO())).statusCode).toBe(200)
    expect((await atualizarValores(TODOS())).statusCode).toBe(200)
  }, 120_000)

  it('leitura: outro perfil 403; dono e sem restrição leem', async () => {
    const ler = (tk) => chamar(lerBem, { method: 'GET', url: '/api/bem/bem_a', query: { id: 'bem_a' }, tk })
    const movs = (tk) => chamar(movimentacoes, { method: 'GET', url: '/api/bem/bem_a/movimentacoes', query: { id: 'bem_a' }, tk })
    expect((await ler(OUTRO())).statusCode).toBe(403)
    expect((await movs(OUTRO())).statusCode).toBe(403)
    for (const tk of [DONO(), TODOS()]) {
      expect((await ler(tk)).statusCode).toBe(200)
      expect((await movs(tk)).statusCode).toBe(200)
    }
  }, 120_000)
})

describe('financiamento do bem', () => {
  it('gravação: outro perfil 403 em criar, pagar, favorecido, rateios e editar; nada muda', async () => {
    expect((await novoFin(OUTRO())).statusCode).toBe(403)
    expect(await q('SELECT id FROM financing')).toHaveLength(0)
    expect((await novoFin(TODOS())).body.error).toBeUndefined()
    const p = await umaParcela()
    const antes = await fotografia()
    const tk = OUTRO()
    const respostas = [
      await chamar(pagar, { url: `/api/financiamento/parcela/${p.id}/pagar`, query: { id: p.id }, tk, body: { conta_origem_id: 'cc_a', data_pagamento: '2026-09-01', valor_pago: 500 } }),
      await chamar(favorecido, { method: 'PATCH', url: `/api/financiamento/parcela/${p.id}/favorecido`, query: { id: p.id }, tk, body: { payee: 'Outro' } }),
      await chamar(popular, { url: '/api/financiamento/parcelas/popular-rateios', tk, body: { financing_id: p.financing_id } }),
      await chamar(finId, { method: 'PATCH', url: `/api/financiamento/${p.financing_id}`, query: { id: p.financing_id }, tk, body: { banco: 'Outro' } }),
    ]
    for (const r of respostas) expect(r.statusCode).toBe(403)
    expect(await fotografia()).toBe(antes)
  }, 120_000)

  it('leitura: outro perfil 403; dono lê', async () => {
    await novoFin(TODOS())
    const { financing_id: id } = await umaParcela()
    const ler = (tk) => chamar(finId, { method: 'GET', url: `/api/financiamento/${id}`, query: { id }, tk })
    const lista = (tk) => chamar(parcelas, { method: 'GET', url: `/api/financiamento/${id}/parcelas`, query: { id }, tk })
    expect((await ler(OUTRO())).statusCode).toBe(403)
    expect((await lista(OUTRO())).statusCode).toBe(403)
    expect((await ler(DONO())).statusCode).toBe(200)
    expect((await lista(DONO())).statusCode).toBe(200)
  }, 120_000)

  it('dono cria e paga a parcela', async () => {
    expect((await novoFin(DONO())).body.error).toBeUndefined()
    const p = await umaParcela()
    const r = await chamar(pagar, { url: `/api/financiamento/parcela/${p.id}/pagar`, query: { id: p.id }, tk: DONO(), body: { conta_origem_id: 'cc_a', data_pagamento: '2026-09-01', valor_pago: 500 } })
    expect(r.body?.error || r.statusCode).toBe(200)
  }, 120_000)
})
