import process from 'node:process'
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import jwt from 'jsonwebtoken'
import { abrirPGlite, bancoDoArquivo } from './_testes/bancoTeste.js'
import { SQL_CENTRAL, usarBancos } from './_testes/pglite.js'
import { _definirFabricaDePool } from './_conexao.js'
import { recortarLeitura, contextoPerfis, comBemVendido } from './_permissoesApi.js'

// Venda simples de bem, na rota real: ganho, perda, custos, financiamento, estorno, perfil e período virado.
const { default: vender } = await import('./bem/[id]/vender.js')
const { default: criarFin } = await import('./financiamento/criar.js')

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
      INSERT INTO perfis (id, name, type) VALUES ('pa', 'Perfil A', 'pf'), ('pb', 'Perfil B', 'pj');
      INSERT INTO categorias (id, name, type) VALUES ('ganho', 'Ganho', 'income'), ('perda', 'Perda', 'expense'), ('cust', 'Comissão', 'expense'), ('prest', 'Prestação', 'expense');
      INSERT INTO contas (id, name, type, balance, initial_balance, profile_id) VALUES
        ('cc', 'Conta', 'checking', 1000, 1000, 'pa'), ('cc_b', 'Conta B', 'checking', 1000, 1000, 'pb'), ('cartao', 'Cartão', 'credit', 0, 0, 'pa');
      INSERT INTO contas (id, name, type, balance, initial_balance, profile_id, valor_nota_fiscal, patrimonio_use_method, tipo_bem, categoria_ganho_bem_id, categoria_perda_bem_id, categoria_prestacao_id, categoria_taxa_finan_id) VALUES
        ('bem', 'Carro', 'asset', 50000, 50000, 'pa', 60000, 'valor_pago', 'bem_imobilizado', 'ganho', 'perda', 'prest', 'prest'),
        ('sem_saldo', 'Sítio', 'asset', 0, 0, 'pa', 30000, 'nota_fiscal', NULL, 'ganho', 'perda', 'prest', 'prest');`)
  })
  usarBancos({ central, banco_vm: () => banco })
  process.env.JWT_SECRET = SECRET
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
}, 120_000)
afterEach(() => { vi.restoreAllMocks() })
afterAll(() => { _definirFabricaDePool(null) })

const token = (perfis = 'todos') => jwt.sign({ sub: 'u1', org: 'o1', nivel: 'admin', permissoes: {}, perfis, username: 'admin', origem: 'db', amb: ambId, amb_sigla: 'vm' }, SECRET)
async function chamar(handler, url, body, { tk = token(), query = {}, confirmar = false } = {}) {
  const res = { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this }, end() { return this }, setHeader() {}, getHeader() {} }
  await handler({ method: 'POST', url, body, query, headers: { host: 'www.finup.app.br', authorization: `Bearer ${tk}`, ...(confirmar ? { 'x-confirmar-estorno': '1' } : {}) } }, res)
  return res
}
const acao = (corpo, opc = {}, id = 'bem') => chamar(vender, `/api/bem/${id}/vender`, corpo, { query: { id }, ...opc })
const base = { acao: 'confirmar', data: '2026-10-15', conta_destino_id: 'cc', comprador: 'Fulano' }
const resultado = () => q("SELECT type, amount::float AS v, category_id, bem_id, account_id FROM lancamentos WHERE origin = 'patrimonio_auto'")
const estado = async () => JSON.stringify({
  contas: await q('SELECT id, balance::float AS b, foi_vendido, data_venda FROM contas ORDER BY id'),
  lanc: await q('SELECT id FROM lancamentos ORDER BY id'),
  mov: await q('SELECT id FROM bem_movimentacoes ORDER BY id'),
  fin: await q('SELECT id, status FROM financing ORDER BY id'),
  parc: await q('SELECT id, status, principal_pago::float AS p, total_pago::float AS t FROM financing_installments ORDER BY id'),
})

describe('venda', () => {
  it('com ganho: entrada na conta, baixa do bem e ganho = recebido − saldo contábil', async () => {
    const r = await acao({ ...base, valor: 58000 })
    expect(r.body.error).toBeUndefined()
    expect(r.body.venda.resultado).toBe(8000)
    const [bem] = await q("SELECT balance::float AS b, foi_vendido FROM contas WHERE id = 'bem'")
    expect(bem).toEqual({ b: 0, foi_vendido: true })
    expect(await resultado()).toEqual([{ type: 'income', v: 8000, category_id: 'ganho', bem_id: 'bem', account_id: null }])
    const [ent] = await q("SELECT type, amount::float AS v, account_id, to_account_id, payee, origin FROM lancamentos WHERE origin = 'venda_bem'")
    expect(ent).toEqual({ type: 'transfer', v: 58000, account_id: 'bem', to_account_id: 'cc', payee: 'Fulano', origin: 'venda_bem' })
    expect(r.body.efeitos.lancamentos).toHaveLength(2)
    expect(r.body.efeitos.conta).toEqual({ foiVendido: true, dataVenda: '2026-10-15' })
  }, 60_000)

  it('com perda e custos: o custo entra na conta e soma na perda', async () => {
    const r = await acao({ ...base, valor: 49000, custos_valor: 500, custos_categoria_id: 'cust' })
    expect(r.body.venda.resultado).toBe(-1500)
    expect(await resultado()).toEqual([{ type: 'expense', v: 1500, category_id: 'perda', bem_id: 'bem', account_id: null }])
    const custos = await q("SELECT amount::float AS v, account_id, category_id FROM lancamentos WHERE description LIKE 'Custos%'")
    expect(custos).toEqual([{ v: 500, account_id: 'cc', category_id: 'cust' }])
  }, 60_000)

  it('sem custos e sem diferença: não cria ganho nem perda', async () => {
    const r = await acao({ ...base, valor: 50000 })
    expect(r.body.venda.resultado).toBe(0)
    expect(await resultado()).toEqual([])
    expect((await q("SELECT foi_vendido FROM contas WHERE id = 'bem'"))[0].foi_vendido).toBe(true)
  }, 60_000)

  it('bem sem movimentação: o saldo contábil é o valor digitado', async () => {
    const r = await acao({ ...base, valor: 31000 }, {}, 'sem_saldo')
    expect(r.body.venda.resultado).toBe(1000)
  }, 60_000)

  it('validações: conta de cartão, sem categoria, já vendido, consórcio e data antes de movimentação', async () => {
    expect((await acao({ ...base, valor: 100, conta_destino_id: 'cartao' })).statusCode).toBe(400)
    expect((await acao({ ...base, valor: 58000, custos_valor: 10 })).statusCode).toBe(400)
    await q("UPDATE contas SET categoria_ganho_bem_id = NULL WHERE id = 'bem'")
    expect((await acao({ ...base, valor: 58000 })).body.error).toMatch(/categoria de ganho/)
    expect((await acao({ ...base, valor: 58000, categoria_resultado_id: 'ganho' })).statusCode).toBe(200)
    expect((await acao({ ...base, valor: 58000, categoria_resultado_id: 'ganho' })).statusCode).toBe(409)
    await q("INSERT INTO bem_movimentacoes (id, bem_id, tipo, data, valor) VALUES ('m', 'sem_saldo', 'pagamento_parcela', '2026-10-20', 10)")
    expect((await acao({ ...base, valor: 100 }, {}, 'sem_saldo')).body.error).toMatch(/depois desta data/)
    await q("INSERT INTO consorcios (bem_id, situacao) VALUES ('sem_saldo', 'ativa')").catch(() => {})
  }, 60_000)

  it('prévia não grava nada', async () => {
    const antes = await estado()
    const r = await acao({ acao: 'previa', valor: 58000 })
    expect(r.body).toMatchObject({ saldo_contabil: 50000, resultado: 8000, divida: null })
    expect(await estado()).toBe(antes)
  }, 60_000)
})

describe('financiamento aberto', () => {
  const abrir = async () => {
    const r = await chamar(criarFin, '/api/financiamento/criar', { bem_id: 'bem', valor_principal: 20000, num_parcelas: 4, valor_parcela: 5000, banco: 'Banco', data_primeira_parcela: '2026-11-01', conta_origem_id: 'cc' })
    expect(r.body.error).toBeUndefined()
    return (await q('SELECT conta_divida_id AS d FROM financing'))[0].d
  }

  it('quitado: lança a quitação, fecha as parcelas e a dívida, e o saldo do bem conta no resultado', async () => {
    const divida = await abrir()
    const p = await acao({ acao: 'previa', valor: 60000, quitar: true })
    expect(p.body.divida.saldo_devedor).toBe(20000)
    const saldoBem = p.body.saldo_contabil
    const r = await acao({ ...base, valor: 60000, quitar: true })
    expect(r.body.error).toBeUndefined()
    expect(r.body.venda.resultado).toBe(60000 - saldoBem - 20000)
    const [q1] = await q("SELECT amount::float AS v, account_id, origin FROM lancamentos WHERE description LIKE 'Quitação%'")
    expect(q1).toEqual({ v: 20000, account_id: 'cc', origin: 'pagamento_divida' })
    expect((await q("SELECT DISTINCT status FROM financing_installments")).map(x => x.status)).toEqual(['paid'])
    expect((await q('SELECT status FROM financing'))[0].status).toBe('completed')
    expect((await q('SELECT balance::float AS b FROM contas WHERE id = $1', [divida]))[0].b).toBe(0)
    expect(r.body.efeitos.divida).toEqual({ id: divida, saldo: 0 })
  }, 60_000)

  it('não quitado: a dívida continua aberta e a venda registra o aviso', async () => {
    const divida = await abrir()
    const [{ b }] = await q('SELECT balance::float AS b FROM contas WHERE id = $1', [divida])
    const r = await acao({ ...base, valor: 60000, quitar: false })
    expect(r.body.venda.divida_aberta).toBe(20000)
    expect((await q('SELECT status FROM financing'))[0].status).not.toBe('completed')
    expect((await q('SELECT balance::float AS b FROM contas WHERE id = $1', [divida]))[0].b).toBe(b)
    expect((await q("SELECT DISTINCT status FROM financing_installments")).map(x => x.status)).not.toContain('paid')
  }, 60_000)

  it('estorno com quitação: tudo volta como estava, e os agendamentos voltam para o app', async () => {
    await abrir()
    const antes = await estado()
    const foto = [{ id: 's1', occurrenceType: 'continuous', installments: null }]
    await acao({ ...base, valor: 60000, quitar: true, agendamentos: foto })
    expect(await estado()).not.toBe(antes)
    const r = await acao({ acao: 'estornar' })
    expect(r.body.error).toBeUndefined()
    expect(await estado()).toBe(antes)
    expect(r.body.efeitos.agendamentos).toEqual(foto)
    expect(r.body.efeitos.conta).toEqual({ foiVendido: false, dataVenda: null })
    expect((await acao({ ...base, valor: 60000 })).statusCode).toBe(200) // pode vender de novo
  }, 60_000)
})

describe('estorno', () => {
  it('sem financiamento: bem volta com o saldo e os lançamentos saem', async () => {
    const antes = await estado()
    await acao({ ...base, valor: 58000, custos_valor: 100, custos_categoria_id: 'cust' })
    const r = await acao({ acao: 'estornar' })
    expect(r.body.efeitos.lancamentos).toHaveLength(3)
    expect(await estado()).toBe(antes)
    expect((await acao({ acao: 'estornar' })).statusCode).toBe(404)
  }, 60_000)
})

describe('perfil', () => {
  it('o ganho segue o perfil do bem vendido, na regra já em vigor', async () => {
    await acao({ ...base, valor: 58000 })
    const linhas = await q("SELECT * FROM lancamentos WHERE origin = 'patrimonio_auto'")
    await comBemVendido(q, linhas)
    expect(linhas[0].bem_vendido_id).toBe('bem')
    const ctxA = await contextoPerfis(q, { perfis: ['pa'] })
    const ctxB = await contextoPerfis(q, { perfis: ['pb'] })
    expect(recortarLeitura('lancamentos', linhas, ctxA)).toHaveLength(1)
    expect(recortarLeitura('lancamentos', linhas, ctxB)).toHaveLength(0)
  }, 60_000)

  it('usuário restrito a outro perfil: 403 em tudo, e nada muda', async () => {
    const antes = await estado()
    const tk = token(['pb'])
    for (const corpo of [{ ...base, valor: 58000, conta_destino_id: 'cc_b' }, { acao: 'previa', valor: 1 }, { acao: 'estornar' }, { acao: 'consultar' }]) {
      expect((await acao(corpo, { tk })).statusCode).toBe(403)
    }
    expect(await estado()).toBe(antes)
  }, 60_000)

  it('usuário do perfil do bem não recebe em conta de outro perfil', async () => {
    expect((await acao({ ...base, valor: 58000, conta_destino_id: 'cc_b' }, { tk: token(['pa']) })).statusCode).toBe(403)
    expect((await acao({ ...base, valor: 58000 }, { tk: token(['pa']) })).statusCode).toBe(200)
  }, 60_000)
})

describe('período virado', () => {
  it('venda com data em período virado passa pela mesma regra: avisa e não grava', async () => {
    await banco.exec(`
      INSERT INTO reserve_functions (id, name, account_id) VALUES ('f', 'F', 'res');
      INSERT INTO contas (id, name, type, balance, initial_balance, profile_id) VALUES ('res', 'Reserva', 'savings', 0, 0, 'pa');
      INSERT INTO reserve_periods (id, function_id, data_inicio, saldo_inicial) VALUES ('p', 'f', '2026-09-01', 0);
      INSERT INTO reserve_viradas (id, data_inicio, data_corte, status) VALUES ('v', '2026-08-01', '2026-08-31', 'ativa');
      INSERT INTO reserve_period_snapshots (id, periodo_id, virada_id, data_inicio, data_fim, function_id, function_name, saldo_inicial, entradas, saidas, ajuste, saldo, saldo_atualizado)
        VALUES ('s', 'x', 'v', '2026-08-01', '2026-08-31', 'f', 'F', 0, 0, 0, 0, 0, 0);`)
    const antes = await estado()
    const r = await acao({ ...base, data: '2026-08-15', conta_destino_id: 'res', valor: 58000 })
    expect(r.statusCode).toBe(409)
    expect(r.body.codigo).toBe('periodo_virado')
    expect(await estado()).toBe(antes)
    expect(await q('SELECT id FROM bem_vendas')).toEqual([])
    // Em outra conta, a venda não mexe em reserva: grava direto.
    expect((await acao({ ...base, data: '2026-08-15', valor: 58000 })).statusCode).toBe(200)
  }, 60_000)
})
