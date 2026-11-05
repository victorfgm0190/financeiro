import process from 'node:process'
import { execFileSync } from 'node:child_process'
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import jwt from 'jsonwebtoken'
import { SQL_CENTRAL, usarBancos } from './_testes/pglite.js'
import { _definirFabricaDePool } from './_conexao.js'
import { _limparCacheColunasOpcionais, _limparCacheColunasDaTabela } from './_db.js'
import { txToRow } from '../src/lib/db.js'
import { montarCenario, F, CONTA_RESERVA, CONTA_CORRENTE } from '../src/lib/__fixtures__/cenarioVirada.js'

// Virada assistida no banco (PGlite): prévia, gravação atômica e idempotente, desfazer sem
// fantasma, recálculo retroativo, validação no servidor, dois clientes sem mistura.

const { default: viradaHandler } = await import('./reserve-virada.js')
const { default: syncHandler } = await import('./sync.js')
const { default: ajustesHandler } = await import('./reserve-adjustments.js')
const { default: snapshotsHandler } = await import('./reserve-snapshots.js')
const { default: periodosHandler } = await import('./reserve-periods.js')
const { default: razaoHandler } = await import('./reserve-daily-ledger.js')

const SECRET = 'segredo-de-teste'
const raiz = fileURLToPath(new URL('../supabase/', import.meta.url))
const ESTRUTURA = readFileSync(raiz + 'estrutura_base.sql', 'utf-8')
const NOVA = '2026-11-05c_virada_reserva.sql'
const lerMigracoes = (filtro) => readdirSync(raiz + 'migrations').filter(f => f.endsWith('.sql') && filtro(f)).sort()
  .map(f => readFileSync(raiz + 'migrations/' + f, 'utf-8')).join('\n')

let central, bancoA, bancoB, antigo
const AMB = { a: null, b: null, antigo: null }

async function semear(b, c) {
  await b.query('INSERT INTO configuracoes (id, financial_month_start_day, financial_month_mode) VALUES (1, 15, $1) ON CONFLICT (id) DO UPDATE SET financial_month_start_day = 15', ['custom'])
  for (const a of c.accounts) await b.query('INSERT INTO contas (id, name, type, initial_balance, balance) VALUES ($1, $2, $3, $4, $4)', [a.id, a.name, a.type, a.initialBalance])
  for (const f of c.functions) await b.query('INSERT INTO reserve_functions (id, name, account_id, ordem) VALUES ($1, $2, $3, $4)', [f.id, f.name, f.accountId, f.ordem])
  for (const p of c.periods) await b.query('INSERT INTO reserve_periods (id, function_id, data_inicio, saldo_inicial) VALUES ($1, $2, $3, $4)', [p.id, p.function_id, p.data_inicio, p.saldo_inicial])
  for (const s of c.snapshots) {
    await b.query(
      `INSERT INTO reserve_period_snapshots (id, periodo_id, data_inicio, data_fim, function_id, function_name, saldo_inicial, entradas, saidas, ajuste, saldo, saldo_atualizado)
            VALUES ($1, $2, $3, $4, $5, $6, 0, 0, 0, 0, $7, $7)`,
      [s.id, s.periodo_id, s.data_inicio, s.data_fim, s.function_id, s.function_name, s.saldo])
  }
  for (const t of c.transactions) {
    await b.query('INSERT INTO lancamentos (id, type, amount, date, account_id, to_account_id, reserva_funcao_id, description) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [t.id, t.type, t.amount, t.date, t.accountId, t.toAccountId || null, t.reservaFuncaoId || null, t.description || ''])
  }
  for (const a of c.adjustments) {
    await b.query('INSERT INTO reserve_adjustments (id, function_id, data, valor, observacao, lancamento_id) VALUES ($1, $2, $3, $4, $5, $6)',
      [a.id, a.function_id, a.data, a.valor, a.observacao, a.lancamento_id])
  }
}

async function novoBanco({ migracaoNova = true, comDados = true } = {}) {
  const b = new PGlite()
  await b.exec(ESTRUTURA + '\n' + lerMigracoes(f => migracaoNova || f !== NOVA))
  await b.exec("INSERT INTO usuarios (id, username, nome, email, senha_hash, nivel) VALUES ('u1', 'admin', 'Admin', 'admin@teste.local', 'x', 'admin')")
  if (comDados) await semear(b, montarCenario())
  return b
}

beforeAll(async () => {
  central = new PGlite()
  await central.exec(SQL_CENTRAL)
  await central.exec("UPDATE ambientes SET database_name = 'banco_a' WHERE sigla = 'vm'")
  await central.exec(`INSERT INTO ambientes (id, sigla, nome, database_name, status) VALUES
    ('amb-b', 'cb', 'Cliente B', 'banco_b', 'ativo'), ('amb-antigo', 'old', 'Antigo', 'banco_antigo', 'ativo')`)
  AMB.a = (await central.query("SELECT id FROM ambientes WHERE sigla = 'vm'")).rows[0].id
  AMB.b = 'amb-b'
  AMB.antigo = 'amb-antigo'
}, 180_000)

beforeEach(async () => {
  // Um banco novo por teste: cada caso parte do cenário do pedido (dia 15, fechamento antigo em 31/07).
  bancoA = await novoBanco()
  bancoB = await novoBanco({ comDados: false })
  antigo = await novoBanco({ migracaoNova: false })
  usarBancos({ central, banco_a: () => bancoA, banco_b: () => bancoB, banco_antigo: () => antigo })
  _limparCacheColunasOpcionais()
  _limparCacheColunasDaTabela()
  process.env.JWT_SECRET = SECRET
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-20T15:00:00Z'))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
}, 120_000)
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
afterAll(() => { _definirFabricaDePool(null) })

const resposta = () => ({
  statusCode: 200, body: undefined, headers: {},
  status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this }, end() { return this }, setHeader(k, v) { this.headers[k] = v },
})
const token = ({ amb = AMB.a, sigla = 'vm', nivel = 'admin', perfis = 'todos', permissoes = {} } = {}) =>
  jwt.sign({ sub: 'u1', org: 'o1', nivel, permissoes, perfis, username: 'admin', origem: 'db', amb, amb_sigla: sigla }, SECRET)
