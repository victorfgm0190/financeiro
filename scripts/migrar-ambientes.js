// Aplica as migrações pendentes de supabase/migrations em CADA ambiente ativo (um database por
// ambiente, listados no banco central), registrando a versão em ambientes.schema_versao.
//
// Versão = quantas migrações (em ordem de nome de arquivo) já valem naquele database. Cada database
// guarda os nomes aplicados na tabela _migracoes. Database sem _migracoes (ex.: o neondb, migrado à
// mão antes deste script): as primeiras `schema_versao` migrações são REGISTRADAS como aplicadas
// sem rodar de novo (linha de base) — o seed do 'vm' no central já nasce com schema_versao = 2.
//
// Uso (na raiz do projeto):
//   node --env-file=.env.local scripts/migrar-ambientes.js --dry-run   ← só lista o que faria
//   node --env-file=.env.local scripts/migrar-ambientes.js
//   ... [--ambiente vm]   ← só um ambiente

import process from 'node:process'
import pg from 'pg'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { urlDoDatabase } from '../api/_conexao.js'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const so = args.includes('--ambiente') ? String(args[args.indexOf('--ambiente') + 1] || '').toLowerCase() : null
if (!process.env.CENTRAL_DATABASE_URL) {
  console.error('✖ CENTRAL_DATABASE_URL não definida. Rode com: node --env-file=.env.local scripts/migrar-ambientes.js')
  process.exit(1)
}

const dir = fileURLToPath(new URL('../supabase/migrations/', import.meta.url))
const MIGRACOES = readdirSync(dir).filter(f => f.endsWith('.sql')).sort()

const conectar = async (url) => {
  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await c.connect()
  return c
}

const central = await conectar(process.env.CENTRAL_DATABASE_URL)
try {
  const ambientes = (await central.query(
    "SELECT id, sigla, database_name, schema_versao FROM ambientes WHERE status = 'ativo' AND ($1::text IS NULL OR sigla = $1) ORDER BY sigla",
    [so],
  )).rows
  console.log(`${MIGRACOES.length} migração(ões) em supabase/migrations · ${ambientes.length} ambiente(s) ativo(s)${dryRun ? ' · DRY-RUN (nada é aplicado)' : ''}`)

  for (const amb of ambientes) {
    const db = await conectar(urlDoDatabase(amb.database_name))
    try {
      const [{ existe }] = (await db.query("SELECT to_regclass('_migracoes') IS NOT NULL AS existe")).rows
      let aplicadas = existe ? new Set((await db.query('SELECT nome FROM _migracoes')).rows.map(r => r.nome)) : new Set()
      const base = existe ? [] : MIGRACOES.slice(0, amb.schema_versao || 0)
      const pendentes = MIGRACOES.filter(m => !aplicadas.has(m) && !base.includes(m))

      console.log(`\n[${amb.sigla}] database ${amb.database_name} · versão ${amb.schema_versao}`)
      for (const m of base) console.log(`  = ${m} (linha de base: só registra, não roda)`)
      for (const m of pendentes) console.log(`  + ${m}`)
      if (!base.length && !pendentes.length) console.log('  em dia')
      if (dryRun) continue

      await db.query(`CREATE TABLE IF NOT EXISTS _migracoes (
        nome TEXT PRIMARY KEY,
        aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
        linha_de_base BOOLEAN NOT NULL DEFAULT false
      )`)
      for (const m of base) await db.query('INSERT INTO _migracoes (nome, linha_de_base) VALUES ($1, true) ON CONFLICT DO NOTHING', [m])
      for (const m of pendentes) {
        await db.query('BEGIN')
        try {
          await db.query(readFileSync(dir + m, 'utf-8'))
          await db.query('INSERT INTO _migracoes (nome) VALUES ($1)', [m])
          await db.query('COMMIT')
          console.log(`  ✔ ${m}`)
        } catch (err) {
          await db.query('ROLLBACK')
          throw new Error(`[${amb.sigla}] ${m}: ${err.message}`, { cause: err })
        }
      }
      aplicadas = new Set((await db.query('SELECT nome FROM _migracoes')).rows.map(r => r.nome))
      const versao = MIGRACOES.filter(m => aplicadas.has(m)).length
      await central.query('UPDATE ambientes SET schema_versao = $2, updated_at = now() WHERE id = $1', [amb.id, versao])
      console.log(`  versão → ${versao}`)
    } finally {
      await db.end()
    }
  }
} catch (err) {
  console.error('✖', err.message)
  process.exitCode = 1
} finally {
  await central.end()
}
