// USUÁRIO POSTGRES PRÓPRIO DE UM AMBIENTE (R7 — docs/grafity-2026-10.md §5.5, api/_usuarioBanco.js).
// Roda como neondb_owner (ADMIN_DATABASE_URL, ou CENTRAL_DATABASE_URL do .env.local). Nunca mostra
// senha: só nomes, contadores e o resultado das verificações.
//
//   node --env-file=.env.local scripts/db-usuario-ambiente.js criar <database>
//       papel <database>_app (cria ou troca a senha), limites de sessão, dono do banco e das tabelas,
//       senha cifrada no central (FINUP_DB_KEY). Ainda NÃO revoga o CONNECT de PUBLIC.
//   ... fechar <database>      REVOKE CONNECT FROM PUBLIC; CONNECT só para o papel e o neondb_owner
//                              (serve também para neondb/finup_central antes de terem papel).
//   ... verificar <database>   atributos, donos, ACL dos bancos e conexões reais como o papel:
//                              no próprio banco (tem de funcionar) e nos outros (tem de ser negada).
//   ... rollback <database>    desfaz tudo do papel daquele banco (supabase/rollback/r7-usuario-por-ambiente.sql).
//   ... reabrir <database>     GRANT CONNECT TO PUBLIC (desfaz o "fechar").

import process from 'node:process'
import pg from 'pg'
import { urlDoDatabase, configDoPool, fecharPoolDoDatabase, nomeDatabaseCentral, configTlsVerificado } from '../api/_conexao.js'
import { cifrarSenha, aadDoAmbiente } from '../api/_cifraDb.js'
import {
  papelDoBanco, gerarSenhaDoBanco, criarOuAtualizarPapel, transferirDono, fecharConexao,
} from '../api/_usuarioBanco.js'

const [acao, database] = process.argv.slice(2)
const ACOES = ['criar', 'fechar', 'verificar', 'rollback', 'reabrir']
if (!ACOES.includes(acao) || !/^[a-z0-9_]{1,59}$/.test(database || '')) {
  console.error(`Uso: node --env-file=.env.local scripts/db-usuario-ambiente.js <${ACOES.join('|')}> <database>`)
  process.exit(1)
}
const BANCOS = ['neondb', 'finup_central', 'cliente_teste1', 'postgres']
const papel = papelDoBanco(database)

const ssl = { rejectUnauthorized: false }
async function comAdmin(db, fn, { tlsVerificado = false } = {}) {
  // tlsVerificado: certificado conferido (o criar manda a senha em texto no CREATE/ALTER ROLE)
  const c = new pg.Client(tlsVerificado ? configTlsVerificado(urlDoDatabase(db)) : { connectionString: urlDoDatabase(db), ssl })
  await c.connect()
  try { return await fn(async (sql, p = []) => (await c.query(sql, p)).rows, c) } finally { await c.end() }
}
const comCentral = (fn) => {
  const c = new pg.Client({ connectionString: process.env.CENTRAL_DATABASE_URL, ssl })
  return c.connect().then(() => fn(async (sql, p = []) => (await c.query(sql, p)).rows)).finally(() => c.end())
}
async function transacao(c, fn) {
  await c.query('BEGIN')
  try { const r = await fn(); await c.query('COMMIT'); return r } catch (err) { await c.query('ROLLBACK').catch(() => {}); throw err }
}

async function criar() {
  const [amb] = await comCentral(q => q('SELECT id, sigla, database_name FROM ambientes WHERE database_name = $1', [database]))
  if (!amb) throw new Error(`nenhum ambiente com database ${database} no central`)
  const senha = gerarSenhaDoBanco()
  const cifrada = cifrarSenha(senha, aadDoAmbiente(amb.id, database)) // sem FINUP_DB_KEY: para aqui
  const r = await comAdmin(database, (q, c) => transacao(c, async () => ({
    situacao: await criarOuAtualizarPapel(q, papel, senha),
    objetos: await transferirDono(q, papel),
  })), { tlsVerificado: true })
  await comCentral(q => q('UPDATE ambientes SET db_usuario = $2, db_senha_cifrada = $3, updated_at = now() WHERE id = $1', [amb.id, papel, cifrada]))
  console.log(`✔ ${papel} ${r.situacao} · dono de ${database} + ${r.objetos} objeto(s) transferido(s) · senha cifrada no central (ambiente ${amb.sigla})`)
}

async function fechar() {
  await comAdmin(database, async (q) => {
    const [existe] = await q('SELECT 1 FROM pg_roles WHERE rolname = $1', [papel])
    await fecharConexao(q, existe ? papel : null)
    console.log(`✔ ${database}: CONNECT revogado de PUBLIC · liberado para neondb_owner${existe ? ` e ${papel}` : ''}`)
  })
}

async function reabrir() {
  await comAdmin(database, q => q(`DO $$ BEGIN EXECUTE format('GRANT CONNECT ON DATABASE %I TO PUBLIC', current_database()); END $$`))
  console.log(`✔ ${database}: CONNECT para PUBLIC de volta`)
}

