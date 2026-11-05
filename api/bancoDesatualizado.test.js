import process from 'node:process'
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import jwt from 'jsonwebtoken'
import { SQL_CENTRAL, usarBancos } from './_testes/pglite.js'
import { _definirFabricaDePool } from './_conexao.js'
import { _limparCacheColunasOpcionais, _limparCacheColunasDaTabela, recursosDoBanco, valorNeutro } from './_db.js'
import { envelopeToRow } from '../src/lib/db.js'

// Banco de ambiente SEM a migração nova (o caso do vm em 04/11/2026): o envelope Diário era salvo
// "com sucesso" — o sync tirava as colunas que faltavam e respondia 200 — e voltava a Mensal ao
// recarregar. Agora: valor de verdade numa coluna ausente → 409 com motivo, nada gravado; valor
// neutro (Mensal) continua passando, como sempre. Handler e _db.js de verdade (PGlite).

const { default: syncHandler } = await import('./sync.js')

const SECRET = 'segredo-de-teste'
const raiz = fileURLToPath(new URL('../supabase/', import.meta.url))
const ESTRUTURA = readFileSync(raiz + 'estrutura_base.sql', 'utf-8')
const NOVAS = ['2026-11-04_contratos_credito_previsto.sql', '2026-11-04b_envelope_diario_feriados.sql']
const lerMigracoes = (filtro) => readdirSync(raiz + 'migrations').filter(f => f.endsWith('.sql') && filtro(f)).sort()
  .map(f => readFileSync(raiz + 'migrations/' + f, 'utf-8')).join('\n')

let central
let antigo
let novo
let atual
const q = async (sql, p = []) => (await atual.query(sql, p)).rows

beforeAll(async () => {
  central = new PGlite()
  await central.exec(SQL_CENTRAL)
  await central.exec("UPDATE ambientes SET database_name = 'banco_vm' WHERE sigla = 'vm'")
  antigo = new PGlite()
  await antigo.exec(ESTRUTURA + '\n' + lerMigracoes(f => !NOVAS.includes(f)))
  novo = new PGlite()
  await novo.exec(ESTRUTURA + '\n' + lerMigracoes(() => true))
  for (const b of [antigo, novo]) {
    await b.exec("INSERT INTO usuarios (id, username, nome, email, senha_hash, nivel) VALUES ('u1', 'admin', 'Admin', 'admin@teste.local', 'x', 'admin')")
    await b.exec("INSERT INTO envelopes (id, name, limit_amount, due_day, category_ids, history) VALUES ('env_r', 'REFEICAO', 300, 15, '[]', '[]')")
  }
}, 180_000)

let envOriginal
const usar = (b) => {
  atual = b
  usarBancos({ central, banco_vm: { query: (sql, p) => b.query(sql, p), exec: (sql) => b.exec(sql) } })
  _limparCacheColunasOpcionais()
  _limparCacheColunasDaTabela()
}
beforeEach(() => {
  envOriginal = { ...process.env }
  process.env.JWT_SECRET = SECRET
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { process.env = envOriginal; vi.restoreAllMocks() })
afterAll(() => { _definirFabricaDePool(null) })

const resposta = () => ({
  statusCode: 200, body: undefined, headers: {},
  status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this }, end() { return this }, setHeader(k, v) { this.headers[k] = v },
})
async function sync(body) {
  const [{ id }] = (await central.query("SELECT id FROM ambientes WHERE sigla = 'vm'")).rows
  const tk = jwt.sign({ sub: 'u1', org: 'o1', nivel: 'admin', permissoes: {}, perfis: 'todos', username: 'admin', origem: 'db', amb: id, amb_sigla: 'vm' }, SECRET)
  const res = resposta()
  await syncHandler({ method: 'POST', body, url: '/api/sync', headers: { host: 'www.finup.app.br', authorization: `Bearer ${tk}` } }, res)
  return res
}
const ENV = { id: 'env_r', name: 'REFEICAO', categoryIds: [], accountId: null, dueDay: 15, history: [] }
const diario = envelopeToRow({ ...ENV, tipoOrcamento: 'diario', valorDia: 40, diasSemana: [1, 2, 3, 4, 5], descontarFeriados: true, limitAmount: 0 })
const mensal = envelopeToRow({ ...ENV, tipoOrcamento: 'mensal', limitAmount: 350 })

