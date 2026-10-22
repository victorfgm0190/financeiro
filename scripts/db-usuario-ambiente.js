// USUÁRIO POSTGRES PRÓPRIO DE UM AMBIENTE (R7 — docs/grafity-2026-10.md §5.5, api/_usuarioBanco.js).
// Roda como neondb_owner (ADMIN_DATABASE_URL, ou CENTRAL_DATABASE_URL do .env.local). Nunca mostra
// senha: só nomes, contadores e o resultado das verificações.
//
//   node --env-file=.env.local scripts/db-usuario-ambiente.js criar <database>
//       papel <database>_app (cria ou troca a senha), limites de sessão, dono das tabelas e CREATE no
//       schema public (o banco fica com o neondb_owner), senha cifrada no central (FINUP_DB_KEY).
//       Ainda NÃO revoga o CONNECT de PUBLIC.
//   ... ajustar <database>     só dono/permissões (transferirDono), sem trocar a senha nem mexer no central.
//   ... fechar <database>      REVOKE CONNECT FROM PUBLIC; CONNECT só para o papel e o neondb_owner
//                              (serve também para neondb/finup_central antes de terem papel).
//   ... verificar <database>   atributos, donos, ACL dos bancos e conexões reais como o papel:
//                              no próprio banco (tem de funcionar) e nos outros (tem de ser negada).
//                              Os testes do que o papel NÃO pode fazer não deixam nada para trás
//                              (testarLimites: BEGIN/ROLLBACK).
//   ... rollback <database>    desfaz tudo do papel daquele banco (supabase/rollback/r7-usuario-por-ambiente.sql).
//   ... reabrir <database>     GRANT CONNECT TO PUBLIC (desfaz o "fechar").
//
// BANCO CENTRAL (finup_central, R7 Fase 3): não tem linha em ambientes e não guarda a própria senha.
//   criar finup_central      papel finup_central_app (cria ou TROCA a senha — a Vercel precisa da nova),
//                            dono das tabelas; a URL vai para a linha CENTRAL_APP_DATABASE_URL do
//                            .env.local (scripts/_papelCentral.js), sem aparecer na tela.
//   verificar finup_central  conecta com a CENTRAL_APP_DATABASE_URL do .env.local.
//   rollback finup_central   desfaz o papel e tira a linha do .env.local. ANTES, a Vercel tem de voltar
//                            à CENTRAL_DATABASE_URL antiga (a do .env.local), senão o site cai.
//   copiar central           põe a CENTRAL_APP_DATABASE_URL na área de transferência (Set-Clipboard),
//                            sem imprimir nada — para colar na Vercel.

import process from 'node:process'
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { urlDoDatabase, configDoPool, fecharPoolDoDatabase, nomeDatabaseCentral, configTlsVerificado } from '../api/_conexao.js'
import { cifrarSenha, aadDoAmbiente } from '../api/_cifraDb.js'
import {
  papelDoBanco, gerarSenhaDoBanco, criarOuAtualizarPapel, transferirDono, fecharConexao, testarLimites,
} from '../api/_usuarioBanco.js'
import { NOME_ENV_CENTRAL_APP, lerLinhaEnv, removerLinhaEnv, definirLinhaEnv, urlDoPapel, opcoesDaUrl } from './_papelCentral.js'

const ARQUIVO_ENV = fileURLToPath(new URL('../.env.local', import.meta.url))
const lerEnvLocal = () => readFileSync(ARQUIVO_ENV, 'utf-8')
const urlCentralApp = () => {
  const url = lerLinhaEnv(lerEnvLocal(), NOME_ENV_CENTRAL_APP)
  if (!url) throw new Error(`${NOME_ENV_CENTRAL_APP} não está no .env.local (rode: criar finup_central)`)
  return url
}

const [acao, database] = process.argv.slice(2)

// copiar central: só arquivo + área de transferência (sem banco). O valor vai pela entrada padrão do
// PowerShell — não aparece na linha de comando nem na tela.
if (acao === 'copiar') {
  try {
    if (!['central', 'finup_central'].includes(database)) throw new Error('Uso: node scripts/db-usuario-ambiente.js copiar central')
    const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Set-Clipboard -Value ([Console]::In.ReadToEnd())'],
      { input: urlCentralApp(), stdio: ['pipe', 'ignore', 'pipe'] })
    if (r.error || r.status !== 0) throw new Error(`Set-Clipboard falhou (código ${r.status ?? r.error?.code})`)
    console.log(`✔ ${NOME_ENV_CENTRAL_APP} copiada para a área de transferência (cole na Vercel como CENTRAL_DATABASE_URL)`)
  } catch (err) {
    console.error('✖', err.message)
    process.exitCode = 1
  }
  process.exit()
}