async function chamar(handler, { method = 'GET', url, body, tk = token() }) {
  const res = resposta()
  // O ambiente do token tem de ser o do endereço: vm no www, os demais em <sigla>.finup.app.br.
  const sigla = jwt.decode(tk)?.amb_sigla
  const host = !sigla || sigla === 'vm' ? 'www.finup.app.br' : `${sigla}.finup.app.br`
  await handler({ method, url, body: body ? JSON.parse(JSON.stringify(body)) : undefined, query: {}, headers: { host, authorization: `Bearer ${tk}` } }, res)
  return res
}
const HOJE = '2026-09-20'
const status = (tk) => chamar(viradaHandler, { url: `/api/reserve-virada?hoje=${HOJE}`, tk })
const acao = (body, tk) => chamar(viradaHandler, { method: 'POST', url: '/api/reserve-virada', body: { hoje: HOJE, ...body }, tk })
const linhas = async (b, sql, p = []) => (await b.query(sql, p)).rows

describe('carregamento', () => {
  // A Vercel roda as rotas no Node puro (sem o resolvedor do Vite): um import de módulo do navegador
  // (ex.: src/lib/db.js) passaria nos testes e quebraria em produção.
  it('as rotas novas e alteradas carregam no Node puro', () => {
    for (const f of ['reserve-virada', 'sync', 'reserve-daily-ledger', 'reserve-adjustments', 'reserve-periods', 'reserve-snapshots']) {
      const url = new URL(`./${f}.js`, import.meta.url).href
      expect(() => execFileSync(process.execPath, ['-e', `import(${JSON.stringify(url)}).catch(e => { console.error(e.message); process.exit(1) })`], { stdio: 'pipe' })).not.toThrow()
    }
  }, 60_000)
})

describe('migração', () => {
  it('é idempotente (roda de novo sem erro)', async () => {
    await bancoA.exec(readFileSync(raiz + 'migrations/' + NOVA, 'utf-8'))
    expect((await linhas(bancoA, "SELECT to_regclass('reserve_viradas') IS NOT NULL AS t"))[0].t).toBe(true)
  })
})

