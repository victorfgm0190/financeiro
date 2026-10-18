import process from 'node:process'
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import jwt from 'jsonwebtoken'
import { SQL_CENTRAL, usarBancos } from './_testes/pglite.js'
import { _definirFabricaDePool } from './_conexao.js'
import { _limparCacheColunasOpcionais } from './_db.js'

// IMPORTAÇÃO PADRÃO — rota dos lotes/de-para e o sync dos lançamentos com importacao_id/fitid, com
// o _db.js de verdade (PGlite por database). banco_novo: com a migração; banco_antigo: SEM ela
// (ambiente ainda não migrado) — o sync não pode quebrar.

const { default: rota } = await import('./importacoes-lancamentos.js')
const { default: syncHandler } = await import('./sync.js')

const SECRET = 'segredo-de-teste'
const raiz = fileURLToPath(new URL('../supabase/', import.meta.url))
const MIGRACAO = '2026-10-18_importacao_padrao.sql'
const SQL_MIGRACAO = readFileSync(raiz + 'migrations/' + MIGRACAO, 'utf-8')
const ESTRUTURA = readFileSync(raiz + 'estrutura_base.sql', 'utf-8')
const migracoes = (filtro) => readdirSync(raiz + 'migrations').filter(f => f.endsWith('.sql') && filtro(f)).sort()
  .map(f => readFileSync(raiz + 'migrations/' + f, 'utf-8')).join('\n')
const bancos = {}
const qde = (n) => async (sql, p = []) => (await bancos[n].query(sql, p)).rows

beforeAll(async () => {
  bancos.central = new PGlite()
  await bancos.central.exec(SQL_CENTRAL)
  await bancos.central.exec(`
    UPDATE ambientes SET database_name = 'banco_novo' WHERE sigla = 'vm';
    INSERT INTO ambientes (id, sigla, nome, database_name, status) VALUES ('amb-old', 'old', 'Antigo', 'banco_antigo', 'ativo');`)
  bancos.banco_novo = new PGlite()
  await bancos.banco_novo.exec(ESTRUTURA + '\n' + migracoes(() => true))
  bancos.banco_antigo = new PGlite()
  await bancos.banco_antigo.exec(ESTRUTURA + '\n' + migracoes(f => f !== MIGRACAO))
  for (const b of ['banco_novo', 'banco_antigo']) {
    await bancos[b].exec(`
      INSERT INTO contas (id, name, type, balance) VALUES ('c1', 'Corrente', 'checking', 0), ('c2', 'Poupança', 'savings', 0), ('cc', 'Cartão', 'credit', 0);
      INSERT INTO categorias (id, name, type) VALUES ('cat_a', 'Alimentação', 'expense');
      INSERT INTO account_mapping (grupo, nome_finup, nome_dindin) VALUES ('G', 'Corrente', 'DINDIN 1'), ('G', 'Poupança', 'DINDIN 2');`)
  }
}, 180_000) // vários PGlite + migrações: com a suíte inteira em paralelo passa de 60 s

