import process from 'node:process'
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import jwt from 'jsonwebtoken'
import { abrirPGlite, bancoDoArquivo } from './_testes/bancoTeste.js'
import { SQL_CENTRAL, usarBancos } from './_testes/pglite.js'
import { _definirFabricaDePool } from './_conexao.js'

// Venda real por cota, na rota real.
const { default: eventos } = await import('./consorcio-eventos.js')
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
    // Bem com 3 cotas e R$ 9.000 pagos: R$ 3.000 por cota.
    await b.exec(`
      INSERT INTO usuarios (id, username, nome, email, senha_hash, nivel) VALUES ('u1', 'admin', 'Admin', 'admin@teste.local', 'x', 'admin');
      INSERT INTO perfis (id, name, type) VALUES ('pa', 'A', 'pf'), ('pb', 'B', 'pj');
      INSERT INTO categorias (id, name, type) VALUES ('ganho', 'Ganho', 'income'), ('perda', 'Perda', 'expense'), ('cust', 'Comissão', 'expense');
      INSERT INTO contas (id, name, type, balance, initial_balance, profile_id) VALUES ('cc', 'Conta', 'checking', 1000, 1000, 'pa'), ('res', 'Reserva', 'savings', 0, 0, 'pa'), ('cartao', 'Cartão', 'credit', 0, 0, 'pa'), ('cc_b', 'B', 'checking', 0, 0, 'pb');
      INSERT INTO contas (id, name, type, balance, initial_balance, profile_id, tipo_bem, categoria_ganho_bem_id, categoria_perda_bem_id) VALUES ('bem', 'Consórcio', 'asset', 9000, 0, 'pa', 'consorcio', 'ganho', 'perda');
      INSERT INTO reserve_functions (id, name, account_id) VALUES ('f', 'Função', 'res');
      INSERT INTO consorcios (bem_id, situacao, funcao_reserva_id) VALUES ('bem', 'ativa', 'f');
      INSERT INTO consorcio_cotas (bem_id, numero, valor_carta, percentual_parcela, valor_parcela_cheia, created_at) VALUES
        ('bem', '1', 100000, 100, 500, '2026-01-01'), ('bem', '2', 100000, 100, 500, '2026-01-02'), ('bem', '3', 100000, 100, 500, '2026-01-03');
      INSERT INTO lancamentos (id, type, amount, date, account_id, to_account_id, bem_id, description, origin) VALUES
        ('p1', 'transfer', 9000, '2026-06-01', 'cc', 'bem', 'bem', 'Parcelas', 'agendamento');`)
  })
  usarBancos({ central, banco_vm: () => banco })
  process.env.JWT_SECRET = SECRET
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
}, 120_000)
afterEach(() => { vi.restoreAllMocks() })
afterAll(() => { _definirFabricaDePool(null) })

const token = (perfis = 'todos') => jwt.sign({ sub: 'u1', org: 'o1', nivel: 'admin', permissoes: {}, perfis, username: 'admin', origem: 'db', amb: ambId, amb_sigla: 'vm' }, SECRET)
async function chamar(handler, body, { tk = token(), method = 'POST', url = '/api/consorcio-eventos' } = {}) {
  const res = { statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this }, end() { return this }, setHeader() {}, getHeader() {} }
  await handler({ method, url, body, query: {}, headers: { host: 'www.finup.app.br', authorization: `Bearer ${tk}` } }, res)
  return res
}
const dados = (numero, valor, extra = {}) => ({ cota_numero: numero, valor, conta_destino_id: 'cc', comprador: 'Fulano', ...extra })
const vender = (numero, valor, { data = '2026-10-10', opc = {}, ...extra } = {}) => chamar(eventos, { acao: 'registrar', bem_id: 'bem', tipo: 'vender_cota', data, dados: dados(numero, valor, extra), agendamentos: [{ id: 's1', amount: 1500 }] }, opc)
const previa = (numero, valor, extra = {}) => chamar(eventos, { acao: 'previa_cota', bem_id: 'bem', data: '2026-10-10', ...dados(numero, valor), ...extra })
const estado = async () => JSON.stringify({
  contas: await q('SELECT id, balance::float AS b, foi_vendido FROM contas ORDER BY id'),
  lanc: await q('SELECT id FROM lancamentos ORDER BY id'),
  cotas: await q('SELECT numero, vendida_em, vendida_valor, vendida_custo, vendida_evento_id FROM consorcio_cotas ORDER BY numero'),
  cons: await q('SELECT situacao FROM consorcios'),
})
const resultado = () => q("SELECT type, amount::float AS v, category_id, bem_id, account_id FROM lancamentos WHERE origin = 'patrimonio_auto' ORDER BY id")