describe('status e prévia', () => {
  it('lista os meses pendentes em ordem e a pergunta ligada por padrão', async () => {
    const r = await status()
    expect(r.statusCode).toBe(200)
    expect(r.body.perguntar).toBe(true)
    expect(r.body.ultimoCorte).toBe('2026-07-31')
    expect(r.body.pendentes).toEqual([{ inicio: '2026-08-01', fim: '2026-08-14' }, { inicio: '2026-08-15', fim: '2026-09-14' }])
    expect(r.body.podeDesfazer).toBe(false)
  })

  it('opção desligada no banco → perguntar = false (a virada manual continua)', async () => {
    await bancoA.query('UPDATE configuracoes SET reserva_perguntar_virada = false WHERE id = 1')
    const r = await status()
    expect(r.body.perguntar).toBe(false)
    expect(r.body.pendentes).toHaveLength(2)
  })

  it('prévia de 14/08: 1.710,00 nas funções e na conta, e o razão recalculado com o banco', async () => {
    const r = await acao({ acao: 'previa', fim: '2026-08-14' })
    expect(r.statusCode).toBe(200)
    expect(r.body.bloqueios).toEqual([])
    const conta = r.body.previa.contas[0]
    expect(conta.somaFuncoes).toBe(1710)
    expect(conta.saldoConta).toBe(1710)
    const razao = await linhas(bancoA, "SELECT saldo_real_conta::float AS real, saldo_acumulado::float AS acum FROM reserve_daily_ledger WHERE snapshot_date = '2026-08-14' ORDER BY function_id")
    expect(razao).toHaveLength(3)
    expect(razao[0].real).toBe(1710)
    // nada foi gravado como virada
    expect(await linhas(bancoA, 'SELECT id FROM reserve_viradas')).toEqual([])
  })

  it('validação no servidor: mês fora de ordem e mês não encerrado', async () => {
    const fora = await acao({ acao: 'confirmar', fim: '2026-09-14', chave: 'k' })
    expect(fora.statusCode).toBe(422)
    expect(fora.body.codigo).toBe('mes_anterior_aberto')
    const aberto = await acao({ acao: 'confirmar', fim: '2026-10-14', chave: 'k2' })
    expect(aberto.statusCode).toBe(422)
    expect(aberto.body.codigo).toBe('mes_nao_encerrado')
    expect(await linhas(bancoA, 'SELECT id FROM reserve_viradas')).toEqual([])
  })
})

