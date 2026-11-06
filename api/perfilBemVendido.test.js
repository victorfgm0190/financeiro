import process from 'node:process'
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import jwt from 'jsonwebtoken'
import { SQL_CENTRAL, usarBancos } from './_testes/pglite.js'
import { _definirFabricaDePool } from './_conexao.js'
import { recortarLancamentos, comBemVendido } from './_permissoesApi.js'
import { rowToTx, txToRow } from '../src/lib/db.js'
import { lancamentoNasContas } from '../src/lib/origins.js'

// Troca de bens entre perfis, de ponta a ponta: registra a entrada no endpoint real, lê como o /api/load
// e confere o perfil do lançamento de perda. O resultado é do bem VENDIDO; nada de coluna nova.

const { default: registrarEntrada } = await import('./bem/[id]/registrar-entrada.js')
const { default: load } = await import('./load.js')
const { default: sync } = await import('./sync.js')
const { default: bulk } = await import('./transactions-bulk-update.js')
const { default: estornar } = await import('./bem/[id]/estornar-entrada.js')
const { default: buscar } = await import('./search.js')
const { default: historico } = await import('./transaction-history.js')
const { default: extrato } = await import('./bem/extrato.js')

const SECRET = 'segredo-de-teste'
const raiz = fileURLToPath(new URL('../supabase/', import.meta.url))
const SQL = readFileSync(raiz + 'estrutura_base.sql', 'utf-8') + '\n' + readdirSync(raiz + 'migrations').filter(f => f.endsWith('.sql')).sort()
  .map(f => readFileSync(raiz + 'migrations/' + f, 'utf-8')).join('\n')

let central, banco, ambId
const q = async (sql, p) => (await banco.query(sql, p)).rows

beforeAll(async () => {
  central = new PGlite()
  await central.exec(SQL_CENTRAL)
  await central.exec("UPDATE ambientes SET database_name = 'banco_vm' WHERE sigla = 'vm'")
  ambId = (await central.query("SELECT id FROM ambientes WHERE sigla = 'vm'")).rows[0].id
}, 180_000)

beforeEach(async () => {
  banco = new PGlite()
  await banco.exec(SQL)
  await banco.exec(`
    INSERT INTO usuarios (id, username, nome, email, senha_hash, nivel) VALUES ('u1', 'admin', 'Admin', 'admin@teste.local', 'x', 'admin');
    INSERT INTO perfis (id, name, type) VALUES ('pa', 'Perfil A', 'pf'), ('pb', 'Perfil B', 'pj');
    INSERT INTO categorias (id, name, type) VALUES ('perda', 'Perda de capital', 'expense'), ('ganho', 'Ganho de capital', 'income');
    INSERT INTO contas (id, name, type, balance, initial_balance, profile_id, valor_nota_fiscal, categoria_perda_bem_id, categoria_ganho_bem_id) VALUES
      ('bem_vendido', 'Carro antigo', 'asset', 80000, 80000, 'pa', 80000, 'perda', 'ganho'),
      ('bem_novo', 'Carro novo', 'asset', 100000, 100000, 'pb', 100000, 'perda', 'ganho');`)
  usarBancos({ central, banco_vm: () => banco })
  process.env.JWT_SECRET = SECRET
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
}, 120_000)
afterEach(() => { vi.restoreAllMocks() })
afterAll(() => { _definirFabricaDePool(null) })

const token = (perfis = 'todos') => jwt.sign({ sub: 'u1', org: 'o1', nivel: 'admin', permissoes: {}, perfis, username: 'admin', origem: 'db', amb: ambId, amb_sigla: 'vm' }, SECRET)
const chamar = async (handler, { method = 'GET', url, body, query = {}, tk = token() }) => {
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this }, json(b) { this.body = b; return this }, end() { return this }, setHeader() {} }
  await handler({ method, url, body, query, headers: { host: 'www.finup.app.br', authorization: `Bearer ${tk}` } }, res)
  return res
}
const trocar = (valor = 60000) => chamar(registrarEntrada, {
  method: 'POST', url: '/api/bem/bem_novo/registrar-entrada', query: { id: 'bem_novo' },
  body: { data: '2026-08-07', transferencias: [{ bem_origem_id: 'bem_vendido', valor }] },
})
const PERFIL_A = new Set(['bem_vendido'])
const PERFIL_B = new Set(['bem_novo'])
const doLoad = async (tk) => {
  const r = await chamar(load, { url: '/api/load', tk })
  expect(r.statusCode).toBe(200)
  return (r.body.txs || r.body.transactions || r.body.lancamentos).map(rowToTx).filter(t => t.origin === 'patrimonio_auto')
}

