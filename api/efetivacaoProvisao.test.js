import process from 'node:process'
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import jwt from 'jsonwebtoken'
import { SQL_CENTRAL, usarBancos } from './_testes/pglite.js'
import { _definirFabricaDePool } from './_conexao.js'
import { _limparCacheColunasOpcionais, _limparCacheColunasDaTabela, recursosDoBanco } from './_db.js'
import { scheduleToRow, rowToSchedule } from '../src/lib/db.js'
import { aplicarEfetivacao, situacaoDesfazer } from '../src/lib/efetivacaoProvisao.js'
import { agendamentoDaEfetivacao } from '../src/lib/herancaCampos.js'

// Vínculo da efetivação de provisão (agendamentos.efetivacoes) persistido de verdade: grava pelo
// /api/sync (o mesmo caminho do app), relê com SELECT * (o do /api/load) e o desfazer continua
// possível — é o que vale depois de recarregar a página ou abrir em outro aparelho.
// Ambiente sem a migração: [] passa como sempre; vínculo de verdade → 409 (nada some calado).

const { default: syncHandler } = await import('./sync.js')

const SECRET = 'segredo-de-teste'
const raiz = fileURLToPath(new URL('../supabase/', import.meta.url))
const ESTRUTURA = readFileSync(raiz + 'estrutura_base.sql', 'utf-8')
const NOVA = '2026-11-05b_provisao_efetivacoes.sql'
const lerMigracoes = (filtro) => readdirSync(raiz + 'migrations').filter(f => f.endsWith('.sql') && filtro(f)).sort()
  .map(f => readFileSync(raiz + 'migrations/' + f, 'utf-8')).join('\n')

let central, antigo, novo
beforeAll(async () => {
  central = new PGlite()
  await central.exec(SQL_CENTRAL)
  await central.exec("UPDATE ambientes SET database_name = 'banco_vm' WHERE sigla = 'vm'")
  antigo = new PGlite()
  await antigo.exec(ESTRUTURA + '\n' + lerMigracoes(f => f !== NOVA))
  novo = new PGlite()
  await novo.exec(ESTRUTURA + '\n' + lerMigracoes(() => true))
  // A migração é idempotente (roda de novo sem erro).
  await novo.exec(readFileSync(raiz + 'migrations/' + NOVA, 'utf-8'))
  for (const b of [antigo, novo]) {
    await b.exec("INSERT INTO usuarios (id, username, nome, email, senha_hash, nivel) VALUES ('u1', 'admin', 'Admin', 'admin@teste.local', 'x', 'admin')")
  }
}, 180_000)

let envOriginal
const usar = (b) => {
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
  // Corpo como o navegador manda (JSON).
  await syncHandler({ method: 'POST', body: JSON.parse(JSON.stringify(body)), url: '/api/sync', headers: { host: 'www.finup.app.br', authorization: `Bearer ${tk}` } }, res)
  return res
}

const prov = {
  id: 'prov_teste', description: 'PROVISÃO TESTE', transactionType: 'expense', accountId: null, amount: 200,
  frequency: 'weekly', startDate: '2026-11-13', occurrenceType: 'continuous', installments: 0,
  registered: [], skipped: [], overrides: {}, autoRegister: false, isProvisao: true, efetivacoes: [],
}
const efetivado = () => {
  const desp = agendamentoDaEfetivacao(prov, { id: 'desp_teste', valor: 230, date: '2026-11-16' })
  return aplicarEfetivacao([prov], prov.id, { valor: 230, dataReal: '2026-11-16', ocorrencia: '2026-11-13', aplicarProximas: true, despesa: desp, id: 'efet_t', em: '2026-11-16T12:00:00.000Z' })
}

describe('efetivações de provisão no banco', () => {
  it('8. grava pelo sync e volta igual no load (recarregar / outro aparelho); desfazer segue possível', async () => {
    usar(novo)
    const r = efetivado()
    const res = await sync({ type: 'section', table: 'agendamentos', upsert: r.schedules.map(scheduleToRow), delete: [] })
    expect(res.statusCode).toBe(200)
    expect(res.body.written.upserted).toBe(2)
    const rows = (await novo.query("SELECT * FROM agendamentos WHERE id IN ('prov_teste', 'desp_teste') ORDER BY id")).rows
    const lidos = rows.map(rowToSchedule)
    const p = lidos.find(s => s.id === 'prov_teste')
    expect(p.efetivacoes).toEqual(r.provisao.efetivacoes)
    expect(p.efetivacoes[0]).toMatchObject({ ocorrencia: '2026-11-13', dataReal: '2026-11-16', despesaId: 'desp_teste', aplicarProximas: true, anterior: { startDate: '2026-11-13', nextOccurrence: null } })
    // DATE lido como texto (o PGlite devolve Date com fuso; o pg do servidor devolve a data).
    expect((await novo.query("SELECT next_occurrence::text AS n FROM agendamentos WHERE id = 'prov_teste'")).rows[0].n).toBe('2026-11-23')
    expect(lidos.find(s => s.id === 'desp_teste').startDate).toMatch(/^2026-11-16/)
    expect(situacaoDesfazer(lidos, 'desp_teste').pode).toBe(true)
  })

  it('agendamento comum sem efetivações: coluna fica []', async () => {
    usar(novo)
    const res = await sync({ type: 'section', table: 'agendamentos', upsert: [scheduleToRow({ ...prov, id: 'comum', isProvisao: false, efetivacoes: undefined })], delete: [] })
    expect(res.statusCode).toBe(200)
    expect((await novo.query("SELECT efetivacoes FROM agendamentos WHERE id = 'comum'")).rows[0].efetivacoes).toEqual([])
  })

  it('ambiente sem a migração: [] grava como sempre; vínculo de verdade → 409, nada gravado', async () => {
    usar(antigo)
    expect((await recursosDoBanco(async (s, p) => (await antigo.query(s, p)).rows)).efetivacoesProvisao).toBe(false)
    const ok = await sync({ type: 'section', table: 'agendamentos', upsert: [scheduleToRow(prov)], delete: [] })
    expect(ok.statusCode).toBe(200)
    const recusa = await sync({ type: 'section', table: 'agendamentos', upsert: [scheduleToRow(efetivado().provisao)], delete: [] })
    expect(recusa.statusCode).toBe(409)
    expect(recusa.body.colunas).toEqual(['efetivacoes'])
    expect((await antigo.query("SELECT start_date FROM agendamentos WHERE id = 'prov_teste'")).rows[0].start_date).toMatch(/^2026-11-13/)
  })
})