describe('confirmar', () => {
  it('grava o mês numa transação: virada, snapshots (Ajuste e Rendimentos separados) e períodos', async () => {
    const r = await acao({ acao: 'confirmar', fim: '2026-08-14', chave: 'c1' })
    expect(r.statusCode).toBe(200)
    expect(r.body.criados).toEqual({ snapshots: 3, periodos: 3 })
    const v = await linhas(bancoA, "SELECT id, status, data_inicio::text AS i, data_corte::text AS c, resumo FROM reserve_viradas")
    expect(v).toHaveLength(1)
    expect(v[0]).toMatchObject({ status: 'ativa', i: '2026-08-01', c: '2026-08-14' })
    expect(v[0].resumo.contas[0]).toMatchObject({ somaFuncoes: 1710, saldoConta: 1710, diferenca: 0, rendimentosMes: 160 })
    const snaps = await linhas(bancoA, "SELECT function_id, ajuste::float AS aj, rendimentos::float AS rend, saldo::float AS saldo FROM reserve_period_snapshots WHERE virada_id = $1", [v[0].id])
    expect(snaps).toHaveLength(3)
    expect(snaps.every(s => s.aj === 0 && s.rend > 0)).toBe(true)
    expect(Math.round(snaps.reduce((t, s) => t + s.saldo, 0) * 100) / 100).toBe(1710)
    const pers = await linhas(bancoA, "SELECT data_inicio::text AS d FROM reserve_periods WHERE virada_id = $1", [v[0].id])
    expect(pers.map(p => p.d)).toEqual(['2026-08-15', '2026-08-15', '2026-08-15'])
  })

  it('clique duplo (mesma chave) devolve a mesma virada; outra sessão (outra chave) é recusada; nada duplica', async () => {
    const r1 = await acao({ acao: 'confirmar', fim: '2026-08-14', chave: 'dup' })
    const r2 = await acao({ acao: 'confirmar', fim: '2026-08-14', chave: 'dup' })
    expect(r2.statusCode).toBe(200)
    expect(r2.body.repetida).toBe(true)
    expect(r2.body.virada.id).toBe(r1.body.virada.id)
    const r3 = await acao({ acao: 'confirmar', fim: '2026-08-14', chave: 'outra-aba' })
    expect(r3.statusCode).toBe(409)
    expect(r3.body.codigo).toBe('mes_ja_fechado')
    expect(await linhas(bancoA, 'SELECT id FROM reserve_viradas')).toHaveLength(1)
    expect(await linhas(bancoA, 'SELECT id FROM reserve_period_snapshots WHERE virada_id IS NOT NULL')).toHaveLength(3)
    expect(await linhas(bancoA, 'SELECT id FROM reserve_periods WHERE virada_id IS NOT NULL')).toHaveLength(3)
  })

  it('o banco não aceita duas viradas ativas do mesmo mês (índice único)', async () => {
    await bancoA.query("INSERT INTO reserve_viradas (data_inicio, data_corte) VALUES ('2026-08-01', '2026-08-14')")
    await expect(bancoA.query("INSERT INTO reserve_viradas (data_inicio, data_corte) VALUES ('2026-08-01', '2026-08-14')")).rejects.toThrow()
  })

  it('vários meses pendentes: um por vez, em ordem; 14/09 fecha em 2.050,00', async () => {
    await acao({ acao: 'confirmar', fim: '2026-08-14', chave: 'm1' })
    const st = await status()
    expect(st.body.pendentes).toEqual([{ inicio: '2026-08-15', fim: '2026-09-14' }])
    const p2 = await acao({ acao: 'previa', fim: '2026-09-14' })
    expect(p2.body.previa.contas[0]).toMatchObject({ somaFuncoes: 2050, saldoConta: 2050, diferenca: 0 })
    const ipva = p2.body.previa.linhas.find(l => l.functionId === F.ipva)
    expect(ipva.entradas).toBe(200) // o mês novo recomeça as colunas
    const r2 = await acao({ acao: 'confirmar', fim: '2026-09-14', chave: 'm2' })
    expect(r2.statusCode).toBe(200)
    expect((await status()).body.pendentes).toEqual([])
  })
})

describe('desfazer', () => {
  it('desfaz só a mais recente, depois de "recarregar", sem snapshot fantasma; pode refazer', async () => {
    await acao({ acao: 'confirmar', fim: '2026-08-14', chave: 'd1' })
    await acao({ acao: 'confirmar', fim: '2026-09-14', chave: 'd2' })
    expect((await status()).body.podeDesfazer).toBe(true)
    const u = await acao({ acao: 'desfazer' })
    expect(u.statusCode).toBe(200)
    expect(u.body.removidos).toEqual({ snapshots: 3, periodos: 3 })
    expect(await linhas(bancoA, "SELECT id FROM reserve_period_snapshots WHERE data_fim = '2026-09-14'")).toEqual([])
    expect(await linhas(bancoA, "SELECT id FROM reserve_periods WHERE data_inicio = '2026-09-15'")).toEqual([])
    expect((await linhas(bancoA, "SELECT status FROM reserve_viradas WHERE data_corte = '2026-09-14'"))[0].status).toBe('desfeita')
    const st = await status()
    expect(st.body.pendentes).toEqual([{ inicio: '2026-08-15', fim: '2026-09-14' }])
    expect(st.body.ultimaVirada.data_corte).toBe('2026-08-14')
    const refeita = await acao({ acao: 'confirmar', fim: '2026-09-14', chave: 'd3' })
    expect(refeita.statusCode).toBe(200)
  })

  it('o fechamento antigo (anterior à virada assistida) não é desfeito por aqui', async () => {
    const u = await acao({ acao: 'desfazer' })
    expect(u.statusCode).toBe(422)
    expect(u.body.codigo).toBe('nada_para_desfazer')
    expect((await status()).body.motivoDesfazer).toMatch(/antes da virada assistida/)
  })

  it('período criado pela virada não pode ser apagado sozinho (deixaria fantasma)', async () => {
    await acao({ acao: 'confirmar', fim: '2026-08-14', chave: 'p1' })
    const [{ id }] = await linhas(bancoA, 'SELECT id FROM reserve_periods WHERE virada_id IS NOT NULL LIMIT 1')
    const r = await chamar(periodosHandler, { method: 'DELETE', url: `/api/reserve-periods?id=${id}` })
    expect(r.statusCode).toBe(409)
  })
})

