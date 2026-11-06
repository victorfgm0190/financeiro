import process from 'node:process'
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import jwt from 'jsonwebtoken'
import { abrirPGlite, bancoDoArquivo } from './_testes/bancoTeste.js'
import { SQL_CENTRAL, usarBancos } from './_testes/pglite.js'
import { _definirFabricaDePool } from './_conexao.js'
import { _limparCacheColunasOpcionais, _limparCacheColunasDaTabela } from './_db.js'
import { txToRow } from '../src/lib/db.js'
import { saldosDaConta } from '../src/lib/saldos.js'
import { montarCenario, F, CONTA_RESERVA, CONTA_CORRENTE } from '../src/lib/__fixtures__/cenarioVirada.js'

// Período virado exige estorno: todas as portas que mexem no saldo de função de reserva. O cenário tem um
// fechamento antigo em 31/07 (não estornável) e duas viradas assistidas, em 14/08 e 14/09.

const { default: viradaHandler } = await import('./reserve-virada.js')
const { default: syncHandler } = await import('./sync.js')
const { default: bulkHandler } = await import('./transactions-bulk-update.js')
const { default: ajustesHandler } = await import('./reserve-adjustments.js')
const { default: periodosHandler } = await import('./reserve-periods.js')
const { default: pagarHandler } = await import('./financiamento/parcela/[id]/pagar.js')
const { default: criarFinHandler } = await import('./financiamento/criar.js')

const SECRET = 'segredo-de-teste'
const HOJE = '2026-09-20'
const raiz = fileURLToPath(new URL('../supabase/', import.meta.url))
const SQL = readFileSync(raiz + 'estrutura_base.sql', 'utf-8') + '\n' + readdirSync(raiz + 'migrations').filter(f => f.endsWith('.sql')).sort()
  .map(f => readFileSync(raiz + 'migrations/' + f, 'utf-8')).join('\n')

let central, banco, ambId
const linhas = async (sql, p = []) => (await banco.query(sql, p)).rows

async function semear(b, c) {
  await b.query('INSERT INTO configuracoes (id, financial_month_start_day, financial_month_mode) VALUES (1, 15, $1) ON CONFLICT (id) DO UPDATE SET financial_month_start_day = 15, financial_month_mode = $1', ['fixed'])
  for (const a of c.accounts) await b.query('INSERT INTO contas (id, name, type, initial_balance, balance) VALUES ($1, $2, $3, $4, $4)', [a.id, a.name, a.type, a.initialBalance ?? 0])
  for (const f of c.functions) await b.query('INSERT INTO reserve_functions (id, name, account_id, ordem) VALUES ($1, $2, $3, $4)', [f.id, f.name, f.accountId, f.ordem ?? 0])
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

beforeAll(async () => {
  central = abrirPGlite()
  await central.exec(SQL_CENTRAL)
  await central.exec("UPDATE ambientes SET database_name = 'banco_vm' WHERE sigla = 'vm'")
  ambId = (await central.query("SELECT id FROM ambientes WHERE sigla = 'vm'")).rows[0].id
}, 180_000)

beforeEach(async () => {
  banco = await bancoDoArquivo(async (b) => {
    await b.exec(SQL)
    await b.exec("INSERT INTO usuarios (id, username, nome, email, senha_hash, nivel) VALUES ('u1', 'admin', 'Admin', 'admin@teste.local', 'x', 'admin')")
    await semear(b, montarCenario())
  })
  usarBancos({ central, banco_vm: () => banco })
  _limparCacheColunasOpcionais()
  _limparCacheColunasDaTabela()
  process.env.JWT_SECRET = SECRET
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`${HOJE}T15:00:00Z`))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  // As duas viradas assistidas do cenário.
  for (const fim of ['2026-08-14', '2026-09-14']) {
    const r = await acao({ acao: 'confirmar', fim, chave: `base-${fim}` })
    expect(r.statusCode).toBe(200)
  }
}, 120_000)
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
afterAll(() => { _definirFabricaDePool(null) })