describe('troca de bens entre perfis', () => {
  it('perda: fica no perfil do bem VENDIDO, com bem_id no bem novo e sem nada gravado a mais', async () => {
    const r = await trocar()
    expect(r.statusCode).toBe(200)
    const [gravado] = await q("SELECT * FROM lancamentos WHERE origin = 'patrimonio_auto'")
    expect(gravado.bem_id).toBe('bem_novo')
    expect(gravado).not.toHaveProperty('bem_vendido_id')
    const [tx] = await doLoad()
    expect(tx.type).toBe('expense')
    expect(tx.bemId).toBe('bem_novo')
    expect(tx.bemVendidoId).toBe('bem_vendido')
    expect(lancamentoNasContas(tx, PERFIL_A)).toBe(true)
    expect(lancamentoNasContas(tx, PERFIL_B)).toBe(false)
  }, 90_000)

  it('ganho: mesma regra', async () => {
    await trocar(90000)
    const [tx] = await doLoad()
    expect(tx.type).toBe('income')
    expect(lancamentoNasContas(tx, PERFIL_A)).toBe(true)
    expect(lancamentoNasContas(tx, PERFIL_B)).toBe(false)
  }, 90_000)

  it('usuário restrito: vê no perfil do bem vendido, não no do bem novo', async () => {
    await trocar()
    expect(await doLoad(token(['pa']))).toHaveLength(1)
    expect(await doLoad(token(['pb']))).toHaveLength(0)
    const rows = await q("SELECT * FROM lancamentos WHERE origin = 'patrimonio_auto'")
    expect(await recortarLancamentos(q, { perfis: ['pa'] }, rows.map(x => ({ ...x })))).toHaveLength(1)
    expect(await recortarLancamentos(q, { perfis: ['pb'] }, rows.map(x => ({ ...x })))).toHaveLength(0)
  }, 180_000)

  it('sem movimentação (lançamento antigo solto): vale o bem ligado; sem nenhum, nenhum perfil', async () => {
    await banco.exec(`INSERT INTO lancamentos (id, type, amount, date, origin, bem_id) VALUES
      ('solto', 'expense', 10, '2026-08-07', 'patrimonio_auto', 'bem_novo'), ('sem_bem', 'expense', 10, '2026-08-07', 'patrimonio_auto', NULL)`)
    const txs = await doLoad()
    const por = Object.fromEntries(txs.map(t => [t.id, t]))
    expect(por.solto.bemVendidoId).toBeNull()
    expect(lancamentoNasContas(por.solto, PERFIL_B)).toBe(true)
    expect(lancamentoNasContas(por.sem_bem, PERFIL_A)).toBe(false)
    expect(lancamentoNasContas(por.sem_bem, PERFIL_B)).toBe(false)
  }, 90_000)
})

describe('gravação igual à leitura (usuário restrito)', () => {
  const NOVA = 'Descrição editada'
  const SO_A = () => token(['pa'])
  const SO_B = () => token(['pb'])
  const oResultado = async () => (await q("SELECT * FROM lancamentos WHERE origin = 'patrimonio_auto'"))[0]
  const editar = async (tk, extra = {}) => {
    const row = { ...txToRow(rowToTx(await oResultado())), description: NOVA, ...extra }
    return chamar(sync, { method: 'POST', url: '/api/sync', tk, body: { type: 'section', table: 'lancamentos', upsert: [row], delete: [] } })
  }
  const excluir = async (tk) => chamar(sync, {
    method: 'POST', url: '/api/sync', tk, body: { type: 'section', table: 'lancamentos', upsert: [], delete: [(await oResultado()).id] },
  })
  const massa = async (tk) => chamar(bulk, { method: 'POST', url: '/api/transactions-bulk-update', tk, body: { ids: [(await oResultado()).id], categoryId: 'ganho' } })
  const estorno = (tk) => chamar(estornar, { method: 'POST', url: '/api/bem/bem_novo/estornar-entrada', query: { id: 'bem_novo' }, tk, body: {} })

  it('perfil do bem vendido: edita pelo sync e em massa', async () => {
    await trocar()
    expect((await editar(SO_A())).statusCode).toBe(200)
    expect((await oResultado()).description).toBe(NOVA)
    expect((await massa(SO_A())).statusCode).toBe(200)
    expect((await oResultado()).category_id).toBe('ganho')
  }, 120_000)

  it('perfil do bem vendido: exclui pelo sync', async () => {
    await trocar()
    expect((await excluir(SO_A())).statusCode).toBe(200)
    expect(await oResultado()).toBeUndefined()
  }, 120_000)

  it('estorno de troca entre perfis: exige os dois bens', async () => {
    await trocar()
    expect((await estorno(SO_A())).statusCode).toBe(403)
    expect(await oResultado()).toBeDefined()
    expect((await estorno(token(['pa', 'pb']))).statusCode).toBe(200)
    expect(await oResultado()).toBeUndefined()
  }, 120_000)

  it('perfil do bem novo: 403 em editar, editar em massa, excluir e estornar; nada muda', async () => {
    await trocar()
    const antes = await oResultado()
    for (const r of [await editar(SO_B()), await massa(SO_B()), await excluir(SO_B()), await estorno(SO_B())]) expect(r.statusCode).toBe(403)
    expect(await oResultado()).toEqual(antes)
  }, 120_000)

  it('bem_vendido_id enviado pelo cliente não dá acesso', async () => {
    await trocar()
    expect((await editar(SO_B(), { bem_vendido_id: 'bem_novo' })).statusCode).toBe(403)
    const nova = { id: 'forjada', type: 'expense', amount: 1, date: '2026-08-07', origin: 'patrimonio_auto', bem_vendido_id: 'bem_novo', bem_id: 'bem_vendido' }
    const r = await chamar(sync, { method: 'POST', url: '/api/sync', tk: SO_B(), body: { type: 'section', table: 'lancamentos', upsert: [nova], delete: [] } })
    expect(r.statusCode).toBe(403)
  }, 120_000)
})

