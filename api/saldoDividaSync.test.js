import { describe, it, expect, beforeEach } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { montarUpsertSql, saldoDoBancoNasDividas, ehContaDividaFinanciamento } from './_db.js'

// /api/sync de contas: na conta de dívida de financiamento, balance e initial_balance são do
// backend (saldo devedor do principal). Uma sessão com estado antigo não grava o saldo velho; os
// outros campos da conta seguem o sync normalmente. Conta comum não muda nada.
let db
const client = { query: (sql, params) => db.query(sql, params) }

async function sync(rows) {
  const protegidas = await saldoDoBancoNasDividas(client, rows)
  const cols = Object.keys(protegidas[0])
  await db.query(montarUpsertSql('contas', cols, protegidas.length, 'id'), protegidas.flatMap(r => cols.map(c => r[c] ?? null)))
  return Object.fromEntries((await db.query('SELECT id, name, active, balance::float AS balance, initial_balance::float AS initial_balance FROM contas ORDER BY id')).rows.map(r => [r.id, r]))
}

beforeEach(async () => {
  db = new PGlite()
  await db.exec(`CREATE TABLE contas (id TEXT PRIMARY KEY, name TEXT, type TEXT, active BOOLEAN, balance NUMERIC, initial_balance NUMERIC)`)
  await db.exec(`INSERT INTO contas VALUES
    ('acc_divida_msjc0rqh_duoz4y', 'Contas a Pagar - Fin. TIGGO', 'liability', true, -37905.00, -39900.00),
    ('acc_itau', 'Itau', 'checking', true, 1000, 500),
    ('acc_cafe_do_bras', 'Café do Bras', 'liability', true, -300, -300)`)
})

describe('sync de contas × saldo da dívida de financiamento', () => {
  it('sync com o balance antigo (−62.276,38) não altera o banco; nome/ativo continuam sendo gravados', async () => {
    const r = await sync([{ id: 'acc_divida_msjc0rqh_duoz4y', name: 'Fin. TIGGO (Safra)', type: 'liability', active: false, balance: -62276.38, initial_balance: null }])
    expect(r.acc_divida_msjc0rqh_duoz4y).toEqual({
      id: 'acc_divida_msjc0rqh_duoz4y', name: 'Fin. TIGGO (Safra)', active: false, balance: -37905, initial_balance: -39900,
    })
  })
  it('conta corrente e outra dívida (não de financiamento) gravam o saldo como sempre', async () => {
    const r = await sync([
      { id: 'acc_itau', name: 'Itau', type: 'checking', active: true, balance: 1234.56, initial_balance: 500 },
      { id: 'acc_cafe_do_bras', name: 'Café do Bras', type: 'liability', active: true, balance: -250, initial_balance: -300 },
    ])
    expect(r.acc_itau.balance).toBe(1234.56)
    expect(r.acc_cafe_do_bras.balance).toBe(-250)
  })
  it('conta de dívida ainda inexistente no banco segue como veio (quem cria é o endpoint)', async () => {
    const r = await sync([{ id: 'acc_divida_novo', name: 'Fin. novo', type: 'liability', active: true, balance: -1000, initial_balance: -1000 }])
    expect(r.acc_divida_novo.balance).toBe(-1000)
  })
  it('identificação: liability com id acc_divida_…', () => {
    expect(ehContaDividaFinanciamento({ id: 'acc_divida_x', type: 'liability' })).toBe(true)
    expect(ehContaDividaFinanciamento({ id: 'acc_cafe_do_bras', type: 'liability' })).toBe(false)
    expect(ehContaDividaFinanciamento({ id: 'acc_divida_x', type: 'checking' })).toBe(false)
  })
})