const token = ({ nivel = 'admin', perfis = 'todos', permissoes = {} } = {}) =>
  jwt.sign({ sub: 'u1', org: 'o1', nivel, permissoes, perfis, username: 'admin', origem: 'db', amb: ambId, amb_sigla: 'vm' }, SECRET)
async function chamar(handler, { method = 'POST', url, body, query = {}, tk = token(), confirmar = false }) {
  const res = { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this }, end() { return this }, setHeader() {}, getHeader() {} }
  const headers = { host: 'www.finup.app.br', authorization: `Bearer ${tk}`, ...(confirmar ? { 'x-confirmar-estorno': '1' } : {}) }
  await handler({ method, url, body, query, headers }, res)
  return res
}
function acao(body, tk) { return chamar(viradaHandler, { url: '/api/reserve-virada', body: { hoje: HOJE, ...body }, tk }) }

const deposito = (id, date, amount = 40, funcao = F.ipva) => ({ id, type: 'transfer', amount, date, accountId: CONTA_CORRENTE, toAccountId: CONTA_RESERVA, reservaFuncaoId: funcao, description: `Depósito ${id}` })
const sync = (upsert, opcoes = {}, del = []) => chamar(syncHandler, { url: '/api/sync', body: { type: 'section', table: 'lancamentos', upsert: upsert.map(txToRow), delete: del, ...(opcoes.corpo || {}) }, ...opcoes })
const ajuste = (id, data, opcoes = {}) => chamar(ajustesHandler, { url: '/api/reserve-adjustments', body: { id, function_id: F.seguro, data, valor: 7, observacao: 'manual' }, ...opcoes })
const saldoInicial = (id, data, opcoes = {}) => chamar(periodosHandler, { url: '/api/reserve-periods', body: { id, function_id: F.seguro, data_inicio: data, saldo_inicial: 500 }, ...opcoes })

const fotoViradas = () => linhas("SELECT id, to_char(data_corte, 'YYYY-MM-DD') AS c FROM reserve_viradas WHERE status = 'ativa' ORDER BY 2")
const fotoSnaps = () => linhas('SELECT id, entradas::float AS e, saldo::float AS s FROM reserve_period_snapshots ORDER BY id')
const existe = async (t, id) => (await linhas(`SELECT id FROM ${t} WHERE id = $1`, [id])).length > 0

// Em cada fechamento refeito, a soma das funções bate com o saldo da conta de reserva na data.
async function saldosBatem() {
  const [conta] = await linhas('SELECT initial_balance::float AS i FROM contas WHERE id = $1', [CONTA_RESERVA])
  const txs = (await linhas('SELECT id, type, amount::float AS amount, left(date, 10) AS date, account_id, to_account_id, account_type FROM lancamentos'))
    .map(t => ({ ...t, accountId: t.account_id, toAccountId: t.to_account_id, accountType: t.account_type }))
  for (const { c } of await fotoViradas()) {
    const [{ soma }] = await linhas("SELECT SUM(saldo)::float AS soma FROM reserve_period_snapshots WHERE to_char(data_fim, 'YYYY-MM-DD') = $1", [c])
    expect(Math.round(soma * 100) / 100).toBe(Math.round(saldosDaConta(CONTA_RESERVA, conta.i, txs, c).balance * 100) / 100)
  }
}

