// Gera supabase/estrutura_base.sql: a ESTRUTURA (tabelas, colunas, defaults, restrições, índices e
// sequences) do banco do ambiente principal (neondb), lida do catálogo do Postgres — SÓ SELECT no
// catálogo, NENHUMA linha de dado. É a base de todo banco de cliente novo (api/_provisionar.js);
// depois dela entram as migrações de supabase/migrations.
// Ficam de fora: plataforma_* (moram no central) e _migracoes (cada banco tem a sua).
//
// Uso (na raiz do projeto):
//   node --env-file=.env.local scripts/gerar-estrutura-base.js
// Depois: node scripts/gerar-sql-embutido.js (a API lê o SQL embutido em api/_sqlEmbutido.js).

import process from 'node:process'
import pg from 'pg'
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

if (!process.env.NEON_DATABASE_URL) {
  console.error('✖ NEON_DATABASE_URL não definida. Rode com: node --env-file=.env.local scripts/gerar-estrutura-base.js')
  process.exit(1)
}
const FORA = (t) => t.startsWith('plataforma_') || t === '_migracoes'
const ident = (s) => (/^[a-z_][a-z0-9_]*$/.test(s) && !['order', 'user', 'group'].includes(s) ? s : `"${s.replace(/"/g, '""')}"`)

const c = new pg.Client({ connectionString: process.env.NEON_DATABASE_URL, ssl: { rejectUnauthorized: false } })
await c.connect()
const q = async (sql, p = []) => (await c.query(sql, p)).rows
try {
  const [{ db }] = await q('SELECT current_database() AS db')
  const tabelas = (await q(`SELECT c.oid, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname`)).filter(t => !FORA(t.relname))
  const oids = tabelas.map(t => t.oid)

  const sequences = await q(`SELECT s.sequencename, s.data_type, s.increment_by, s.min_value, s.max_value, s.cycle,
      (SELECT t.relname || '.' || a.attname FROM pg_depend d JOIN pg_class t ON t.oid = d.refobjid
         JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
        WHERE d.objid = (quote_ident(s.schemaname) || '.' || quote_ident(s.sequencename))::regclass AND d.deptype IN ('a', 'i')) AS dono
    FROM pg_sequences s WHERE s.schemaname = 'public' ORDER BY s.sequencename`)
  const colunas = await q(`SELECT a.attrelid AS oid, a.attname, format_type(a.atttypid, a.atttypmod) AS tipo, a.attnotnull,
      pg_get_expr(d.adbin, d.adrelid) AS padrao, a.attidentity, a.attgenerated
    FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = ANY($1) AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attrelid, a.attnum`, [oids])
  const restricoes = await q(`SELECT conrelid AS oid, conname, contype, pg_get_constraintdef(oid) AS def
    FROM pg_constraint WHERE conrelid = ANY($1) ORDER BY conrelid, contype, conname`, [oids])
  const indices = await q(`SELECT i.indrelid AS oid, pg_get_indexdef(i.indexrelid) AS def, ci.relname
    FROM pg_index i JOIN pg_class ci ON ci.oid = i.indexrelid
    WHERE i.indrelid = ANY($1) AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conindid = i.indexrelid)
    ORDER BY ci.relname`, [oids])
  if (colunas.some(x => x.attidentity || x.attgenerated)) throw new Error('coluna identity/generated não suportada pelo gerador')

  let commit = 'desconhecido'
  try { commit = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim() } catch { /* sem git */ }
  const out = [
    '-- ============================================================',
    '-- ESTRUTURA BASE dos bancos de ambiente — GERADO, não editar à mão.',
    `-- Gerado por scripts/gerar-estrutura-base.js em ${new Date().toISOString()} a partir do`,
    `-- database "${db}" (commit ${commit}). Só estrutura: nenhum comando de dados, nenhuma linha copiada.`,
    `-- ${tabelas.length} tabelas · ${indices.length} índices · ${sequences.length} sequences. Fora: plataforma_*, _migracoes.`,
    '-- Aplicada uma vez, numa transação, no banco novo do cliente; depois vêm as migrações.',
    '-- ============================================================',
    '',
  ]
  for (const s of sequences) {
    out.push(`CREATE SEQUENCE IF NOT EXISTS ${ident(s.sequencename)} AS ${s.data_type} INCREMENT BY ${s.increment_by} MINVALUE ${s.min_value} MAXVALUE ${s.max_value} START WITH ${s.min_value}${s.cycle ? ' CYCLE' : ''};`)
  }
  if (sequences.length) out.push('')
  for (const t of tabelas) {
    const linhas = colunas.filter(x => x.oid === t.oid).map(x =>
      `  ${ident(x.attname)} ${x.tipo}${x.padrao != null ? ` DEFAULT ${x.padrao}` : ''}${x.attnotnull ? ' NOT NULL' : ''}`)
    for (const r of restricoes.filter(x => x.oid === t.oid && ['p', 'u', 'c'].includes(x.contype))) {
      linhas.push(`  CONSTRAINT ${ident(r.conname)} ${r.def}`)
    }
    out.push(`CREATE TABLE IF NOT EXISTS ${ident(t.relname)} (\n${linhas.join(',\n')}\n);`, '')
  }
  for (const s of sequences.filter(x => x.dono)) {
    const [tab, col] = s.dono.split('.')
    out.push(`ALTER SEQUENCE ${ident(s.sequencename)} OWNED BY ${ident(tab)}.${ident(col)};`)
  }
  const fks = restricoes.filter(x => x.contype === 'f')
  for (const r of fks) {
    const tab = tabelas.find(t => t.oid === r.oid).relname
    out.push(`DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${r.conname}' AND conrelid = '${tab}'::regclass) THEN
    ALTER TABLE ${ident(tab)} ADD CONSTRAINT ${ident(r.conname)} ${r.def};
  END IF;
END $$;`)
  }
  if (fks.length) out.push('')
  for (const i of indices) out.push(`${i.def.replace(/^CREATE (UNIQUE )?INDEX /, 'CREATE $1INDEX IF NOT EXISTS ')};`)
  out.push('')

  const sql = out.join('\n')
  if (/^\s*(INSERT|UPDATE|DELETE|COPY|TRUNCATE)\b/im.test(sql)) throw new Error('a estrutura gerada contém comando de dados')
  const destino = fileURLToPath(new URL('../supabase/estrutura_base.sql', import.meta.url))
  writeFileSync(destino, sql)
  console.log(`✔ supabase/estrutura_base.sql — ${tabelas.length} tabelas, ${indices.length} índices, ${sequences.length} sequences, ${fks.length} FKs (database ${db}, commit ${commit})`)
} catch (err) {
  console.error('✖', err.message)
  process.exitCode = 1
} finally {
  await c.end()
}