describe('lançamento retroativo', () => {
  it('lançamento em mês fechado recalcula a virada e as seguintes, registra antes/depois e avisa', async () => {
    await acao({ acao: 'confirmar', fim: '2026-08-14', chave: 'r1' })
    await acao({ acao: 'confirmar', fim: '2026-09-14', chave: 'r2' })
    const tx = { id: 'retro', type: 'transfer', amount: 40, date: '2026-08-10', accountId: CONTA_CORRENTE, toAccountId: CONTA_RESERVA, reservaFuncaoId: F.ipva, description: 'Depósito esquecido' }
    const s = await chamar(syncHandler, { method: 'POST', url: '/api/sync', body: { type: 'section', table: 'lancamentos', upsert: [txToRow(tx)], delete: [] } })
    expect(s.statusCode).toBe(200)
    expect(s.body.viradaRecalculada).toBeGreaterThan(0)
    const snap = await linhas(bancoA, "SELECT entradas::float AS e FROM reserve_period_snapshots WHERE data_fim = '2026-08-14' AND function_id = $1", [F.ipva])
    expect(snap[0].e).toBe(40)
    const log = await linhas(bancoA, "SELECT campo, tabela, antes::float AS antes, depois::float AS depois FROM reserve_virada_recalculos WHERE function_id = $1", [F.ipva])
    const perSet = log.filter(l => l.tabela === 'reserve_periods')
    expect(perSet).toHaveLength(2) // período de 15/08 e de 15/09
    for (const l of perSet) expect(Math.round((l.depois - l.antes) * 100) / 100).toBe(40)
    // sem registros novos
    expect(await linhas(bancoA, 'SELECT id FROM reserve_periods WHERE virada_id IS NOT NULL')).toHaveLength(6)
    const st = await status()
    expect(st.body.recalculos.length).toBe(log.length)
    await acao({ acao: 'ciente', ids: st.body.recalculos.map(r => r.id) })
    expect((await status()).body.recalculos).toEqual([])
    // o mesmo sync de novo não muda nada nem loga de novo
    await chamar(syncHandler, { method: 'POST', url: '/api/sync', body: { type: 'section', table: 'lancamentos', upsert: [txToRow(tx)], delete: [] } })
    expect(await linhas(bancoA, 'SELECT id FROM reserve_virada_recalculos')).toHaveLength(log.length)
  })

  it('ajuste com data em mês fechado também recalcula; ajuste no mês aberto não', async () => {
    await acao({ acao: 'confirmar', fim: '2026-08-14', chave: 'a1' })
    await chamar(ajustesHandler, { method: 'POST', url: '/api/reserve-adjustments', body: { id: 'aj_aberto', function_id: F.seguro, data: '2026-09-01', valor: 5, observacao: 'x' } })
    expect(await linhas(bancoA, 'SELECT id FROM reserve_virada_recalculos')).toEqual([])
    await chamar(ajustesHandler, { method: 'POST', url: '/api/reserve-adjustments', body: { id: 'aj_retro', function_id: F.seguro, data: '2026-08-05', valor: 7, observacao: 'x' } })
    const snap = await linhas(bancoA, "SELECT ajuste::float AS a FROM reserve_period_snapshots WHERE data_fim = '2026-08-14' AND function_id = $1", [F.seguro])
    expect(snap[0].a).toBe(7)
  })
})