describe('venda de uma cota', () => {
  it('com ganho: entrada na conta, custo estimado, cota vendida e o saldo do bem cai só pelo custo', async () => {
    const p = await previa('1', 5000)
    expect(p.body).toMatchObject({ custo_estimado: 3000, custo: 3000, resultado: 2000, aviso_isencao: null })
    const r = await vender('1', 5000)
    expect(r.body.error).toBeUndefined()
    expect(r.body.dados).toMatchObject({ custo_cota: 3000, ganho: 2000 })
    expect(await resultado()).toEqual([{ type: 'income', v: 2000, category_id: 'ganho', bem_id: 'bem', account_id: null }])
    const [ent] = await q("SELECT type, amount::float AS v, account_id, to_account_id, payee, origin, reserva_funcao_id FROM lancamentos WHERE origin = 'venda_bem'")
    expect(ent).toEqual({ type: 'transfer', v: 5000, account_id: 'bem', to_account_id: 'cc', payee: 'Fulano', origin: 'venda_bem', reserva_funcao_id: null })
    const [bem] = await q("SELECT balance::float AS b, foi_vendido FROM contas WHERE id = 'bem'")
    expect(bem).toEqual({ b: 6000, foi_vendido: false })
    const [c] = await q("SELECT vendida_em, vendida_valor::float AS v, vendida_custo::float AS k, vendida_evento_id FROM consorcio_cotas WHERE numero = '1'")
    expect(c).toMatchObject({ vendida_em: '2026-10-10', v: 5000, k: 3000 })
    expect(c.vendida_evento_id).toBe(r.body.evento_id)
    expect((await q('SELECT situacao FROM consorcios'))[0].situacao).toBe('ativa')
  }, 60_000)
  it('com perda, custos e custo corrigido na mão', async () => {
    const r = await vender('1', 2000, { custos_valor: 100, custos_categoria_id: 'cust', custo_cota: 2500 })
    expect(r.body.dados).toMatchObject({ custo_cota: 2500, custo_estimado: 3000, ganho: -600 })
    expect(await resultado()).toEqual([{ type: 'expense', v: 600, category_id: 'perda', bem_id: 'bem', account_id: null }])
    expect((await q("SELECT amount::float AS v, account_id, category_id FROM lancamentos WHERE description LIKE 'Custos%'"))).toEqual([{ v: 100, account_id: 'cc', category_id: 'cust' }])
    expect((await q("SELECT balance::float AS b FROM contas WHERE id = 'bem'"))[0].b).toBe(6500)
    // Custos e perda não voltam como pago: as demais dividem só o que sobrou.
    expect((await previa('2', 1000)).body.custo_estimado).toBe(3250)
  }, 60_000)
  it('a estimativa das demais não conta de novo o que já saiu', async () => {
    await vender('1', 5000, { custo_cota: 4000 })
    expect((await previa('2', 5000)).body.custo_estimado).toBe(2500)
  }, 60_000)
  it('vender a última cota encerra o consórcio; estornar reabre', async () => {
    await vender('1', 5000)
    await vender('2', 5000)
    const antes = await estado()
    const r = await vender('3', 5000)
    expect(r.body.efeitos).toMatchObject({ saldo: 0, conta: { foiVendido: true, dataVenda: '2026-10-10' } })
    expect((await q('SELECT situacao FROM consorcios'))[0].situacao).toBe('vendida')
    expect((await q("SELECT foi_vendido FROM contas WHERE id = 'bem'"))[0].foi_vendido).toBe(true)
    const e = await chamar(eventos, { acao: 'estornar', evento_id: r.body.evento_id })
    expect(e.body.efeitos.conta).toEqual({ foiVendido: false, dataVenda: null })
    expect(await estado()).toBe(antes)
  }, 60_000)
  it('validações: conta de cartão, cota inexistente, já vendida e sem categoria dos custos', async () => {
    expect((await vender('1', 5000, { conta_destino_id: 'cartao' })).statusCode).toBe(400)
    expect((await vender('9', 5000)).statusCode).toBe(404)
    expect((await vender('1', 5000, { custos_valor: 10 })).statusCode).toBe(400)
    expect((await vender('1', 0)).statusCode).toBe(400)
    await vender('1', 5000)
    expect((await vender('1', 5000)).statusCode).toBe(409)
  }, 60_000)
  it('entrada na conta de reserva com função vinculada: o valor entra na função', async () => {
    const p = await previa('1', 5000, { conta_destino_id: 'res' })
    expect(p.body.funcao).toEqual({ id: 'f', nome: 'Função' })
    await vender('1', 5000, { conta_destino_id: 'res' })
    expect((await q("SELECT reserva_funcao_id AS f FROM lancamentos WHERE origin = 'venda_bem'"))[0].f).toBe('f')
    expect((await previa('2', 5000)).body.funcao).toBeNull()
  }, 60_000)
})