describe('outras rotas de leitura', () => {
  const idsDa = (r) => (r.body.transactions || []).map(t => t.origin ?? t.id)
  const busca = (tk, body = {}) => chamar(buscar, { method: 'POST', url: '/api/search', tk, body: { description: 'venda de bem', ...body } })

  it('busca: usuário restrito e perfil ativo seguem o bem vendido', async () => {
    await trocar()
    expect(idsDa(await busca(token(['pa'])))).toHaveLength(1)
    expect(idsDa(await busca(token(['pb'])))).toHaveLength(0)
    expect(idsDa(await busca(token(), { profileId: 'pa' }))).toHaveLength(1)
    expect(idsDa(await busca(token(), { profileId: 'pb' }))).toHaveLength(0)
  }, 120_000)

  it('histórico por descrição: mesma regra', async () => {
    await trocar()
    const [{ description }] = await q("SELECT description FROM lancamentos WHERE origin = 'patrimonio_auto'")
    const pedir = (tk) => chamar(historico, { method: 'POST', url: '/api/transaction-history', tk, body: { description } })
    expect(idsDa(await pedir(token(['pa'])))).toHaveLength(1)
    expect(idsDa(await pedir(token(['pb'])))).toHaveLength(0)
  }, 120_000)
})

describe('extrato do bem', () => {
  const lancamentosDe = async (tk) => {
    const r = await chamar(extrato, { url: '/api/bem/extrato?bem_id=bem_novo', tk })
    expect(r.statusCode).toBe(200)
    return r.body.lancamentos.map(l => l.id)
  }
  it('quem só tem o perfil do bem novo não recebe o ganho/perda; os outros lançamentos do bem continuam', async () => {
    await trocar()
    await banco.exec("INSERT INTO lancamentos (id, type, amount, date, origin, bem_id) VALUES ('manual_do_bem', 'expense', 10, '2026-08-07', 'manual', 'bem_novo')")
    const [{ id: resultado }] = await q("SELECT id FROM lancamentos WHERE origin = 'patrimonio_auto'")
    const doPerfilNovo = await lancamentosDe(token(['pb']))
    expect(doPerfilNovo).toContain('manual_do_bem')
    expect(doPerfilNovo).not.toContain(resultado)
    expect(await lancamentosDe(token())).toContain(resultado)
  }, 120_000)
})

describe('duas baixas no mesmo lançamento (só por dado manual)', () => {
  it('o resultado não depende da ordem das linhas', async () => {
    await trocar()
    const [mov] = await q("SELECT * FROM bem_movimentacoes WHERE lancamento_id IS NOT NULL")
    const copiar = async (id, origem) => {
      const m = { ...mov, id, bem_origem_id: origem }
      const cols = Object.keys(m)
      await q(`INSERT INTO bem_movimentacoes (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`, cols.map(c => m[c]))
    }
    await copiar('mov_z', 'bem_novo')
    const umaOrdem = (await comBemVendido(q, [{ id: mov.lancamento_id, origin: 'patrimonio_auto' }]))[0].bem_vendido_id
    await q('DELETE FROM bem_movimentacoes')
    await copiar('mov_b', 'bem_vendido')
    await copiar('mov_a', 'bem_novo')
    const outraOrdem = (await comBemVendido(q, [{ id: mov.lancamento_id, origin: 'patrimonio_auto' }]))[0].bem_vendido_id
    expect(umaOrdem).toBe('bem_novo')
    expect(outraOrdem).toBe(umaOrdem)
  }, 120_000)
})
