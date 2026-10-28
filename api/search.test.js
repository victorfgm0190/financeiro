import { describe, it, expect, beforeAll } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { filtrosBusca } from './search.js'

// Os WHERE da Busca Global num Postgres de verdade (PGlite, em memória).
let db
const ids = async (tabela, f) => {
  const { where, params } = f[tabela === 'lancamentos' ? 'tx' : 'sc']
  return (await db.query(`SELECT id FROM ${tabela} ${where} ORDER BY id`, params)).rows.map(r => r.id)
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE TABLE lancamentos (id TEXT PRIMARY KEY, date TEXT, amount NUMERIC, description TEXT, payee TEXT,
      account_id TEXT, to_account_id TEXT, reserva_auto BOOLEAN);
    CREATE TABLE agendamentos (id TEXT PRIMARY KEY, start_date TEXT, amount NUMERIC, description TEXT, payee TEXT, account_id TEXT);
    INSERT INTO lancamentos VALUES
      ('t1', '2026-10-01', -200.00, 'Mercado Extra', 'Extra', 'a', NULL, NULL),
      ('t2', '2026-10-02', 200.99, 'Salário', 'Lumen', 'a', NULL, NULL),
      ('t3', '2026-10-03', -199.99, 'Mercado Pão', 'Pão de Açúcar', 'a', NULL, NULL),
      ('t4', '2026-10-04', -201.00, 'Farmácia', 'Extra', 'a', NULL, NULL),
      ('t5', '2026-10-05', -200.50, 'Mercado Extra', 'Outro', 'b', NULL, NULL),
      ('t6', '2026-10-06', -200.00, 'Sombra', NULL, NULL, NULL, TRUE);
    INSERT INTO agendamentos VALUES ('s1', '2026-10-01', 200.00, 'Aluguel', 'Imobiliária', 'a'), ('s2', '2026-10-01', 86.98, 'Luz', 'Copel', NULL);`)
})

describe('filtrosBusca', () => {
  it('Exato: só o mesmo valor (despesa ou receita), em centavos', async () => {
    expect(await ids('lancamentos', filtrosBusca({ value: 200, valueMode: 'exato' }))).toEqual(['t1'])
    expect(await ids('agendamentos', filtrosBusca({ value: 86.98, valueMode: 'exato' }))).toEqual(['s2'])
  })
  it('Aproximado: 200,00 a 200,99 — sem 199,99 nem 201,00', async () => {
    expect(await ids('lancamentos', filtrosBusca({ value: 200, valueMode: 'aproximado' }))).toEqual(['t1', 't2', 't5'])
  })
  it('valueMode desconhecido vira exato', async () => {
    expect(await ids('lancamentos', filtrosBusca({ value: 200, valueMode: "'; DROP TABLE lancamentos; --" }))).toEqual(['t1'])
  })
  it('descrição e favorecido: cada um sozinho, e juntos com E', async () => {
    expect(await ids('lancamentos', filtrosBusca({ description: 'mercado' }))).toEqual(['t1', 't3', 't5'])
    expect(await ids('lancamentos', filtrosBusca({ payee: 'extra' }))).toEqual(['t1', 't4'])
    expect(await ids('lancamentos', filtrosBusca({ description: 'mercado', payee: 'extra' }))).toEqual(['t1'])
  })
  it('texto vira parâmetro, nunca SQL', async () => {
    const f = filtrosBusca({ description: "x' OR '1'='1", payee: '%' })
    expect(f.tx.where).not.toContain("'1'='1")
    expect(await ids('lancamentos', f)).toEqual([])
  })
  it('text legado (descrição OU favorecido), período e contas do perfil seguem como antes', async () => {
    expect(await ids('lancamentos', filtrosBusca({ text: 'extra' }))).toEqual(['t1', 't4', 't5'])
    expect(await ids('lancamentos', filtrosBusca({ text: 'mercado', from: '2026-10-02', to: '2026-10-04' }))).toEqual(['t3'])
    expect(await ids('lancamentos', filtrosBusca({ text: 'mercado', accIds: ['b'] }))).toEqual(['t5'])
    expect(await ids('agendamentos', filtrosBusca({ value: 86.98, accIds: ['zz'] }))).toEqual(['s2'])
  })
})