describe('banco sem a migração do envelope diário', () => {
  it('envelope Diário → 409 com o motivo e NADA gravado (antes: 200 e voltava a Mensal ao recarregar)', async () => {
    usar(antigo)
    const r = await sync({ type: 'section', table: 'envelopes', upsert: [diario], delete: [] })
    expect(r.statusCode).toBe(409)
    expect(r.body.codigo).toBe('banco_desatualizado')
    expect(r.body.error).toMatch(/ainda não tem a atualização.*envelopes\.tipo_orcamento.*Nada foi gravado/)
    expect(r.body.colunas).toEqual(expect.arrayContaining(['tipo_orcamento', 'valor_dia', 'dias_semana', 'descontar_feriados']))
    expect(await q("SELECT limit_amount::float AS l FROM envelopes WHERE id = 'env_r'")).toEqual([{ l: 300 }])
  })

  it('envelope Mensal continua gravando normalmente (colunas neutras saem do upsert)', async () => {
    usar(antigo)
    const r = await sync({ type: 'section', table: 'envelopes', upsert: [mensal], delete: [] })
    expect(r.statusCode).toBe(200)
    expect(r.body.written.upserted).toBe(1)
    expect(await q("SELECT limit_amount::float AS l FROM envelopes WHERE id = 'env_r'")).toEqual([{ l: 350 }])
  })

  it('recursosDoBanco: o /api/load avisa a tela do que falta', async () => {
    expect(await recursosDoBanco(async (s, p) => (await antigo.query(s, p)).rows)).toEqual({ envelopeDiario: false, creditoPrevisto: false, feriados: false, encargosContrato: true, efetivacoesProvisao: true, viradaAssistida: true })
    expect(await recursosDoBanco(async (s, p) => (await novo.query(s, p)).rows)).toEqual({ envelopeDiario: true, creditoPrevisto: true, feriados: true, encargosContrato: true, efetivacoesProvisao: true, viradaAssistida: true })
  })
})

describe('banco com a migração', () => {
  it('envelope Diário grava tipo, valor por dia, dias e feriados', async () => {
    usar(novo)
    const r = await sync({ type: 'section', table: 'envelopes', upsert: [diario], delete: [] })
    expect(r.statusCode).toBe(200)
    expect(await q("SELECT tipo_orcamento, valor_dia::float AS v, dias_semana, descontar_feriados FROM envelopes WHERE id = 'env_r'"))
      .toEqual([{ tipo_orcamento: 'diario', v: 40, dias_semana: [1, 2, 3, 4, 5], descontar_feriados: true }])
  })
})

describe('valor neutro de coluna opcional', () => {
  it('vazio, falso e os padrões listados são neutros; valor de verdade não é', () => {
    for (const v of [null, undefined, false, '', [], {}, '[]']) expect(valorNeutro('envelopes', 'dias_semana', v)).toBe(true)
    expect(valorNeutro('envelopes', 'tipo_orcamento', 'mensal')).toBe(true)
    expect(valorNeutro('envelopes', 'tipo_orcamento', 'diario')).toBe(false)
    expect(valorNeutro('envelopes', 'dias_semana', [1])).toBe(false)
    expect(valorNeutro('envelopes', 'descontar_feriados', true)).toBe(false)
    expect(valorNeutro('agendamentos', 'valor_status', 'confirmado')).toBe(true)
    expect(valorNeutro('agendamentos', 'valor_status', 'projetado')).toBe(false)
    expect(valorNeutro('agendamentos', 'sincronizar_agenda', true)).toBe(true)
    expect(valorNeutro('lancamentos', 'composicao', { itens: [] })).toBe(false)
  })
})