async function rollback() {
  await comCentral(q => q('UPDATE ambientes SET db_usuario = NULL, db_senha_cifrada = NULL, updated_at = now() WHERE database_name = $1', [database]))
  console.log('  central: credencial removida (o /api volta ao neondb_owner)')
  await comAdmin(database, (q, c) => transacao(c, async () => {
    const [existe] = await q('SELECT 1 FROM pg_roles WHERE rolname = $1', [papel])
    if (!existe) return console.log(`  ${papel} não existe`)
    await q(`DO $$ BEGIN EXECUTE format('ALTER DATABASE %I OWNER TO CURRENT_USER', current_database()); END $$`)
    await q(`REASSIGN OWNED BY "${papel}" TO CURRENT_USER`) // seguro aqui: o papel só possui o próprio banco
    await q(`DO $$ BEGIN EXECUTE format('GRANT CONNECT ON DATABASE %I TO PUBLIC', current_database()); END $$`)
    await q(`DROP OWNED BY "${papel}"`)
    await q(`DROP ROLE "${papel}"`)
  }))
  console.log(`✔ ${papel} removido; ${database} de volta ao neondb_owner e aberto para PUBLIC`)
}

async function tentarConectar(cfg, db) {
  const c = new pg.Client({ ...cfg, database: db, ssl })
  try {
    await c.connect()
    const [r] = (await c.query("SELECT current_user AS u, current_setting('statement_timeout') AS st, current_setting('idle_in_transaction_session_timeout') AS it")).rows
    return { ok: true, ...r }
  } catch (err) {
    return { ok: false, codigo: err.code, erro: err.message }
  } finally {
    await c.end().catch(() => {})
  }
}

async function verificar() {
  await comAdmin(database, async (q) => {
    const [r] = await q(`SELECT rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls, rolcanlogin, rolconnlimit, rolconfig
      FROM pg_roles WHERE rolname = $1`, [papel])
    if (!r) throw new Error(`${papel} não existe`)
    console.log(`\n${papel}:`, r)
    console.log('  é membro de:', (await q(`SELECT g.rolname FROM pg_auth_members m JOIN pg_roles g ON g.oid = m.roleid
      JOIN pg_roles u ON u.oid = m.member WHERE u.rolname = $1`, [papel])).map(x => x.rolname))
    console.log('  membros dele:', (await q(`SELECT u.rolname, m.inherit_option, m.set_option FROM pg_auth_members m
      JOIN pg_roles g ON g.oid = m.roleid JOIN pg_roles u ON u.oid = m.member WHERE g.rolname = $1`, [papel])))
    console.log('  dono do banco:', (await q('SELECT pg_get_userbyid(datdba) AS dono FROM pg_database WHERE datname = current_database()'))[0].dono)
    console.log('  donos das tabelas public:', await q("SELECT tableowner, count(*)::int AS n FROM pg_tables WHERE schemaname = 'public' GROUP BY 1"))
    console.log('  CONNECT por banco (has_database_privilege):', Object.fromEntries((await q(
      `SELECT datname, has_database_privilege($1, datname, 'CONNECT') AS c FROM pg_database WHERE NOT datistemplate ORDER BY 1`, [papel])).map(x => [x.datname, x.c])))
    console.log('  ACL dos bancos:', Object.fromEntries((await q('SELECT datname, datacl::text FROM pg_database WHERE NOT datistemplate ORDER BY 1')).map(x => [x.datname, x.datacl])))
  })
  const cfg = await configDoPool(database)
  if (cfg.origem !== 'papel') throw new Error(`o central não tem credencial de ${database} (origem: ${cfg.origem})`)
  const opcoes = { ...cfg }
  delete opcoes.origem
  console.log(`\nConexões reais como ${papel}:`)
  for (const db of [database, ...BANCOS.filter(b => b !== database)]) {
    const t = await tentarConectar(opcoes, db)
    console.log(`  ${db.padEnd(15)} ${t.ok ? `CONECTOU (current_user=${t.u}, statement_timeout=${t.st}, idle_in_tx=${t.it})` : `NEGADA [${t.codigo}] ${t.erro}`}`)
  }
  console.log(`\nO que ${papel} NÃO pode fazer (no próprio banco):`)
  const c = new pg.Client({ ...opcoes, ssl })
  await c.connect()
  try {
    for (const [rot, sql] of [
      ['CREATE ROLE', 'CREATE ROLE r7_teste_nao_deve_existir'],
      ['CREATE DATABASE', 'CREATE DATABASE r7_teste_nao_deve_existir'],
      ['CREATE EXTENSION dblink', 'CREATE EXTENSION dblink'],
      ['SET ROLE neondb_owner', 'SET ROLE neondb_owner'],
      ['ALTER ROLE ... BYPASSRLS', `ALTER ROLE "${papel}" BYPASSRLS`],
    ]) {
      try { await c.query(sql); console.log(`  ✖ ${rot}: PERMITIDO (não devia)`) } catch (err) { console.log(`  ✔ ${rot}: negado [${err.code}]`) }
    }
  } finally {
    await c.end()
  }
}

try {
  await { criar, fechar, verificar, rollback, reabrir }[acao]()
} catch (err) {
  console.error('✖', err.message)
  process.exitCode = 1
} finally {
  await fecharPoolDoDatabase(nomeDatabaseCentral()) // pool do central aberto pelo configDoPool
}