describe('o bem e o resultado fecham', () => {
  const saldoBem = async () => (await q("SELECT balance::float AS b FROM contas WHERE id = 'bem'"))[0].b
  const fecha = (r, antes, depois) => {
    const d = r.body.dados
    expect(Math.round((antes - depois) * 100) / 100).toBe(d.custo_cota) // o que saiu do bem é o custo usado
    expect(Math.round((d.custo_cota + d.ganho + d.custos_valor) * 100) / 100).toBe(d.valor) // entrada = custo + resultado + custos
  }
  const sobraUma = async (saldo) => {
    await vender('1', 5000)
    await vender('2', 5000)
    await q("UPDATE contas SET balance = $1 WHERE id = 'bem'", [saldo])
  }

  it('última cota com saldo menor que a estimativa: o custo é o saldo, ganho maior', async () => {
    await sobraUma(2500)
    const p = await previa('3', 5000, { custo_cota: 99 })
    expect(p.body).toMatchObject({ ultima: true, custo: 2500, custo_estimado: 3000, diferenca_estimativa: -500, resultado: 2500, aviso_custo: null })
    const r = await vender('3', 5000, { custo_cota: 99, custos_valor: 100, custos_categoria_id: 'cust' })
    expect(r.body.dados).toMatchObject({ custo_cota: 2500, ganho: 2400 })
    fecha(r, 2500, await saldoBem())
    expect(await saldoBem()).toBe(0)
  }, 60_000)
  it('última cota com saldo maior que a estimativa: o custo é o saldo, com perda', async () => {
    await sobraUma(4000)
    const p = await previa('3', 1000)
    expect(p.body).toMatchObject({ custo: 4000, diferenca_estimativa: 1000, resultado: -3000 })
    const r = await vender('3', 1000)
    expect(r.body.dados.ganho).toBe(-3000)
    fecha(r, 4000, await saldoBem())
    expect(await resultado()).toContainEqual({ type: 'expense', v: 3000, category_id: 'perda', bem_id: 'bem', account_id: null })
    const e = await chamar(eventos, { acao: 'estornar', evento_id: r.body.evento_id })
    expect(e.body.efeitos.saldo).toBe(4000)
    expect(await saldoBem()).toBe(4000)
  }, 60_000)
  it('custo informado acima do saldo: a prévia avisa e limita; a venda é recusada e nada muda', async () => {
    const p = await previa('1', 5000, { custo_cota: 9000.01 })
    expect(p.body.custo).toBe(9000)
    expect(p.body.saldo_bem).toBe(9000)
    expect(p.body.aviso_custo).toBe('O custo não pode passar do saldo do bem (R$ 9.000,00)')
    const antes = await estado()
    const r = await vender('1', 5000, { custo_cota: 9000.01 })
    expect(r.statusCode).toBe(400)
    expect(r.body.error).toBe('O custo não pode passar do saldo do bem (R$ 9.000,00)')
    expect(await estado()).toBe(antes)
  }, 60_000)
  it('custo igual ao saldo é aceito e fecha', async () => {
    const r = await vender('1', 5000, { custo_cota: 9000 })
    expect(r.body.dados).toMatchObject({ custo_cota: 9000, ganho: -4000 })
    fecha(r, 9000, await saldoBem())
  }, 60_000)
  it('estimativa acima do saldo: usa o saldo, com o aviso, sem ninguém ter informado', async () => {
    await q("UPDATE contas SET balance = 1000 WHERE id = 'bem'")
    const p = await previa('1', 5000)
    expect(p.body).toMatchObject({ custo_estimado: 3000, custo: 1000, resultado: 4000 })
    expect(p.body.aviso_custo).toMatch(/R\$ 1\.000,00/)
    const r = await vender('1', 5000)
    expect(r.statusCode).toBe(200)
    fecha(r, 1000, await saldoBem())
  }, 60_000)
})