describe('sem confirmação: avisa, mostra a prévia e não grava', () => {
  const recusa = (r, cortes) => {
    expect(r.statusCode).toBe(409)
    expect(r.body.codigo).toBe('periodo_virado')
    expect(r.body.error).toBe('Esse período já foi virado. Para lançar, é preciso estornar a virada.')
    expect(r.body.previa.viradas.map(v => v.data_corte)).toEqual(cortes)
  }
  it('lançamento: da mais recente até a que contém a data', async () => {
    const antes = await fotoSnaps()
    recusa(await sync([deposito('r1', '2026-08-10')]), ['2026-09-14', '2026-08-14'])
    expect(await existe('lancamentos', 'r1')).toBe(false)
    expect(await fotoSnaps()).toEqual(antes)
    recusa(await sync([deposito('r2', '2026-09-05')]), ['2026-09-14'])
  })
  it('editar a data ou o valor, excluir: também; só a categoria ou a descrição: não', async () => {
    await banco.query("INSERT INTO lancamentos (id, type, amount, date, account_id, to_account_id, reserva_funcao_id, description) VALUES ('velho', 'transfer', 25, '2026-08-05', $1, $2, $3, 'Velho')", [CONTA_CORRENTE, CONTA_RESERVA, F.ipva])
    const base = deposito('velho', '2026-08-05', 25)
    expect((await sync([{ ...base, amount: 30 }])).statusCode).toBe(409)
    expect((await sync([], {}, ['velho'])).statusCode).toBe(409)
    expect(await existe('lancamentos', 'velho')).toBe(true)
    expect((await sync([{ ...base, description: 'Outra descrição' }])).statusCode).toBe(200)
    const [l] = await linhas("SELECT description FROM lancamentos WHERE id = 'velho'")
    expect(l.description).toBe('Outra descrição')
  })
  it('edição em massa muda a data para período virado: recusa', async () => {
    await banco.query("INSERT INTO lancamentos (id, type, amount, date, account_id, to_account_id, reserva_funcao_id, description) VALUES ('novo', 'transfer', 25, '2026-09-18', $1, $2, $3, 'Novo')", [CONTA_CORRENTE, CONTA_RESERVA, F.ipva])
    const r = await chamar(bulkHandler, { url: '/api/transactions-bulk-update', body: { ids: ['novo'], date: '2026-09-05' } })
    recusa(r, ['2026-09-14'])
    expect((await linhas("SELECT date FROM lancamentos WHERE id = 'novo'"))[0].date).toContain('2026-09-18')
  })
  it('ajuste manual e saldo inicial', async () => {
    recusa(await ajuste('aj1', '2026-08-05'), ['2026-09-14', '2026-08-14'])
    expect(await existe('reserve_adjustments', 'aj1')).toBe(false)
    recusa(await saldoInicial('per1', '2026-08-10'), ['2026-09-14', '2026-08-14'])
    expect(await existe('reserve_periods', 'per1')).toBe(false)
  })
  it('no período aberto grava direto, sem aviso', async () => {
    expect((await sync([deposito('aberto', '2026-09-16')])).statusCode).toBe(200)
    expect(await existe('lancamentos', 'aberto')).toBe(true)
    expect((await ajuste('aj_aberto', '2026-09-16')).statusCode).toBe(200)
    expect((await fotoViradas()).length).toBe(2)
  })
})