describe('isolamento, permissões e compatibilidade', () => {
  it('dois clientes não se misturam', async () => {
    await acao({ acao: 'confirmar', fim: '2026-08-14', chave: 'iso' })
    const tkB = token({ amb: AMB.b, sigla: 'cb' })
    const stB = await status(tkB)
    expect(stB.body.pendentes).toEqual([]) // cliente B não tem funções
    expect(await linhas(bancoB, 'SELECT id FROM reserve_viradas')).toEqual([])
    expect(await linhas(bancoA, 'SELECT id FROM reserve_viradas')).toHaveLength(1)
  })

  it('usuário de consulta não grava; usuário restrito a perfis não faz virada', async () => {
    const consulta = await acao({ acao: 'confirmar', fim: '2026-08-14', chave: 'x' }, token({ nivel: 'consulta' }))
    expect(consulta.statusCode).toBe(403)
    const restrito = await acao({ acao: 'confirmar', fim: '2026-08-14', chave: 'y' }, token({ perfis: ['perfil1'] }))
    expect(restrito.statusCode).toBe(403)
    expect((await status(token({ perfis: ['perfil1'] }))).body.pendentes).toEqual([])
    expect(await linhas(bancoA, 'SELECT id FROM reserve_viradas')).toEqual([])
  })

  it('banco sem a migração: sem pergunta e virada recusada com explicação', async () => {
    const tk = token({ amb: AMB.antigo, sigla: 'old' })
    expect((await status(tk)).body.disponivel).toBe(false)
    const r = await acao({ acao: 'confirmar', fim: '2026-08-14', chave: 'z' }, tk)
    expect(r.statusCode).toBe(409)
    expect(r.body.codigo).toBe('banco_desatualizado')
  })

  it('snapshots antigos continuam legíveis (rendimentos NULL) e o POST antigo de snapshot é recusado', async () => {
    const g = await chamar(snapshotsHandler, { url: '/api/reserve-snapshots' })
    expect(g.body.snapshots).toHaveLength(3)
    expect(g.body.snapshots[0].rendimentos).toBeNull()
    expect(g.body.snapshots[0].data_fim).toBe('2026-07-31')
    const p = await chamar(snapshotsHandler, { method: 'POST', url: '/api/reserve-snapshots', body: { snapshots: [{ id: 's', function_id: F.ipva, data_inicio: '2026-08-01', data_fim: '2026-08-14' }] } })
    expect(p.statusCode).toBe(409)
  })

  it('razão gravado pelo servidor ignora linhas mandadas pela tela (Saldo Real do navegador)', async () => {
    const r = await chamar(razaoHandler, { method: 'POST', url: '/api/reserve-daily-ledger', body: { hoje: HOJE, rows: [{ function_id: F.ipva, snapshot_date: '2026-08-14', saldo_real_conta: 99999 }] } })
    expect(r.statusCode).toBe(200)
    const [l] = await linhas(bancoA, "SELECT saldo_real_conta::float AS real FROM reserve_daily_ledger WHERE snapshot_date = '2026-08-14' AND function_id = $1", [F.ipva])
    expect(l.real).toBe(1710)
  })
})

