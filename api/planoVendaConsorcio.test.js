import process from 'node:process'
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import jwt from 'jsonwebtoken'
import { abrirPGlite, bancoDoArquivo } from './_testes/bancoTeste.js'
import { SQL_CENTRAL, usarBancos } from './_testes/pglite.js'
import { _definirFabricaDePool } from './_conexao.js'

// Plano de venda: gravação por cota, função vinculada, permissão e o cadastro que não apaga o plano.
const { default: consorcio } = await import('./consorcio.js')

const SECRET = 'segredo-de-teste'
const raiz = fileURLToPath(new URL('../supabase/', import.meta.url))
const SQL = readFileSync(raiz + 'estrutura_base.sql', 'utf-8') + '\n' + readdirSync(raiz + 'migrations').filter(f => f.endsWith('.sql')).sort()
  .map(f => readFileSync(raiz + 'migrations/' + f, 'utf-8')).join('\n')

let central, banco, ambId
const q = async (sql, p) => (await banco.query(sql, p)).rows
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
      INSERT INTO perfis (id, name, type) VALUES ('pa', 'A', 'pf'), ('pb', 'B', 'pj');
      INSERT INTO contas (id, name, type, balance, profile_id, tipo_bem) VALUES ('bem', 'Consórcio', 'asset', 0, 'pa', 'consorcio'), ('res', 'Reserva', 'savings', 0, 'pa', NULL), ('res_b', 'Reserva B', 'savings', 0, 'pb', NULL);
      INSERT INTO reserve_functions (id, name, account_id) VALUES ('f', 'Função', 'res'), ('f_b', 'Função B', 'res_b');
      INSERT INTO consorcios (bem_id, situacao) VALUES ('bem', 'ativa');
      INSERT INTO consorcio_cotas (bem_id, numero, valor_carta, percentual_parcela, valor_parcela_cheia) VALUES ('bem', '1', 100000, 100, 500), ('bem', '2', 100000, 50, 500);`)
  })
  usarBancos({ central, banco_vm: () => banco })
  process.env.JWT_SECRET = SECRET
  vi.spyOn(console, 'error').mockImplementation(() => {})
}, 120_000)
afterEach(() => { vi.restoreAllMocks() })
afterAll(() => { _definirFabricaDePool(null) })

const token = (perfis = 'todos') => jwt.sign({ sub: 'u1', org: 'o1', nivel: 'admin', permissoes: {}, perfis, username: 'admin', origem: 'db', amb: ambId, amb_sigla: 'vm' }, SECRET)
async function chamar(method, { body, tk = token(), url = '/api/consorcio' }) {
  const res = { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this }, end() { return this }, setHeader() {} }
  await consorcio({ method, url, body, query: {}, headers: { host: 'www.finup.app.br', authorization: `Bearer ${tk}` } }, res)
  return res
}
const plano = (extra = {}) => ({ bem_id: 'bem', funcao_reserva_id: 'f', cotas: [{ numero: '1', plano_mes: '2027-03', plano_valor: 30000 }, { numero: '2', plano_mes: '2027-04', plano_valor: 12000.5 }], ...extra })

describe('plano de venda', () => {
  it('vazio por padrão; grava por cota, com a função, e volta na leitura', async () => {
    const antes = (await chamar('GET', { url: '/api/consorcio?bem_id=bem' })).body.consorcio
    expect(antes.funcao_reserva_id).toBeNull()
    expect(antes.cotas.map(c => [c.plano_mes, c.plano_valor])).toEqual([[null, null], [null, null]])
    expect((await chamar('PATCH', { body: plano() })).body.error).toBeUndefined()
    const lido = (await chamar('GET', { url: '/api/consorcio?bem_id=bem' })).body.consorcio
    expect(lido.funcao_reserva_id).toBe('f')
    expect(lido.cotas.map(c => [c.numero, c.plano_mes, c.plano_valor])).toEqual([['1', '2027-03', 30000], ['2', '2027-04', 12000.5]])
  }, 60_000)
  it('cota vendida fica registrada, sem lançamento', async () => {
    await chamar('PATCH', { body: plano({ cotas: [{ numero: '1', vendida_em: '2026-10-01', vendida_valor: 28000 }] }) })
    const [c] = await q("SELECT vendida_em, vendida_valor::float AS v FROM consorcio_cotas WHERE numero = '1'")
    expect(c).toEqual({ vendida_em: '2026-10-01', v: 28000 })
    expect(await q('SELECT id FROM lancamentos')).toEqual([])
  }, 60_000)
  it('validação do mês e da data', async () => {
    expect((await chamar('PATCH', { body: plano({ cotas: [{ numero: '1', plano_mes: '2027-13' }] }) })).statusCode).toBe(400)
    expect((await chamar('PATCH', { body: plano({ cotas: [{ numero: '1', vendida_em: 'ontem' }] }) })).statusCode).toBe(400)
    expect((await chamar('PATCH', { body: plano({ funcao_reserva_id: 'nao_existe' }) })).statusCode).toBe(400)
  }, 60_000)
  it('usuário de outro perfil recebe 403 no bem e na função', async () => {
    expect((await chamar('PATCH', { body: plano(), tk: token(['pb']) })).statusCode).toBe(403)
    expect((await chamar('PATCH', { body: plano({ funcao_reserva_id: 'f_b' }), tk: token(['pa']) })).statusCode).toBe(403)
    expect((await q('SELECT funcao_reserva_id AS f FROM consorcios'))[0].f).toBeNull()
  }, 60_000)
  it('editar o cadastro do consórcio não apaga o plano nem a venda da cota', async () => {
    await chamar('PATCH', { body: plano({ cotas: [{ numero: '1', plano_mes: '2027-03', plano_valor: 30000, vendida_em: '2026-10-01', vendida_valor: 28000 }] }) })
    const r = await chamar('PUT', { body: { bem_id: 'bem', cotas: [{ numero: '1', valor_carta: 100000, percentual_parcela: 100, valor_parcela_cheia: 600 }, { numero: '3', valor_carta: 50000, percentual_parcela: 100, valor_parcela_cheia: 300 }] } })
    expect(r.body.error).toBeUndefined()
    const cotas = await q("SELECT numero, plano_mes, plano_valor::float AS v, vendida_em FROM consorcio_cotas ORDER BY numero")
    expect(cotas).toEqual([{ numero: '1', plano_mes: '2027-03', v: 30000, vendida_em: '2026-10-01' }, { numero: '3', plano_mes: null, v: null, vendida_em: null }])
  }, 60_000)
})