describe('com confirmação: estorna, grava e refaz numa operação só', () => {
  it('lançamento: refaz em ordem; os saldos batem com a conta em cada data', async () => {
    const antes = (await fotoViradas()).map(v => v.id)
    const r = await sync([deposito('r1', '2026-08-10')], { confirmar: true })
    expect(r.statusCode).toBe(200)
    expect(r.body.viradaEstorno).toMatchObject({ estornadas: ['2026-08-14', '2026-09-14'], refeitas: ['2026-08-14', '2026-09-14'], parou: null })
    expect(await existe('lancamentos', 'r1')).toBe(true)
    const depois = await fotoViradas()
    expect(depois.map(v => v.c)).toEqual(['2026-08-14', '2026-09-14'])
    expect(depois.some(v => antes.includes(v.id))).toBe(false)
    const [sn] = await linhas("SELECT entradas::float AS e FROM reserve_period_snapshots WHERE function_id = $1 AND to_char(data_fim, 'YYYY-MM-DD') = '2026-08-14'", [F.ipva])
    expect(sn.e).toBeGreaterThanOrEqual(40)
    await saldosBatem()
  })
  it('ajuste: entra no período e os fechamentos seguintes acompanham', async () => {
    const r = await ajuste('aj1', '2026-08-05', { confirmar: true })
    expect(r.statusCode).toBe(200)
    expect(await existe('reserve_adjustments', 'aj1')).toBe(true)
    // Ajuste sem dinheiro na conta abre diferença: a virada refeita para.
    expect(r.body.viradaEstorno.parou.fim).toBe('2026-08-14')
  })
  it('saldo inicial: grava e refaz', async () => {
    const r = await saldoInicial('per1', '2026-08-10', { confirmar: true })
    expect(r.statusCode).toBe(200)
    expect(await existe('reserve_periods', 'per1')).toBe(true)
    expect(r.body.viradaEstorno.estornadas).toEqual(['2026-08-14', '2026-09-14'])
  })
  it('tudo ou nada: se refazer falhar, o lançamento não fica e as viradas continuam como estavam', async () => {
    const antes = await fotoViradas()
    const snaps = await fotoSnaps()
    // Com outro dia de início do mês, a virada estornada não seria mais o mês pendente: refazer falha.
    await banco.exec('UPDATE configuracoes SET financial_month_start_day = 5')
    const r = await sync([deposito('r1', '2026-08-10')], { confirmar: true })
    expect(r.statusCode).toBeGreaterThanOrEqual(400)
    expect(r.body.error).toMatch(/Nada foi gravado/)
    expect(await fotoViradas()).toEqual(antes)
    expect(await fotoSnaps()).toEqual(snaps)
    expect(await existe('lancamentos', 'r1')).toBe(false)
  })
  it('rendimentos seguintes refeitos: a função que ficou negativa não recebe', async () => {
    await banco.query("INSERT INTO lancamentos (id, type, amount, date, account_id, description) VALUES ('rend', 'income', 100, '2026-09-18', $1, 'Juros')", [CONTA_RESERVA])
    await banco.query("INSERT INTO reserve_adjustments (id, function_id, data, valor, observacao, lancamento_id) VALUES ('adj_rend_rend_ipva', $1, '2026-09-18', 100, 'Rendimento', 'rend')", [F.ipva])
    const [{ s }] = await linhas("SELECT SUM(saldo)::float AS s FROM reserve_period_snapshots WHERE function_id = $1 AND to_char(data_fim, 'YYYY-MM-DD') = '2026-09-14'", [F.ipva])
    const r = await sync([{ id: 'saque', type: 'transfer', amount: s + 500, date: '2026-09-05', accountId: CONTA_RESERVA, toAccountId: CONTA_CORRENTE, reservaFuncaoId: F.ipva, description: 'Saque' }], { confirmar: true })
    expect(r.statusCode).toBe(200)
    const partes = await linhas("SELECT function_id, valor::float AS v FROM reserve_adjustments WHERE lancamento_id = 'rend'")
    expect(partes.some(p => p.function_id === F.ipva)).toBe(false)
    expect(Math.round(partes.reduce((a, p) => a + p.v, 0) * 100) / 100).toBe(100)
  })
})

describe('virada refeita com diferença sem explicação', () => {
  // Sem função, o dinheiro entra na conta e em função nenhuma.
  const semFuncao = (id, date) => ({ id, type: 'transfer', amount: 100, date, accountId: CONTA_CORRENTE, toAccountId: CONTA_RESERVA, reservaFuncaoId: null, description: 'Sem função' })

  it('para, mostra o valor e não distribui; as seguintes só depois da decisão', async () => {
    const ajustesAntes = await linhas('SELECT id FROM reserve_adjustments ORDER BY id')
    const r = await sync([semFuncao('s1', '2026-08-10')], { confirmar: true })
    expect(r.statusCode).toBe(200)
    expect(await existe('lancamentos', 's1')).toBe(true)
    expect(r.body.viradaEstorno.refeitas).toEqual([])
    expect(r.body.viradaEstorno.parou).toMatchObject({ fim: '2026-08-14' })
    expect(r.body.viradaEstorno.parou.contas[0].resto).toBe(100)
    expect(await fotoViradas()).toEqual([])
    expect(await linhas('SELECT id FROM reserve_adjustments ORDER BY id')).toEqual(ajustesAntes)

    // A virada normal decide: Ajuste com função e observação, e a seguinte segue.
    const st = await chamar(viradaHandler, { method: 'GET', url: `/api/reserve-virada?hoje=${HOJE}` })
    expect(st.body.pendentes.map(m => m.fim)).toEqual(['2026-08-14', '2026-09-14'])
    expect((await acao({ acao: 'confirmar', fim: '2026-08-14', chave: 'x1' })).statusCode).toBe(422)
    const d = await acao({ acao: 'confirmar', fim: '2026-08-14', chave: 'x2', decisoes: { [CONTA_RESERVA]: { tipo: 'ajuste', functionId: F.seguro, observacao: 'Acerto' } } })
    expect(d.statusCode).toBe(200)
    expect((await acao({ acao: 'confirmar', fim: '2026-09-14', chave: 'x3' })).statusCode).toBe(200)
    await saldosBatem()
  })
  it('estorno depois de uma decisão "a distribuir" com o mesmo valor refaz sem perguntar de novo', async () => {
    await sync([semFuncao('s1', '2026-08-10')], { confirmar: true })
    await acao({ acao: 'confirmar', fim: '2026-08-14', chave: 'y1', decisoes: { [CONTA_RESERVA]: { tipo: 'a_distribuir' } } })
    await acao({ acao: 'confirmar', fim: '2026-09-14', chave: 'y2' })
    const r = await sync([deposito('r2', '2026-08-11')], { confirmar: true })
    expect(r.body.viradaEstorno.parou).toBeNull()
    expect(r.body.viradaEstorno.refeitas).toEqual(['2026-08-14', '2026-09-14'])
  })
})

