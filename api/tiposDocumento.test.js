import { describe, it, expect, beforeEach } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import {
  ensureTiposDocumentoSchema, normalizarTipoBody, SEED_TIPOS_DOCUMENTO,
  SQL_TIPO_EM_MASSA_AGENDAMENTOS, SQL_USOS_TIPO,
} from './_tiposDocumento.js'

// A migração real (DDL + seed + colunas) num Postgres de verdade (PGlite, em memória).
let db
const q = async (sql, params = []) => (await db.query(sql, params)).rows

beforeEach(async () => {
  db = new PGlite()
  await db.exec(`CREATE TABLE agendamentos (id TEXT PRIMARY KEY, description TEXT);
    CREATE TABLE lancamentos (id TEXT PRIMARY KEY, description TEXT);
    INSERT INTO agendamentos VALUES ('sch_1', 'Aluguel'), ('sch_2', 'Luz'), ('sch_3', 'Água');
    INSERT INTO lancamentos VALUES ('tx_1', 'Mercado');`)
})

describe('migração tipos_documento', () => {
  it('cria a tabela, semeia 11 tipos (CC sistema) e adiciona a coluna NULL nas duas tabelas', async () => {
    await ensureTiposDocumentoSchema(q)
    const tipos = await q('SELECT * FROM tipos_documento ORDER BY ordem')
    expect(tipos.map(t => t.sigla)).toEqual(SEED_TIPOS_DOCUMENTO.map(s => s[1]))
    expect(tipos.filter(t => t.sistema).map(t => t.sigla)).toEqual(['CC'])
    expect(typeof tipos[0].id).toBe('string')
    // Registros existentes ficam NULL.
    expect((await q('SELECT tipo_documento_id FROM agendamentos')).every(r => r.tipo_documento_id === null)).toBe(true)
    expect((await q('SELECT tipo_documento_id FROM lancamentos'))[0].tipo_documento_id).toBeNull()
  })

  it('idempotente: rodar de novo não duplica o seed nem falha', async () => {
    await ensureTiposDocumentoSchema(q)
    await q("DELETE FROM tipos_documento WHERE sigla = 'OUT'")
    await ensureTiposDocumentoSchema(q)
    expect((await q('SELECT COUNT(*)::int AS n FROM tipos_documento'))[0].n).toBe(10)
  })

  it('CHECKs: sigla até 4, natureza válida', async () => {
    await ensureTiposDocumentoSchema(q)
    await expect(q("INSERT INTO tipos_documento (nome, sigla) VALUES ('X', 'ABCDE')")).rejects.toThrow()
    await expect(q("INSERT INTO tipos_documento (nome, sigla, natureza) VALUES ('X', 'X', 'outra')")).rejects.toThrow()
  })

  it('tabela ausente → erro explícito, nada de ALTER no escuro', async () => {
    await db.exec('DROP TABLE lancamentos')
    await expect(ensureTiposDocumentoSchema(q)).rejects.toThrow(/lancamentos/)
  })
})

describe('em massa e usos', () => {
  it('define e remove o tipo de vários agendamentos; conta usos', async () => {
    await ensureTiposDocumentoSchema(q)
    const [bol] = await q("SELECT id FROM tipos_documento WHERE sigla = 'BOL'")
    const r = await q(SQL_TIPO_EM_MASSA_AGENDAMENTOS, [['sch_1', 'sch_2', 'nao_existe'], bol.id])
    expect(r.map(x => x.id).sort()).toEqual(['sch_1', 'sch_2'])
    expect((await q(SQL_USOS_TIPO, [bol.id]))[0]).toEqual({ agendamentos: 2, lancamentos: 0 })
    await q(SQL_TIPO_EM_MASSA_AGENDAMENTOS, [['sch_1'], null])
    expect((await q("SELECT tipo_documento_id FROM agendamentos WHERE id = 'sch_1'"))[0].tipo_documento_id).toBeNull()
  })
})

describe('normalizarTipoBody', () => {
  it('valida nome/sigla/natureza e põe a sigla em maiúsculas', () => {
    expect(normalizarTipoBody({ nome: '', sigla: 'X' }).erro).toMatch(/nome/)
    expect(normalizarTipoBody({ nome: 'X', sigla: 'abcde' }).erro).toMatch(/4/)
    expect(normalizarTipoBody({ nome: 'X', sigla: 'x', natureza: 'nada' }).erro).toMatch(/natureza/)
    expect(normalizarTipoBody({ nome: ' Boleto ', sigla: 'bol' }).dados).toMatchObject({ nome: 'Boleto', sigla: 'BOL', natureza: 'ambos', ativo: true })
  })
})