const ACOES = ['criar', 'ajustar', 'fechar', 'verificar', 'rollback', 'reabrir']
if (!ACOES.includes(acao) || !/^[a-z0-9_]{1,59}$/.test(database || '')) {
  console.error(`Uso: node --env-file=.env.local scripts/db-usuario-ambiente.js <${ACOES.join('|')}> <database>  |  copiar central`)
  process.exit(1)
}
const BANCOS = ['neondb', 'finup_central', 'cliente_teste1', 'postgres']
const papel = papelDoBanco(database)
const ehCentral = database === nomeDatabaseCentral()

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

// Central: papel + dono das tabelas; a URL nova vai para o .env.local (o central não guarda a própria
// senha). Se a gravação do arquivo falhar, o papel já tem a senha nova: rode criar de novo.
async function criarCentral() {
  const senha = gerarSenhaDoBanco()
  const r = await comAdmin(database, (q, c) => transacao(c, async () => ({
    situacao: await criarOuAtualizarPapel(q, papel, senha),
    objetos: await transferirDono(q, papel),
  })), { tlsVerificado: true })
  writeFileSync(ARQUIVO_ENV, definirLinhaEnv(lerEnvLocal(), NOME_ENV_CENTRAL_APP, urlDoPapel(urlDoDatabase(database), papel, senha)))
  console.log(`✔ ${papel} ${r.situacao} · ${r.objetos} objeto(s) transferido(s), CREATE no schema public, banco com o neondb_owner`)
  console.log(`  URL gravada no .env.local como ${NOME_ENV_CENTRAL_APP} (não exibida). Para colar na Vercel: node scripts/db-usuario-ambiente.js copiar central`)
  if (r.situacao === 'atualizado') console.log('  ⚠ senha TROCADA: se a Vercel já usava o papel, atualize a CENTRAL_DATABASE_URL lá e faça Redeploy')
}

async function criar() {
  if (ehCentral) return criarCentral()
  const [amb] = await comCentral(q => q('SELECT id, sigla, database_name FROM ambientes WHERE database_name = $1', [database]))
  if (!amb) throw new Error(`nenhum ambiente com database ${database} no central`)
  const senha = gerarSenhaDoBanco()
  const cifrada = cifrarSenha(senha, aadDoAmbiente(amb.id, database)) // sem FINUP_DB_KEY: para aqui
  const r = await comAdmin(database, (q, c) => transacao(c, async () => ({
    situacao: await criarOuAtualizarPapel(q, papel, senha),
    objetos: await transferirDono(q, papel),
  })), { tlsVerificado: true })
  await comCentral(q => q('UPDATE ambientes SET db_usuario = $2, db_senha_cifrada = $3, updated_at = now() WHERE id = $1', [amb.id, papel, cifrada]))
  console.log(`✔ ${papel} ${r.situacao} · ${r.objetos} objeto(s) transferido(s), CREATE no schema public, banco com o neondb_owner · senha cifrada no central (ambiente ${amb.sigla})`)
}