describe('lançamentos gravados pelo Patrimônio', () => {
  async function financiamento() {
    await banco.exec(`
      INSERT INTO categorias (id, name, type) VALUES ('cat_p', 'Prestação', 'expense');
      INSERT INTO contas (id, name, type, balance, initial_balance, valor_nota_fiscal, categoria_prestacao_id, categoria_taxa_finan_id)
        VALUES ('bem_x', 'Bem', 'asset', 1000, 1000, 1000, 'cat_p', 'cat_p');`)
    const f = await chamar(criarFinHandler, { url: '/api/financiamento/criar', body: { bem_id: 'bem_x', valor_principal: 1000, num_parcelas: 2, valor_parcela: 500, banco: 'Banco', data_primeira_parcela: '2026-08-01', conta_origem_id: CONTA_CORRENTE } })
    expect(f.body.error).toBeUndefined()
    return (await linhas('SELECT id FROM financing_installments ORDER BY numero_parcela LIMIT 1'))[0].id
  }
  const pagar = (id, opcoes = {}) => chamar(pagarHandler, {
    url: `/api/financiamento/parcela/${id}/pagar`, query: { id }, ...opcoes,
    body: { conta_origem_id: CONTA_RESERVA, data_pagamento: '2026-08-10', valor_pago: 500, debitar_origem: true },
  })

  it('pagar parcela pela conta de reserva em período virado: avisa e não grava; com confirmação, estorna e para na diferença', async () => {
    const id = await financiamento()
    const antes = await linhas('SELECT id FROM lancamentos ORDER BY id')
    const r = await pagar(id)
    expect(r.statusCode).toBe(409)
    expect(r.body.codigo).toBe('periodo_virado')
    expect(await linhas('SELECT id FROM lancamentos ORDER BY id')).toEqual(antes)
    expect((await linhas('SELECT status FROM financing_installments WHERE id = $1', [id]))[0].status).not.toBe('paid')
    const ok = await pagar(id, { confirmar: true })
    expect(ok.statusCode).toBe(200)
    expect((await linhas('SELECT id FROM lancamentos')).length).toBeGreaterThan(antes.length)
    expect(ok.body.viradaEstorno.estornadas).toContain('2026-08-14')
    expect(ok.body.viradaEstorno.parou?.fim).toBe('2026-08-14')
  })
  it('pagar pela conta corrente não passa pelo estorno', async () => {
    const id = await financiamento()
    const r = await chamar(pagarHandler, { url: `/api/financiamento/parcela/${id}/pagar`, query: { id }, body: { conta_origem_id: CONTA_CORRENTE, data_pagamento: '2026-08-10', valor_pago: 500, debitar_origem: true } })
    expect(r.statusCode).toBe(200)
    expect((await fotoViradas()).length).toBe(2)
  })
})