let envOriginal
beforeEach(async () => {
  envOriginal = { ...process.env }
  process.env.JWT_SECRET = SECRET
  usarBancos(bancos)
  _limparCacheColunasOpcionais()
  vi.spyOn(console, 'log').mockImplementation(() => {})
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
async function chamar(handler, { method = 'GET', body, url = '/api/importacoes-lancamentos', host = 'www.finup.app.br', auth } = {}) {
  const res = resposta()
  await handler({ method, body, url, headers: { host, authorization: `Bearer ${auth}` }, query: Object.fromEntries(new URL(url, 'http://x').searchParams) }, res)
  return res
}
const idVm = async () => (await qde('central')("SELECT id FROM ambientes WHERE sigla = 'vm'"))[0].id
const token = async (nivel = 'admin', permissoes = {}, amb = null) => jwt.sign({
  sub: 'u1', org: 'o1', nivel, permissoes, perfis: 'todos', username: `user-${nivel}`, origem: 'db',
  amb: amb?.id ?? await idVm(), amb_sigla: amb?.sigla ?? 'vm',
}, SECRET)
const linhaTx = (id, extra = {}) => ({
  id, type: 'expense', account_id: 'c1', amount: 10, date: '2026-10-01', description: `Teste ${id}`, origin: 'importacao_padrao',
  created_at: new Date().toISOString(), importacao_id: 'lote1', fitid: `F${id}`, ...extra,
})
const sync = async (upsert, extra = {}) => chamar(syncHandler, { method: 'POST', url: '/api/sync', auth: await token(), body: { type: 'section', table: 'lancamentos', upsert, delete: [] }, ...extra })

describe('migração', () => {
  it('só cria (sem UPDATE/DELETE/DROP) e não toca no de-para Dindin (account_mapping)', () => {
    const semComentario = SQL_MIGRACAO.replace(/--.*$/gm, '')
    expect(semComentario).not.toMatch(/\b(UPDATE|DELETE|DROP|TRUNCATE|INSERT)\b/i)
    expect(semComentario).not.toMatch(/account_mapping/i)
    expect(semComentario).toMatch(/CREATE TABLE IF NOT EXISTS importacoes_lancamentos/)
    expect(semComentario).toMatch(/ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS importacao_id/)
  })
  it('aplicar de novo não muda nada e o account_mapping continua igual', async () => {
    const antes = await qde('banco_novo')('SELECT * FROM account_mapping ORDER BY id')
    await bancos.banco_novo.exec(SQL_MIGRACAO)
    expect(await qde('banco_novo')('SELECT * FROM account_mapping ORDER BY id')).toEqual(antes)
    expect(antes).toHaveLength(2)
  })
})

describe('sync dos lançamentos com importacao_id e fitid', () => {
  it('ambiente migrado: grava as colunas', async () => {
    const r = await sync([linhaTx('n1')])
    expect(r.statusCode).toBe(200)
    expect((await qde('banco_novo')("SELECT importacao_id, fitid FROM lancamentos WHERE id = 'n1'"))[0]).toEqual({ importacao_id: 'lote1', fitid: 'Fn1' })
  })
  it('ambiente ANTIGO (sem a migração): o sync continua funcionando e grava o resto', async () => {
    const amb = { id: 'amb-old', sigla: 'old' }
    const r = await chamar(syncHandler, { method: 'POST', url: '/api/sync', host: 'old.finup.app.br', auth: await token('admin', {}, amb), body: { type: 'section', table: 'lancamentos', upsert: [linhaTx('o1')], delete: [] } })
    expect(r.statusCode).toBe(200)
    const [l] = await qde('banco_antigo')("SELECT id, amount, description FROM lancamentos WHERE id = 'o1'")
    expect(l).toEqual({ id: 'o1', amount: '10', description: 'Teste o1' })
  })
})

describe('lotes', () => {
  const lote = (id, extra = {}) => ({ id, conta_id: 'c1', formato: 'ofx', arquivo: 'extrato.ofx', qtd: 2, total_entradas: 0, total_saidas: 20, ofx_banco: '0341', ofx_conta: '123-4', ...extra })

  it('registra → concluir só com todos no banco → desfazer só sem nenhum sobrando', async () => {
    const auth = await token()
    let r = await chamar(rota, { method: 'POST', auth, body: lote('L1') })
    expect(r.statusCode).toBe(200)
    expect(r.body.lote).toMatchObject({ id: 'L1', status: 'em_andamento', qtd: 2, criado_por: 'user-admin' })
    // nada no banco ainda → não conclui
    r = await chamar(rota, { method: 'POST', url: '/api/importacoes-lancamentos?acao=concluir', auth, body: { id: 'L1' } })
    expect(r.statusCode).toBe(409)
    expect(r.body).toMatchObject({ gravados: 0, qtd: 2 })
    // página fechada no meio: 1 de 2 → lista mostra "incompleta (1 de 2)"
    await sync([linhaTx('a1', { importacao_id: 'L1' })])
    let lista = await chamar(rota, { auth })
    expect(lista.body.lotes.find(l => l.id === 'L1')).toMatchObject({ status: 'em_andamento', gravados: 1, qtd: 2 })
    await sync([linhaTx('a2', { importacao_id: 'L1' })])
    r = await chamar(rota, { method: 'POST', url: '/api/importacoes-lancamentos?acao=concluir', auth, body: { id: 'L1' } })
    expect(r.body).toEqual({ ok: true, gravados: 2 })
    expect((await chamar(rota, { url: '/api/importacoes-lancamentos?acao=lote&id=L1', auth })).body).toMatchObject({ lote: { status: 'concluida' }, gravados: 2 })
    // desfazer com lançamentos ainda no banco → recusa
    r = await chamar(rota, { method: 'POST', url: '/api/importacoes-lancamentos?acao=desfazer', auth, body: { id: 'L1' } })
    expect(r.statusCode).toBe(409)
    expect(r.body.restantes).toBe(2)
    // o app apaga os lançamentos do lote (deleteTransaction → sync) e só então marca
    await chamar(syncHandler, { method: 'POST', url: '/api/sync', auth, body: { type: 'section', table: 'lancamentos', upsert: [], delete: ['a1', 'a2'] } })
    r = await chamar(rota, { method: 'POST', url: '/api/importacoes-lancamentos?acao=desfazer', auth, body: { id: 'L1' } })
    expect(r.body).toEqual({ ok: true })
    lista = await chamar(rota, { auth })
    expect(lista.body.lotes.find(l => l.id === 'L1')).toMatchObject({ status: 'desfeita', gravados: 0, desfeita_por: 'user-admin' })
    // os outros lançamentos da conta não foram tocados
    expect((await qde('banco_novo')("SELECT count(*)::int AS n FROM lancamentos WHERE id = 'n1'"))[0].n).toBe(1)
  })

  it('OFX: em qual conta o extrato já foi importado (desfeitas não contam)', async () => {
    const auth = await token()
    await chamar(rota, { method: 'POST', auth, body: lote('L2', { conta_id: 'c2', ofx_conta: '999-9' }) })
    const r = await chamar(rota, { url: '/api/importacoes-lancamentos?acao=ofx-conta&banco=0341&conta=999-9', auth })
    expect(r.body.contas).toEqual(['c2'])
    expect((await chamar(rota, { url: '/api/importacoes-lancamentos?acao=ofx-conta&banco=0341&conta=123-4', auth })).body.contas).toEqual([]) // L1 desfeita
  })

  it('acesso: consulta não importa; personalizado com incluir sem excluir importa mas não desfaz; cartão recusado', async () => {
    const consulta = await token('consulta')
    expect((await chamar(rota, { method: 'POST', auth: consulta, body: lote('L3') })).statusCode).toBe(403)
    const so = await token('personalizado', { lancamentos: { ver: true, incluir: true } })
    expect((await chamar(rota, { method: 'POST', auth: so, body: lote('L4') })).statusCode).toBe(200)
    const r = await chamar(rota, { method: 'POST', url: '/api/importacoes-lancamentos?acao=desfazer', auth: so, body: { id: 'L4' } })
    expect(r.statusCode).toBe(403)
    expect((await chamar(rota, { method: 'POST', auth: await token(), body: lote('L5', { conta_id: 'cc' }) })).body.error).toMatch(/Importar Fatura/)
    expect((await chamar(rota, { method: 'POST', auth: await token(), body: lote('L6', { conta_id: 'nao-existe' }) })).statusCode).toBe(404)
  })
})

describe('de-para de categoria', () => {
  it('salva normalizado (sem acento/maiúscula), atualiza, lista e exclui', async () => {
    const auth = await token()
    let r = await chamar(rota, { method: 'POST', url: '/api/importacoes-lancamentos?acao=depara', auth, body: { nome_origem: '  MERCADO   Bom ', categoria_id: 'cat_a' } })
    expect(r.body.item).toMatchObject({ nome_origem: 'mercado bom', nome_exibicao: 'MERCADO   Bom', categoria_id: 'cat_a' })
    await chamar(rota, { method: 'POST', url: '/api/importacoes-lancamentos?acao=depara', auth, body: { nome_origem: 'Mercado Bóm', categoria_id: 'cat_a' } })
    const lista = (await chamar(rota, { url: '/api/importacoes-lancamentos?acao=depara', auth })).body.depara
    expect(lista).toHaveLength(1) // "Mercado Bóm" = a mesma chave "mercado bom": atualiza, não duplica
    expect(lista[0]).toMatchObject({ nome_origem: 'mercado bom', nome_exibicao: 'Mercado Bóm' })
    expect((await chamar(rota, { method: 'POST', url: '/api/importacoes-lancamentos?acao=depara', auth, body: { nome_origem: 'x', categoria_id: 'nao-existe' } })).statusCode).toBe(400)
    r = await chamar(rota, { method: 'DELETE', url: '/api/importacoes-lancamentos?acao=depara', auth, body: { id: lista[0].id } })
    expect(r.body).toEqual({ ok: true })
    expect((await chamar(rota, { method: 'POST', url: '/api/importacoes-lancamentos?acao=depara', auth: await token('consulta'), body: { nome_origem: 'y', categoria_id: 'cat_a' } })).statusCode).toBe(403)
  })
})
