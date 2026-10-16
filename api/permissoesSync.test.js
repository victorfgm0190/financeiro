import { describe, it, expect, beforeEach } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { autorizarSync, recortarLeitura, contextoPerfis } from './_permissoesApi.js'

// Autorização do /api/sync num Postgres de verdade (PGlite): módulo da tabela, ação (linha nova =
// incluir, existente = editar, delete = excluir) e recorte por perfis permitidos.
let db
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const user = (nivel, extra = {}) => ({ nivel, permissoes: {}, perfis: 'todos', ...extra })
const tx = (id, account_id, extra = {}) => ({ id, account_id, to_account_id: null, reserva_funcao_id: null, ...extra })

beforeEach(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE TABLE contas (id TEXT PRIMARY KEY, profile_id TEXT);
    CREATE TABLE lancamentos (id TEXT PRIMARY KEY, account_id TEXT, to_account_id TEXT, reserva_funcao_id TEXT);
    CREATE TABLE reserve_functions (id TEXT PRIMARY KEY, account_id TEXT);
    CREATE TABLE categorias (id TEXT PRIMARY KEY);
    INSERT INTO contas VALUES ('itau', 'prf_v'), ('cora', 'prf_l'), ('rico', NULL);
    INSERT INTO lancamentos VALUES ('t1', 'itau', NULL, NULL), ('t2', 'cora', NULL, NULL), ('t3', NULL, NULL, 'rf_v');
    INSERT INTO reserve_functions VALUES ('rf_v', 'itau');
    INSERT INTO categorias VALUES ('c1');
  `)
}, 30000)

describe('autorizarSync', () => {
  it('Consulta: qualquer gravação → 403', async () => {
    await expect(autorizarSync(q, user('consulta'), { type: 'section', table: 'lancamentos', upsert: [tx('t9', 'itau')], delete: [] }))
      .rejects.toMatchObject({ status: 403 })
    await expect(autorizarSync(q, user('consulta'), { type: 'settings', data: {} })).rejects.toMatchObject({ status: 403 })
    await expect(autorizarSync(q, user('consulta'), { type: 'payees', add: ['X'], remove: [] })).rejects.toMatchObject({ status: 403 })
  })

  it('Admin e Operador (todos os perfis) passam sem filtro; Operador não grava cadastros', async () => {
    const corpo = { type: 'section', table: 'lancamentos', upsert: [tx('t1', 'itau'), tx('t9', 'cora')], delete: ['t2'] }
    expect(await autorizarSync(q, user('admin'), corpo)).toEqual(corpo)
    expect(await autorizarSync(q, user('operador'), corpo)).toEqual(corpo)
    await expect(autorizarSync(q, user('operador'), { type: 'section', table: 'categorias', upsert: [{ id: 'c2' }], delete: [] }))
      .rejects.toMatchObject({ status: 403 })
    // configurações: operador grava (dados do dia a dia ficam nessa linha); consulta não
    expect(await autorizarSync(q, user('operador'), { type: 'settings', data: { x: 1 } })).toMatchObject({ type: 'settings' })
  })

  it('Personalizado só com incluir: linhas novas passam, existentes e deletes são descartados', async () => {
    const u = user('personalizado', { permissoes: { lancamentos: { incluir: true } } })
    const r = await autorizarSync(q, u, { type: 'section', table: 'lancamentos', upsert: [tx('t1', 'itau'), tx('t9', 'itau')], delete: ['t2'] })
    expect(r.upsert.map(x => x.id)).toEqual(['t9'])
    expect(r.delete).toEqual([])
  })

  it('perfis permitidos: só grava linhas das contas do perfil (nova versão e a gravada)', async () => {
    const u = user('operador', { perfis: ['prf_v'] })
    const r = await autorizarSync(q, u, { type: 'section', table: 'lancamentos', upsert: [
      tx('t1', 'itau'),            // existente do perfil → ok
      tx('t2', 'itau'),            // existente de OUTRO perfil (cora) → recusada, mesmo "mudando" para itau
      tx('t9', 'cora'),            // nova em conta de outro perfil → recusada
      tx('t10', null, { reserva_funcao_id: 'rf_v' }), // sombra de reserva do perfil → ok
    ], delete: ['t2', 't3'] })
    expect(r.upsert.map(x => x.id)).toEqual(['t1', 't10'])
    expect(r.delete).toEqual(['t3'])
    // contas: só do perfil permitido; conta sem perfil não
    const c = await autorizarSync(q, u, { type: 'accounts', upsert: [{ id: 'itau', profile_id: 'prf_v' }, { id: 'rico', profile_id: null }], delete: [], cards: [], deleteCards: [] })
    expect(c.upsert.map(x => x.id)).toEqual(['itau'])
  })
})

describe('recorte de leitura por perfis', () => {
  it('lançamentos de outros perfis somem; sombra de reserva fica pela função', async () => {
    const ctx = await contextoPerfis(q, { perfis: ['prf_v'] })
    const rows = await q('SELECT * FROM lancamentos ORDER BY id')
    expect(recortarLeitura('lancamentos', rows, ctx).map(r => r.id)).toEqual(['t1', 't3'])
    expect(await contextoPerfis(q, { perfis: 'todos' })).toBeNull()
  })
})