describe('aviso de isenção', () => {
  it('2 cotas no mesmo mês acima de R$ 35.000: avisa na prévia da segunda', async () => {
    await vender('1', 20000)
    const p = await previa('2', 20000)
    expect(p.body.vendas_do_mes).toBe(40000)
    expect(p.body.aviso_isencao).toMatch(/acima de R\$ 35\.000.*Confirme com seu contador/)
  }, 60_000)
  it('em meses diferentes, não avisa', async () => {
    await vender('1', 20000, { data: '2026-09-10' })
    const p = await previa('2', 20000)
    expect(p.body.vendas_do_mes).toBe(20000)
    expect(p.body.aviso_isencao).toBeNull()
  }, 60_000)
  it('venda manual já registrada também conta', async () => {
    await q("UPDATE consorcio_cotas SET vendida_em = '2026-10-01', vendida_valor = 30000 WHERE numero = '3'")
    expect((await previa('1', 6000)).body.aviso_isencao).toBeTruthy()
  }, 60_000)
})

describe('estorno', () => {
  it('desfaz tudo, a cota volta a ativa e os agendamentos voltam para o app', async () => {
    const antes = await estado()
    const r = await vender('1', 5000, { custos_valor: 100, custos_categoria_id: 'cust' })
    expect(await estado()).not.toBe(antes)
    const e = await chamar(eventos, { acao: 'estornar', evento_id: r.body.evento_id })
    expect(e.body.error).toBeUndefined()
    expect(await estado()).toBe(antes)
    expect(e.body.efeitos.lancamentos).toHaveLength(3)
    expect(e.body.efeitos.agendamentos).toEqual([{ id: 's1', amount: 1500 }])
    expect(e.body.efeitos.saldo).toBe(9000)
  }, 60_000)
  it('só o evento mais recente, como os demais do consórcio', async () => {
    const r1 = await vender('1', 5000)
    await vender('2', 5000)
    expect((await chamar(eventos, { acao: 'estornar', evento_id: r1.body.evento_id })).statusCode).toBe(409)
  }, 60_000)
})

describe('permissões e regras em volta', () => {
  it('usuário de outro perfil: 403 na prévia, na venda e no estorno, e nada muda', async () => {
    const r = await vender('1', 5000)
    const antes = await estado()
    const tk = token(['pb'])
    expect((await vender('2', 5000, { conta_destino_id: 'cc_b', opc: { tk } })).statusCode).toBe(403)
    expect((await chamar(eventos, { acao: 'previa_cota', bem_id: 'bem', ...dados('2', 1) }, { tk })).statusCode).toBe(403)
    expect((await chamar(eventos, { acao: 'estornar', evento_id: r.body.evento_id }, { tk })).statusCode).toBe(403)
    expect(await estado()).toBe(antes)
  }, 60_000)
  it('usuário do perfil do bem não recebe em conta de outro perfil', async () => {
    expect((await vender('1', 5000, { conta_destino_id: 'cc_b', opc: { tk: token(['pa']) } })).statusCode).toBe(403)
  }, 60_000)
  it('plano: a marcação manual não mexe em venda real; o cadastro não apaga a cota vendida', async () => {
    await vender('1', 5000)
    const r = await chamar(consorcio, { bem_id: 'bem', cotas: [{ numero: '1', plano_mes: '2027-01', vendida_em: null, vendida_valor: null }, { numero: '2', vendida_em: '2026-01-01', vendida_valor: 10 }] }, { method: 'PATCH', url: '/api/consorcio' })
    expect(r.body.error).toBeUndefined()
    const [c1] = await q("SELECT vendida_em, vendida_evento_id FROM consorcio_cotas WHERE numero = '1'")
    expect(c1.vendida_em).toBe('2026-10-10')
    expect((await q("SELECT vendida_em FROM consorcio_cotas WHERE numero = '2'"))[0].vendida_em).toBe('2026-01-01')
    const cad = await chamar(consorcio, { bem_id: 'bem', cotas: [{ numero: '2', valor_carta: 100000, percentual_parcela: 100, valor_parcela_cheia: 500 }] }, { method: 'PUT', url: '/api/consorcio' })
    expect(cad.statusCode).toBe(409)
    expect(cad.body.error).toMatch(/Estorne a venda/)
    expect(await q('SELECT numero FROM consorcio_cotas')).toHaveLength(3)
  }, 60_000)
  it('vender o consórcio inteiro depois de vender uma cota: o custo restante é o que sobrou', async () => {
    await vender('1', 5000)
    const r = await chamar(eventos, { acao: 'registrar', bem_id: 'bem', tipo: 'vender', data: '2026-10-20', dados: { valor: 8000, conta_destino_id: 'cc' } })
    expect(r.body.error).toBeUndefined()
    expect(r.body.dados.custo_proprio).toBe(6000)
    expect(r.body.dados.ganho).toBe(2000)
  }, 60_000)
})
