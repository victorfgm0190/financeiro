import { describe, it, expect, beforeEach } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { upsertRowsNoClient } from './_db.js'

// Conta central e favorita por perfil (índices únicos parciais em contas). O sync manda TODAS as
// contas num INSERT ... ON CONFLICT; trocar a flag de A para B falhava quando B vinha antes de A.

let db
const conta = (id, profile_id, extra = {}) => ({ id, name: id, profile_id, is_main: false, conta_corrente_principal: false, ...extra })
const flags = async () => Object.fromEntries((await db.query('SELECT id, is_main, conta_corrente_principal FROM contas ORDER BY id')).rows
  .map(r => [r.id, `${r.conta_corrente_principal ? 'C' : '-'}${r.is_main ? 'F' : '-'}`]))

beforeEach(async () => {
  db = new PGlite()
  await db.exec(`CREATE TABLE contas (id TEXT PRIMARY KEY, name TEXT, profile_id TEXT, is_main BOOLEAN DEFAULT false, conta_corrente_principal BOOLEAN DEFAULT false)`)
  await db.exec(`ALTER TABLE contas ADD CONSTRAINT ck_conta_central_com_perfil CHECK (NOT COALESCE(conta_corrente_principal, false) OR profile_id IS NOT NULL)`)
  await db.exec(`CREATE UNIQUE INDEX uq_contas_central_por_perfil ON contas (profile_id) WHERE conta_corrente_principal`)
  await db.exec(`CREATE UNIQUE INDEX uq_contas_favorita_por_perfil ON contas ((COALESCE(profile_id, ''))) WHERE is_main`)
  await upsertRowsNoClient(db, 'contas', [
    conta('a', 'p1', { conta_corrente_principal: true, is_main: true }),
    conta('b', 'p1'),
    conta('c', 'p2', { conta_corrente_principal: true }),
  ])
}, 30000)

describe('sync de contas com Conta central / favorita únicas por perfil (PGlite)', () => {
  it('troca A → B com B ANTES de A no lote: grava sem violar o índice', async () => {
    await upsertRowsNoClient(db, 'contas', [
      conta('b', 'p1', { conta_corrente_principal: true, is_main: true }),
      conta('a', 'p1'),
      conta('c', 'p2', { conta_corrente_principal: true }),
    ])
    expect(await flags()).toEqual({ a: '--', b: 'CF', c: 'C-' })
  })

  it('troca cruzada (A vira só favorita, B só central) no mesmo lote', async () => {
    await upsertRowsNoClient(db, 'contas', [
      conta('b', 'p1', { conta_corrente_principal: true }),
      conta('a', 'p1', { is_main: true }),
    ])
    expect(await flags()).toEqual({ a: '-F', b: 'C-', c: 'C-' })
  })

  it('central que muda de perfil enquanto o perfil antigo ganha outra', async () => {
    await upsertRowsNoClient(db, 'contas', [
      conta('b', 'p1', { conta_corrente_principal: true }),
      conta('a', 'p3', { conta_corrente_principal: true, is_main: true }),
    ])
    expect(await flags()).toEqual({ a: 'CF', b: 'C-', c: 'C-' })
  })

  it('perfis diferentes podem ter cada um a sua', async () => {
    await upsertRowsNoClient(db, 'contas', [conta('c', 'p2', { conta_corrente_principal: true, is_main: true })])
    expect(await flags()).toEqual({ a: 'CF', b: '--', c: 'CF' })
  })

  it('duas centrais no MESMO perfil continuam recusadas (estado inválido do app)', async () => {
    await expect(upsertRowsNoClient(db, 'contas', [
      conta('a', 'p1', { conta_corrente_principal: true }),
      conta('b', 'p1', { conta_corrente_principal: true }),
    ])).rejects.toThrow()
  })

  it('conta sem perfil não pode ser central', async () => {
    await expect(upsertRowsNoClient(db, 'contas', [conta('d', null, { conta_corrente_principal: true })])).rejects.toThrow()
  })
})
