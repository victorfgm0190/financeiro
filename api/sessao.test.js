import { describe, it, expect, beforeEach } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { sessaoValida, _limparCacheSessoes, CACHE_SESSAO_MS } from './_sessao.js'

// Conferência da sessão (GRAFITY B5) com o cache de 30 s: positivo fica em cache; divergência
// sempre consulta de novo antes de recusar.
let db
let consultas
const q = async (sql, p = []) => { consultas++; return (await db.query(sql, p)).rows }
const tok = (extra = {}) => ({ sub: 'u1', origem: 'db', tv: 0, ...extra })
const T0 = 1_000_000

beforeEach(async () => {
  _limparCacheSessoes()
  consultas = 0
  db = new PGlite()
  await db.exec(`CREATE TABLE usuarios (id TEXT PRIMARY KEY, ativo BOOLEAN, token_versao INTEGER NOT NULL DEFAULT 0);
    INSERT INTO usuarios (id, ativo) VALUES ('u1', true);`)
})

describe('sessaoValida', () => {
  it('positivo fica 30 s em cache; desativado só cai depois disso', async () => {
    expect(await sessaoValida(q, tok(), { agora: T0 })).toBe(true)
    await db.exec("UPDATE usuarios SET ativo = false, token_versao = 1 WHERE id = 'u1'")
    expect(await sessaoValida(q, tok(), { agora: T0 + CACHE_SESSAO_MS - 1 })).toBe(true)
    expect(consultas).toBe(1)
    expect(await sessaoValida(q, tok(), { agora: T0 + CACHE_SESSAO_MS + 1 })).toBe(false)
  })

  it('versão nova no token com cache antigo: consulta de novo e aceita; a antiga é recusada', async () => {
    await sessaoValida(q, tok(), { agora: T0 })
    await db.exec("UPDATE usuarios SET token_versao = 1 WHERE id = 'u1'")
    expect(await sessaoValida(q, tok({ tv: 1 }), { agora: T0 + 1 })).toBe(true)
    expect(await sessaoValida(q, tok(), { agora: T0 + 2 })).toBe(false)
  })

  it('token sem tv (antes da coluna) vale como versão 0; usuário inexistente → false', async () => {
    expect(await sessaoValida(q, { sub: 'u1', origem: 'db' }, { agora: T0 })).toBe(true)
    expect(await sessaoValida(q, tok({ sub: 'ninguem' }), { agora: T0 })).toBe(false)
  })

  it('login fixo (origem env) e token antigo sem origem não consultam o banco', async () => {
    expect(await sessaoValida(q, { sub: 'env:x', origem: 'env' })).toBe(true)
    expect(await sessaoValida(q, { user: 'x', role: 'admin' })).toBe(true)
    expect(consultas).toBe(0)
  })

  it('coluna ainda não migrada: confere só o ativo', async () => {
    await db.exec('ALTER TABLE usuarios DROP COLUMN token_versao')
    expect(await sessaoValida(q, tok({ tv: 3 }), { agora: T0 })).toBe(true)
    await db.exec("UPDATE usuarios SET ativo = false WHERE id = 'u1'")
    _limparCacheSessoes()
    expect(await sessaoValida(q, tok(), { agora: T0 })).toBe(false)
  })

  it('ambientes diferentes não dividem o cache', async () => {
    await sessaoValida(q, tok(), { ambienteId: 'a', agora: T0 })
    await sessaoValida(q, tok(), { ambienteId: 'b', agora: T0 })
    expect(consultas).toBe(2)
  })
})