describe('falha no gancho de recálculo (nunca silenciosa)', () => {
  const txRetro = { id: 'retro_f', type: 'transfer', amount: 40, date: '2026-08-10', accountId: CONTA_CORRENTE, toAccountId: CONTA_RESERVA, reservaFuncaoId: F.ipva, description: 'Depósito esquecido' }
  const syncTx = (tx) => chamar(syncHandler, { method: 'POST', url: '/api/sync', body: { type: 'section', table: 'lancamentos', upsert: [txToRow(tx)], delete: [] } })
  const logs = () => console.error.mock.calls.map(c => c.map(String).join(' ')).join('\n')

  it('verificação falha: o lançamento é gravado, a resposta avisa e fica pendência visível; log sem dados financeiros', async () => {
    await acao({ acao: 'confirmar', fim: '2026-08-14', chave: 'f1' })
    await bancoA.exec('ALTER TABLE reserve_viradas RENAME COLUMN data_corte TO data_corte_x')
    const s = await syncTx(txRetro)
    expect(s.statusCode).toBe(200)
    expect(s.body.written.upserted).toBe(1)
    expect(s.body.viradaRecalculoPendente).toBe(true)
    expect(await linhas(bancoA, "SELECT id FROM lancamentos WHERE id = 'retro_f'")).toHaveLength(1)
    expect(await linhas(bancoA, "SELECT id FROM reserve_virada_recalculos WHERE campo = 'recalculo_pendente' AND visto_em IS NULL")).toHaveLength(1)
    expect(logs()).toMatch(/verificação de mês fechado falhou/)
    expect(logs()).not.toMatch(/Depósito esquecido|40|2026-08-10/)
  })

  it('recálculo falha: lançamento gravado, pendência registrada; "Refazer recálculo" conclui e dá baixa', async () => {
    await acao({ acao: 'confirmar', fim: '2026-08-14', chave: 'f2' })
    await bancoA.exec('ALTER TABLE reserve_virada_recalculos RENAME COLUMN depois TO depois_x')
    const s = await syncTx(txRetro)
    expect(s.statusCode).toBe(200)
    expect(s.body.viradaRecalculoPendente).toBe(true)
    // nada pela metade: o snapshot continua como antes (transação desfeita)
    expect((await linhas(bancoA, "SELECT entradas::float AS e FROM reserve_period_snapshots WHERE data_fim = '2026-08-14' AND function_id = $1", [F.ipva]))[0].e).toBe(0)
    expect(await linhas(bancoA, "SELECT id FROM reserve_virada_recalculos WHERE campo = 'recalculo_pendente' AND visto_em IS NULL")).toHaveLength(1)
    await bancoA.exec('ALTER TABLE reserve_virada_recalculos RENAME COLUMN depois_x TO depois')
    let st = await status()
    expect(st.body.recalculoPendente).toBe(true)
    const r = await acao({ acao: 'recalcular' })
    expect(r.statusCode).toBe(200)
    expect(r.body.mudancas).toBeGreaterThan(0)
    expect((await linhas(bancoA, "SELECT entradas::float AS e FROM reserve_period_snapshots WHERE data_fim = '2026-08-14' AND function_id = $1", [F.ipva]))[0].e).toBe(40)
    st = await status()
    expect(st.body.recalculoPendente).toBe(false)
    expect(logs()).not.toMatch(/Depósito esquecido/)
  })

  it('ajuste e saldo inicial em mês fechado: falha vira pendência, o registro é gravado', async () => {
    await acao({ acao: 'confirmar', fim: '2026-08-14', chave: 'f3' })
    await bancoA.exec('ALTER TABLE reserve_virada_recalculos RENAME COLUMN depois TO depois_x')
    const aj = await chamar(ajustesHandler, { method: 'POST', url: '/api/reserve-adjustments', body: { id: 'aj_f', function_id: F.seguro, data: '2026-08-05', valor: 7, observacao: 'x' } })
    expect(aj.statusCode).toBe(200)
    expect(aj.body.viradaRecalculoPendente).toBe(true)
    expect(await linhas(bancoA, "SELECT id FROM reserve_adjustments WHERE id = 'aj_f'")).toHaveLength(1)
    const pe = await chamar(periodosHandler, { method: 'POST', url: '/api/reserve-periods', body: { id: 'p_manual', function_id: F.seguro, data_inicio: '2026-08-10', saldo_inicial: 100 } })
    expect(pe.statusCode).toBe(200)
    expect(pe.body.viradaRecalculoPendente).toBe(true)
    expect(await linhas(bancoA, "SELECT id FROM reserve_virada_recalculos WHERE campo = 'recalculo_pendente'")).toHaveLength(2)
    // fora de mês fechado: nada a recalcular, nada pendente
    const ok = await chamar(ajustesHandler, { method: 'POST', url: '/api/reserve-adjustments', body: { id: 'aj_ok', function_id: F.seguro, data: '2026-09-01', valor: 1, observacao: 'x' } })
    expect(ok.body.viradaRecalculoPendente).toBeUndefined()
  })

  it('ambiente sem a migração segue funcionando em Lançamentos, Reservas e Razão; só a virada fica bloqueada', async () => {
    const tk = token({ amb: AMB.antigo, sigla: 'old' })
    const s = await chamar(syncHandler, { method: 'POST', url: '/api/sync', body: { type: 'section', table: 'lancamentos', upsert: [txToRow(txRetro)], delete: [] }, tk })
    expect(s.statusCode).toBe(200)
    expect(s.body.viradaRecalculoPendente).toBeUndefined()
    const aj = await chamar(ajustesHandler, { method: 'POST', url: '/api/reserve-adjustments', body: { id: 'aj_old', function_id: F.seguro, data: '2026-08-05', valor: 7, observacao: 'x' }, tk })
    expect(aj.statusCode).toBe(200)
    expect(aj.body.viradaRecalculoPendente).toBeUndefined()
    const pe = await chamar(periodosHandler, { method: 'POST', url: '/api/reserve-periods', body: { id: 'p_old', function_id: F.seguro, data_inicio: '2026-08-10', saldo_inicial: 100 }, tk })
    expect(pe.statusCode).toBe(200)
    const del = await chamar(periodosHandler, { method: 'DELETE', url: '/api/reserve-periods?id=p_old', tk })
    expect(del.statusCode).toBe(200)
    expect((await chamar(periodosHandler, { url: '/api/reserve-periods', tk })).statusCode).toBe(200)
    expect((await chamar(ajustesHandler, { url: '/api/reserve-adjustments', tk })).statusCode).toBe(200)
    expect((await chamar(snapshotsHandler, { url: '/api/reserve-snapshots', tk })).statusCode).toBe(200)
    const rz = await chamar(razaoHandler, { method: 'POST', url: '/api/reserve-daily-ledger', body: { hoje: HOJE }, tk })
    expect(rz.statusCode).toBe(200)
    expect(rz.body.upserted).toBeGreaterThan(0)
    expect((await chamar(razaoHandler, { url: '/api/reserve-daily-ledger?days=30', tk })).body.rows.length).toBeGreaterThan(0)
    expect(console.error.mock.calls.filter(c => String(c[0]).includes('[virada]'))).toEqual([])
    const v = await acao({ acao: 'previa', fim: '2026-08-14' }, tk)
    expect(v.statusCode).toBe(409)
    expect(v.body.codigo).toBe('banco_desatualizado')
  })
})

