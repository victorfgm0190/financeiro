// Aplica o esquema do BANCO CENTRAL (finup_central): supabase/central/*.sql em ordem de nome +
// DDL_PLATAFORMA (api/_plataforma.js). Tudo idempotente: rodar de novo não muda nada.
// Cada passo roda numa transação com SET LOCAL ROLE finup_central_app quando o central já tem papel
// próprio (R7, comoDonoDoBanco): tabela nova nasce do papel, senão o /api não a lê.
// Uso (na raiz do projeto):
//   node --env-file=.env.local scripts/migrar-central.js [--dry-run]

import process from 'node:process'
import pg from 'pg'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { DDL_PLATAFORMA } from '../api/_plataforma.js'
import { comoDonoDoBanco } from '../api/_usuarioBanco.js'
import { configTlsVerificado } from '../api/_conexao.js'

const dryRun = process.argv.includes('--dry-run')
if (!process.env.CENTRAL_DATABASE_URL) {
  console.error('✖ CENTRAL_DATABASE_URL não definida. Rode com: node --env-file=.env.local scripts/migrar-central.js')
  process.exit(1)
}

const dir = fileURLToPath(new URL('../supabase/central/', import.meta.url))
const arquivos = readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
const passos = [...arquivos.map(f => [f, readFileSync(dir + f, 'utf-8')]), ['DDL_PLATAFORMA (api/_plataforma.js)', DDL_PLATAFORMA]]

const client = new pg.Client(configTlsVerificado(process.env.CENTRAL_DATABASE_URL))
await client.connect()
try {
  const [{ db }] = (await client.query('SELECT current_database() AS db')).rows
  console.log(`Banco central: ${db}${dryRun ? ' (dry-run: nada é aplicado)' : ''}`)
  for (const [nome, sql] of passos) {
    if (dryRun) { console.log(`  · aplicaria ${nome}`); continue }
    const dono = await comoDonoDoBanco(client, db, async (q) => {
      await client.query(sql) // vários comandos: sem parâmetros (protocolo simples)
      return (await q('SELECT current_user AS u'))[0].u
    })
    console.log(`  ✔ ${nome} (como ${dono})`)
  }
  const ambientes = (await client.query("SELECT to_regclass('ambientes') AS t")).rows[0].t
    ? (await client.query('SELECT sigla, nome, database_name, status, schema_versao FROM ambientes ORDER BY sigla')).rows
    : []
  console.log('Ambientes:', ambientes.length ? '' : '(tabela ainda não existe)')
  for (const a of ambientes) console.log(`  ${a.sigla.padEnd(8)} ${a.status.padEnd(13)} db=${a.database_name} versão=${a.schema_versao} · ${a.nome}`)
} catch (err) {
  console.error('✖', err.message)
  process.exitCode = 1
} finally {
  await client.end()
}
