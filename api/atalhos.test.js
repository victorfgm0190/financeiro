import { describe, it, expect, beforeEach } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { DDL_ATALHOS, normalizarItem, gravarAtalhos } from './atalhos.js'

// /api/atalhos num Postgres de verdade (PGlite): upsert por (user_id, acao_id), só o alterado.
let db
const q = async (sql, params = []) => (await db.query(sql, params)).rows
const linhas = (userId) => q('SELECT acao_id, combinacao FROM atalhos_usuario WHERE user_id = $1 ORDER BY acao_id', [userId])

beforeEach(async () => {
  db = new PGlite()
  await db.exec(DDL_ATALHOS)
})

describe('normalizarItem', () => {
  it('canoniza a combinação e aceita null (desativado)', () => {
    expect(normalizarItem({ acaoId: 'conta.novoLancamento', combinacao: 'alt+k' })).toEqual({ item: { acaoId: 'conta.novoLancamento', combinacao: 'Alt+K' } })
    expect(normalizarItem({ acaoId: 'nav.envelopes', combinacao: null })).toEqual({ item: { acaoId: 'nav.envelopes', combinacao: null } })
  })
  it('recusa ação desconhecida, reservada e sem modificador', () => {
    expect(normalizarItem({ acaoId: 'nada.disso', combinacao: 'Alt+K' }).erro).toMatch(/desconhecida/)
    expect(normalizarItem({ acaoId: 'nav.envelopes', combinacao: 'Ctrl+W' }).erro).toMatch(/reservada/)
    expect(normalizarItem({ acaoId: 'nav.envelopes', combinacao: 'Shift+K' }).erro).toMatch(/modificador/)
  })
})

describe('gravarAtalhos', () => {
  it('insere e depois atualiza a mesma ação (UNIQUE user_id + acao_id)', async () => {
    await gravarAtalhos(q, 'u1', [{ acaoId: 'conta.novoLancamento', combinacao: 'Alt+K' }])
    await gravarAtalhos(q, 'u1', [{ acaoId: 'conta.novoLancamento', combinacao: 'Alt+J' }])
    expect(await linhas('u1')).toEqual([{ acao_id: 'conta.novoLancamento', combinacao: 'Alt+J' }])
  })
  it('separa por usuário e grava o desativado como NULL', async () => {
    await gravarAtalhos(q, 'u1', [{ acaoId: 'nav.envelopes', combinacao: null }, { acaoId: 'agend.lancarProvisao', combinacao: 'Alt+N' }])
    await gravarAtalhos(q, 'env:admin', [{ acaoId: 'nav.envelopes', combinacao: 'Alt+Shift+K' }])
    expect(await linhas('u1')).toEqual([
      { acao_id: 'agend.lancarProvisao', combinacao: 'Alt+N' },
      { acao_id: 'nav.envelopes', combinacao: null },
    ])
    expect(await linhas('env:admin')).toEqual([{ acao_id: 'nav.envelopes', combinacao: 'Alt+Shift+K' }])
  })
})
