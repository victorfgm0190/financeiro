// Copia plataforma_clientes, plataforma_historico e plataforma_cadastro_envios do neondb para o
// banco central (finup_central). NÃO apaga nada do neondb (o Victor apaga depois de conferir).
// No central: INSERT ... ON CONFLICT (id) DO NOTHING — rodar de novo não duplica.
// Mostra a contagem de linhas de cada tabela nos dois bancos, antes e depois.
// Pré-requisito: node --env-file=.env.local scripts/migrar-central.js
// Uso (na raiz do projeto):
//   node --env-file=.env.local scripts/copiar-plataforma-central.js [--dry-run]

import process from 'node:process'
import pg from 'pg'
import { DDL_PLATAFORMA } from '../api/_plataforma.js'
import { configTlsVerificado } from '../api/_conexao.js'

const dryRun = process.argv.includes('--dry-run')
for (const v of ['NEON_DATABASE_URL', 'CENTRAL_DATABASE_URL']) {
  if (!process.env[v]) {
    console.error(`✖ ${v} não definida. Rode com: node --env-file=.env.local scripts/copiar-plataforma-central.js`)
    process.exit(1)
  }
}

// Ordem importa: historico referencia clientes.
const TABELAS = ['plataforma_clientes', 'plataforma_historico', 'plataforma_cadastro_envios']

const conectar = async (url) => {
  const c = new pg.Client(configTlsVerificado(url))
  await c.connect()
  return c
}
const origem = await conectar(process.env.NEON_DATABASE_URL)
const destino = await conectar(process.env.CENTRAL_DATABASE_URL)

async function contar(c, t) {
  const [{ existe }] = (await c.query('SELECT to_regclass($1) IS NOT NULL AS existe', [t])).rows
  return existe ? (await c.query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n : '—'
}
async function mostrarContagens(rotulo) {
  console.log(`\n${rotulo}`)
  console.log(`  ${'tabela'.padEnd(28)} ${'neondb'.padStart(8)} ${'central'.padStart(8)}`)
  for (const t of TABELAS) console.log(`  ${t.padEnd(28)} ${String(await contar(origem, t)).padStart(8)} ${String(await contar(destino, t)).padStart(8)}`)
}

try {
  const nomes = async (c) => (await c.query('SELECT current_database() AS db')).rows[0].db
  console.log(`Origem: ${await nomes(origem)} → destino: ${await nomes(destino)}${dryRun ? ' (dry-run: nada é gravado)' : ''}`)
  if ((await nomes(origem)) === (await nomes(destino))) throw new Error('origem e destino são o mesmo database')

  await mostrarContagens('ANTES')
  if (!dryRun) {
    await destino.query(DDL_PLATAFORMA)
    await destino.query('BEGIN')
    for (const t of TABELAS) {
      const [{ existe }] = (await origem.query('SELECT to_regclass($1) IS NOT NULL AS existe', [t])).rows
      if (!existe) { console.log(`  · ${t}: não existe no neondb, nada a copiar`); continue }
      // Só as colunas que existem nos DOIS lados (o DDL é o mesmo; isto só protege de diferença).
      const colunasDe = async (c) => (await c.query(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position", [t],
      )).rows.map(r => r.column_name)
      const noDestino = new Set(await colunasDe(destino))
      const cols = (await colunasDe(origem)).filter(c => noDestino.has(c))
      const linhas = (await origem.query(`SELECT ${cols.map(c => `"${c}"`).join(', ')} FROM ${t} ORDER BY created_at, id`)).rows
      let inseridas = 0
      for (const l of linhas) {
        const r = await destino.query(
          `INSERT INTO ${t} (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) ON CONFLICT (id) DO NOTHING`,
          cols.map(c => l[c]),
        )
        inseridas += r.rowCount
      }
      console.log(`  ✔ ${t}: ${linhas.length} lida(s) no neondb, ${inseridas} nova(s) no central`)
    }
    await destino.query('COMMIT')
  }
  await mostrarContagens('DEPOIS')
} catch (err) {
  try { await destino.query('ROLLBACK') } catch { /* ignore */ }
  console.error('✖', err.message)
  process.exitCode = 1
} finally {
  await origem.end()
  await destino.end()
}