describe('não pode estornar', () => {
  it('data anterior à virada assistida: bloqueia com o motivo, mesmo com confirmação', async () => {
    for (const confirmar of [false, true]) {
      const r = await sync([deposito('antigo', '2026-07-10')], { confirmar })
      expect(r.statusCode).toBe(409)
      expect(r.body.codigo).toBe('periodo_bloqueado')
      expect(r.body.error).toMatch(/antes da virada assistida/)
    }
    expect(await existe('lancamentos', 'antigo')).toBe(false)
    expect((await fotoViradas()).length).toBe(2)
    expect((await ajuste('aj_antigo', '2026-07-10')).body.codigo).toBe('periodo_bloqueado')
    expect((await saldoInicial('per_antigo', '2026-07-10')).body.codigo).toBe('periodo_bloqueado')
  })
  const lancaMasNaoVira = () => token({ nivel: 'personalizado', permissoes: { lancamentos: { ver: true, incluir: true, editar: true, excluir: true } } })
  it('usuário sem a permissão da virada: recebe a mensagem e nada é gravado, com ou sem confirmação', async () => {
    for (const confirmar of [false, true]) {
      const r = await sync([deposito('semperm', '2026-08-10')], { tk: lancaMasNaoVira(), confirmar })
      expect(r.statusCode).toBe(403)
      expect(r.body.codigo).toBe('periodo_virado_sem_permissao')
      expect(r.body.error).toMatch(/já foi virado/)
    }
    expect(await existe('lancamentos', 'semperm')).toBe(false)
    expect((await fotoViradas()).length).toBe(2)
  })
  it('o mesmo usuário grava normalmente no período aberto', async () => {
    expect((await sync([deposito('ok', '2026-09-18')], { tk: lancaMasNaoVira() })).statusCode).toBe(200)
  })
  it('usuário restrito a alguns perfis não estorna', async () => {
    await banco.exec("INSERT INTO perfis (id, name, type) VALUES ('pa', 'A', 'pf'); UPDATE contas SET profile_id = 'pa'")
    const r = await sync([deposito('restrito', '2026-08-10')], { tk: token({ perfis: ['pa'] }), confirmar: true })
    expect(r.statusCode).toBe(403)
    expect(await existe('lancamentos', 'restrito')).toBe(false)
  })
})

describe('lote (importação e sincronização)', () => {
  const lote = [deposito('l1', '2026-08-02', 10), deposito('l2', '2026-08-03', 11), deposito('l3', '2026-09-03', 12)]

  it('uma confirmação só, com a prévia agrupada; verificar não grava nada', async () => {
    const verificar = { corpo: { somenteVerificar: true } }
    const r = await sync(lote, verificar)
    expect(r.statusCode).toBe(409)
    expect(r.body.previa.itens).toHaveLength(3)
    expect(r.body.previa.viradas.map(v => v.data_corte)).toEqual(['2026-09-14', '2026-08-14'])
    const ok = await sync(lote, { ...verificar, confirmar: true })
    expect(ok.body).toMatchObject({ estornoConfirmado: true })
    expect(await existe('lancamentos', 'l1')).toBe(false)
    expect((await fotoViradas()).length).toBe(2)
    const feito = await sync(lote, { confirmar: true })
    expect(feito.statusCode).toBe(200)
    expect(feito.body.written.upserted).toBe(3)
    expect(feito.body.viradaEstorno.refeitas).toHaveLength(2)
    await saldosBatem()
  })
  it('verificar no período aberto responde ok e não grava', async () => {
    const r = await sync([deposito('v', '2026-09-18')], { corpo: { somenteVerificar: true } })
    expect(r.body).toMatchObject({ ok: true, verificado: true })
    expect(await existe('lancamentos', 'v')).toBe(false)
  })
  it('um item em data não estornável bloqueia o lote inteiro', async () => {
    const r = await sync([...lote, deposito('l4', '2026-07-05', 13)], { confirmar: true })
    expect(r.body.codigo).toBe('periodo_bloqueado')
    expect(await existe('lancamentos', 'l1')).toBe(false)
  })
  it('a tabela de pendências não recebe nada', async () => {
    await sync(lote, { confirmar: true })
    await sync([deposito('l9', '2026-08-05')])
    expect(await linhas('SELECT id FROM reserve_pendencias_fechado')).toEqual([])
  })
})