describe('ambiente que nunca fez virada (servidor)', () => {
  const tkB = () => token({ amb: AMB.b, sigla: 'cb' })
  const novaFuncaoB = (id, criada) => bancoB.query("INSERT INTO reserve_functions (id, name, account_id, created_at) VALUES ($1, $1, 'acc_b', $2)", [id, criada])

  it('sem funções: nenhuma pergunta; com a 1ª função criada em 10/08: só 01/08 a 31/08 (dia 1), nunca antes', async () => {
    expect((await status(tkB())).body.pendentes).toEqual([])
    await bancoB.query("INSERT INTO contas (id, name, type, initial_balance) VALUES ('acc_b', 'Reserva B', 'checking', 0)")
    await novaFuncaoB('fb2', '2026-09-02T15:00:00Z')
    await novaFuncaoB('fb1', '2026-08-10T15:00:00Z') // vale a data da PRIMEIRA
    expect((await status(tkB())).body.pendentes).toEqual([{ inicio: '2026-08-01', fim: '2026-08-31' }])
    // servidor recusa mês anterior ao início do uso
    const antes = await acao({ acao: 'confirmar', fim: '2026-07-31', chave: 'b0' }, tkB())
    expect(antes.statusCode).toBe(422)
    expect(antes.body.codigo).toBe('antes_do_inicio')
    const previaAntes = await acao({ acao: 'previa', fim: '2026-07-31' }, tkB())
    expect(previaAntes.body.bloqueios[0].codigo).toBe('antes_do_inicio')
    expect(await linhas(bancoB, 'SELECT id FROM reserve_viradas')).toEqual([])
    // o mês do início é liberado
    const ok = await acao({ acao: 'confirmar', fim: '2026-08-31', chave: 'b1' }, tkB())
    expect(ok.statusCode).toBe(200)
    // o outro cliente (com fechamento antigo) segue a regra de sempre, sem mistura
    expect((await status()).body.pendentes).toEqual([{ inicio: '2026-08-01', fim: '2026-08-14' }, { inicio: '2026-08-15', fim: '2026-09-14' }])
    expect(await linhas(bancoA, 'SELECT id FROM reserve_viradas')).toEqual([])
  })

  it('1ª função criada no mês atual: nada pendente; todas as funções excluídas: nenhuma pergunta', async () => {
    await novaFuncaoB('fb_atual', '2026-09-05T15:00:00Z')
    expect((await status(tkB())).body.pendentes).toEqual([])
    await bancoB.query('DELETE FROM reserve_functions')
    expect((await status(tkB())).body.pendentes).toEqual([])
  })
})