async function ajustar() {
  const r = await comAdmin(database, async (q, c) => {
    const [existe] = await q('SELECT 1 FROM pg_roles WHERE rolname = $1', [papel])
    if (!existe) throw new Error(`${papel} não existe (use criar)`)
    return transacao(c, () => transferirDono(q, papel))
  })
  console.log(`✔ ${papel}: ${r} objeto(s) transferido(s), CREATE no schema public, ${database} com o neondb_owner, sem CREATE no banco`)
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
  if (ehCentral) {
    console.log('  (central) a Vercel tem de estar de volta à CENTRAL_DATABASE_URL antiga antes deste rollback')
  } else {
    await comCentral(q => q('UPDATE ambientes SET db_usuario = NULL, db_senha_cifrada = NULL, updated_at = now() WHERE database_name = $1', [database]))
    console.log('  central: credencial removida (o /api volta ao neondb_owner)')
  }
  await comAdmin(database, (q, c) => transacao(c, async () => {
    const [existe] = await q('SELECT 1 FROM pg_roles WHERE rolname = $1', [papel])
    if (!existe) return console.log(`  ${papel} não existe`)
    await q(`DO $$ BEGIN EXECUTE format('ALTER DATABASE %I OWNER TO CURRENT_USER', current_database()); END $$`)
    await q(`REASSIGN OWNED BY "${papel}" TO CURRENT_USER`) // seguro aqui: o papel só possui o próprio banco
    await q(`DO $$ BEGIN EXECUTE format('GRANT CONNECT ON DATABASE %I TO PUBLIC', current_database()); END $$`)
    await q(`DROP OWNED BY "${papel}"`)
    await q(`DROP ROLE "${papel}"`)
  }))
  if (ehCentral) {
    writeFileSync(ARQUIVO_ENV, removerLinhaEnv(lerEnvLocal(), NOME_ENV_CENTRAL_APP))
    console.log(`  ${NOME_ENV_CENTRAL_APP} removida do .env.local`)
  }
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
    console.log('  schema public:', (await q(`SELECT pg_get_userbyid(nspowner) AS dono, nspacl::text AS acl,
      has_schema_privilege($1, 'public', 'USAGE') AS usage, has_schema_privilege($1, 'public', 'CREATE') AS "create"
      FROM pg_namespace WHERE nspname = 'public'`, [papel]))[0])
    console.log('  no banco (has_database_privilege):', (await q(`SELECT has_database_privilege($1, current_database(), 'CREATE') AS "create",
      has_database_privilege($1, current_database(), 'TEMPORARY') AS temporary`, [papel]))[0])
    console.log('  extensões:', (await q('SELECT extname, pg_get_userbyid(extowner) AS dono FROM pg_extension ORDER BY 1')).map(e => `${e.extname} (${e.dono})`))
    console.log('  donos das tabelas public:', await q("SELECT tableowner, count(*)::int AS n FROM pg_tables WHERE schemaname = 'public' GROUP BY 1"))
    console.log('  CONNECT por banco (has_database_privilege):', Object.fromEntries((await q(
      `SELECT datname, has_database_privilege($1, datname, 'CONNECT') AS c FROM pg_database WHERE NOT datistemplate ORDER BY 1`, [papel])).map(x => [x.datname, x.c])))
    console.log('  ACL dos bancos:', Object.fromEntries((await q('SELECT datname, datacl::text FROM pg_database WHERE NOT datistemplate ORDER BY 1')).map(x => [x.datname, x.datacl])))
  })
  let opcoes
  if (ehCentral) {
    opcoes = opcoesDaUrl(urlCentralApp())
    if (opcoes.user !== papel) throw new Error(`${NOME_ENV_CENTRAL_APP} não é do ${papel}`)
  } else {
    const cfg = await configDoPool(database)
    if (cfg.origem !== 'papel') throw new Error(`o central não tem credencial de ${database} (origem: ${cfg.origem})`)
    opcoes = { ...cfg }
    delete opcoes.origem
  }
  console.log(`\nConexões reais como ${papel}:`)
  for (const db of [database, ...BANCOS.filter(b => b !== database)]) {
    const t = await tentarConectar(opcoes, db)
    console.log(`  ${db.padEnd(15)} ${t.ok ? `CONECTOU (current_user=${t.u}, statement_timeout=${t.st}, idle_in_tx=${t.it})` : `NEGADA [${t.codigo}] ${t.erro}`}`)
  }
  console.log(`\nO que ${papel} NÃO pode fazer (no próprio banco):`)
  const c = new pg.Client({ ...opcoes, ssl })
  await c.connect()
  try {
    for (const t of await testarLimites(c, papel)) {
      console.log(t.permitido ? `  ✖ ${t.rotulo}: PERMITIDO (não devia; desfeito)` : `  ✔ ${t.rotulo}: negado [${t.codigo}]`)
    }
  } finally {
    await c.end()
  }
}

try {
  await { criar, ajustar, fechar, verificar, rollback, reabrir }[acao]()
} catch (err) {
  console.error('✖', err.message)
  process.exitCode = 1
} finally {
  await fecharPoolDoDatabase(nomeDatabaseCentral()) // pool do central aberto pelo configDoPool
}
