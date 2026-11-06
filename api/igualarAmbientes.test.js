import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { abrirPGlite } from './_testes/bancoTeste.js'
import { DDL_BOAS_VINDAS, DDL_GUIAS, DDL_GUIAS_LIGADOS, DDL_AJUDA_CAMPOS, DDL_JORNADA, DDL_PROGRESSO } from './boas-vindas.js'

// Migração que iguala os ambientes: roda em qualquer um deles, sem erro e sem mexer em dados.
const SQL = readFileSync(fileURLToPath(new URL('../supabase/migrations/2026-11-06f_igualar_ambientes.sql', import.meta.url)), 'utf-8')
const colunas = async (db, t) => (await db.query(
  "SELECT column_name AS c, data_type AS d, is_nullable AS n, column_default AS p FROM information_schema.columns WHERE table_name = $1 ORDER BY column_name", [t],
)).rows
const indices = async (db) => (await db.query("SELECT indexname AS i FROM pg_indexes WHERE schemaname = 'public'")).rows.map(r => r.i)

describe('2026-11-06f_igualar_ambientes', () => {
  it('banco sem as tabelas de IA: não falha e cria as de ajuda', async () => {
    const db = abrirPGlite()
    await db.exec(SQL)
    expect((await colunas(db, 'boas_vindas_usuario')).map(c => c.c)).toEqual(expect.arrayContaining(['ajuda_campos', 'jornada_ligada', 'guias_ligados', 'progresso']))
    expect((await colunas(db, 'guia_telas_ocultas')).length).toBe(4)
  }, 60_000)

  it('cria os índices que faltam, sem perder dados, e pode rodar de novo', async () => {
    const db = abrirPGlite()
    await db.exec(`
      CREATE TABLE ia_pre_lancamentos (id TEXT PRIMARY KEY, status TEXT);
      CREATE TABLE ia_uso (id TEXT PRIMARY KEY, created_at TIMESTAMPTZ);
      CREATE TABLE ia_apelidos (id TEXT PRIMARY KEY, tipo TEXT, termo TEXT, UNIQUE (tipo, termo));
      INSERT INTO ia_apelidos VALUES ('a', 'conta', 'x');
      ${DDL_BOAS_VINDAS};
      INSERT INTO boas_vindas_usuario (user_id) VALUES ('u1');`)
    await db.exec(SQL)
    await db.exec(SQL)
    expect(await indices(db)).toEqual(expect.arrayContaining(['idx_ia_pre_lanc_status', 'idx_ia_uso_created', 'uq_ia_apelidos_tipo_termo']))
    expect((await db.query('SELECT * FROM ia_apelidos')).rows).toHaveLength(1)
    const [u] = (await db.query("SELECT ajuda_campos, jornada_ligada, guias_ligados, progresso FROM boas_vindas_usuario WHERE user_id = 'u1'")).rows
    expect(u).toEqual({ ajuda_campos: true, jornada_ligada: true, guias_ligados: true, progresso: {} })
  }, 60_000)

  it('dá a mesma estrutura que a rota criaria', async () => {
    const pelaRota = abrirPGlite()
    await pelaRota.exec([DDL_BOAS_VINDAS, DDL_GUIAS_LIGADOS, DDL_AJUDA_CAMPOS, DDL_JORNADA, DDL_PROGRESSO, DDL_GUIAS].join(';\n'))
    const pelaMigracao = abrirPGlite()
    await pelaMigracao.exec(SQL)
    for (const t of ['boas_vindas_usuario', 'guia_telas_ocultas']) expect(await colunas(pelaMigracao, t)).toEqual(await colunas(pelaRota, t))
  }, 60_000)
})
