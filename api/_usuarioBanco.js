import crypto from 'node:crypto'

// USUÁRIO POSTGRES PRÓPRIO DE CADA BANCO (R7, docs/grafity-2026-10.md §5.5). Cada database tem um
// usuário "<database>_app": dono das tabelas do próprio banco (com USAGE + CREATE no schema public, que o
// load.js precisa para os CREATE TABLE/INDEX IF NOT EXISTS), sem CREATEROLE, CREATEDB, REPLICATION,
// BYPASSRLS e sem herdar neon_superuser. O DATABASE fica com o neondb_owner e o papel não tem CREATE
// nele: sem isso não instala extensão (no Neon o dono do banco instala dblink) nem cria schema.
// É ele que o /api usa nas requisições (api/_conexao.js); o neondb_owner fica para provisionamento,
// exclusão e scripts.
//
// Tudo roda como neondb_owner (quem cria o papel ganha ADMIN sobre ele). O neondb_owner vira membro
// do papel (INHERIT + SET), só nesse sentido: o papel não ganha nada do neondb_owner. DDL feito pelo
// neondb_owner (migrações, estrutura) roda com SET LOCAL ROLE dentro de transação — funciona até
// atrás do PgBouncer em modo transação — e os objetos nascem com dono <database>_app.
//
// Nunca REASSIGN OWNED BY neondb_owner: ele também passaria os databases (neondb, finup_central)
// para o papel do cliente. A troca de dono é objeto a objeto, só no schema public.
//
// Senha: o Neon só aceita senha em texto no CREATE/ALTER ROLE (recusa o verificador SCRAM pronto) e
// guarda o hash. Por isso esse comando só roda numa conexão com o certificado conferido
// (_conexao.js: conexaoAdminVerificada / configTlsVerificado) e, se falhar, o erro que sobe tem só a
// mensagem do Postgres (sem a senha) e o código — nunca o SQL.

export const SUFIXO_PAPEL = '_app'
const NOME_DATABASE = /^[a-z0-9_]{1,59}$/ // 59 + "_app" = 63 (limite de identificador do Postgres)
// Limites de cada sessão do papel (as do neondb_owner — backfills, migrações — ficam sem limite).
export const LIMITES_DO_PAPEL = { statement_timeout: '25s', idle_in_transaction_session_timeout: '60s' }
export const ATRIBUTOS_DO_PAPEL = 'LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT CONNECTION LIMIT 30'

export function papelDoBanco(database) {
  if (!NOME_DATABASE.test(String(database || ''))) throw new Error(`database inválido para usuário próprio: ${database}`)
  return `${database}${SUFIXO_PAPEL}`
}

export const gerarSenhaDoBanco = () => crypto.randomBytes(32).toString('base64url')

// Literal SQL da senha (só o formato do gerarSenhaDoBanco: sem aspas nem barra). A mensagem de erro
// não repete o valor.
function literalSenha(senha) {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(String(senha ?? ''))) throw new Error('senha do banco fora do formato esperado')
  return `'${senha}'`
}

// Erro do CREATE/ALTER ROLE sem o SQL e sem a senha (mesmo que o driver ou o Neon a ecoem).
export class ErroPapel extends Error {
  constructor(papel, err, senha) {
    const msg = String(err?.message ?? 'erro desconhecido').split(senha).join('***')
    super(`papel ${papel} recusado pelo banco${err?.code ? ` [${err.code}]` : ''}: ${msg}`)
    this.name = 'ErroPapel'
    this.code = err?.code
  }
}

// Cria o papel (ou troca a senha e reafirma os atributos, se já existe), aplica os limites e torna o
// usuário atual (neondb_owner) membro dele. `q(sql, params)` = conexão como neondb_owner.
export async function criarOuAtualizarPapel(q, papel, senha) {
  const [existe] = await q('SELECT 1 FROM pg_roles WHERE rolname = $1', [papel])
  const sql = `${existe ? 'ALTER' : 'CREATE'} ROLE "${papel}" ${existe ? 'WITH ' : ''}${ATRIBUTOS_DO_PAPEL} PASSWORD ${literalSenha(senha)}`
  try {
    await q(sql)
  } catch (err) {
    // sem `cause` de propósito: o erro original pode carregar o SQL (com a senha) e iria parar em log
    throw new ErroPapel(papel, err, senha)
  }
  for (const [k, v] of Object.entries(LIMITES_DO_PAPEL)) await q(`ALTER ROLE "${papel}" SET ${k} = '${v}'`)
  await q(`GRANT "${papel}" TO CURRENT_USER WITH INHERIT TRUE, SET TRUE`)
  return existe ? 'atualizado' : 'criado'
}

// O papel passa a ser dono de tudo no schema public (tabelas, sequences, views, funções, tipos) e ganha
// USAGE + CREATE no schema. O database conectado fica (ou volta a ser) do usuário atual (neondb_owner) e o
// papel perde qualquer CREATE/TEMPORARY explícito nele. Devolve quantos objetos mudaram de dono.
export async function transferirDono(q, papel) {
  await q(`DO $$ BEGIN
    EXECUTE format('ALTER DATABASE %I OWNER TO CURRENT_USER', current_database());
    EXECUTE format('REVOKE CREATE, TEMPORARY ON DATABASE %I FROM %I', current_database(), '${papel}');
  END $$`)
  await q(`GRANT USAGE, CREATE ON SCHEMA public TO "${papel}"`)
  const objetos = await q(`
    SELECT CASE c.relkind WHEN 'S' THEN 'SEQUENCE' WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW'
                          WHEN 'f' THEN 'FOREIGN TABLE' ELSE 'TABLE' END AS tipo, 'public.' || quote_ident(c.relname) AS alvo
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'S', 'v', 'm', 'f')
       AND pg_get_userbyid(c.relowner) <> $1
       AND NOT (c.relkind = 'S' AND EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype IN ('a', 'i')))
    UNION ALL
    SELECT CASE p.prokind WHEN 'p' THEN 'PROCEDURE' WHEN 'a' THEN 'AGGREGATE' ELSE 'FUNCTION' END,
           p.oid::regprocedure::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND pg_get_userbyid(p.proowner) <> $1
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
    UNION ALL
    SELECT CASE t.typtype WHEN 'd' THEN 'DOMAIN' ELSE 'TYPE' END, t.oid::regtype::text
      FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'public' AND t.typtype IN ('e', 'd', 'c', 'r')
       AND (t.typrelid = 0 OR (SELECT relkind FROM pg_class WHERE oid = t.typrelid) = 'c')
       AND pg_get_userbyid(t.typowner) <> $1
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = t.oid AND d.deptype = 'e')`, [papel])
  for (const o of objetos) await q(`ALTER ${o.tipo} ${o.alvo} OWNER TO "${papel}"`)
  return objetos.length
}

// Só quem tem GRANT conecta no database atual: PUBLIC perde o CONNECT; o papel (se houver) e o usuário
// atual (neondb_owner, para provisionamento e scripts) ganham explicitamente.
export async function fecharConexao(q, papel = null) {
  await q(`DO $$ BEGIN
    EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', current_database());
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO CURRENT_USER', current_database());
    ${papel ? `EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), '${papel}');` : ''}
  END $$`)
}

// O que o papel NÃO pode fazer (scripts/db-usuario-ambiente.js verificar). Cada tentativa roda dentro de
// BEGIN/ROLLBACK: mesmo se for PERMITIDA, nada fica no banco. CREATE DATABASE não roda em transação:
// vai fora e, se passar, é apagado na hora. `client` = conexão COMO o papel.
export const LIMITES_A_TESTAR = [
  { rotulo: 'CREATE ROLE', sql: 'CREATE ROLE r7_teste_nao_deve_existir' },
  { rotulo: 'CREATE DATABASE', sql: 'CREATE DATABASE r7_teste_nao_deve_existir', foraDeTransacao: true, desfazer: 'DROP DATABASE IF EXISTS r7_teste_nao_deve_existir' },
  { rotulo: 'CREATE EXTENSION dblink', sql: 'CREATE EXTENSION dblink' },
  { rotulo: 'CREATE SCHEMA', sql: 'CREATE SCHEMA r7_teste_nao_deve_existir' },
  { rotulo: 'SET ROLE neondb_owner', sql: 'SET ROLE neondb_owner' },
  { rotulo: 'ALTER ROLE ... BYPASSRLS', sql: (papel) => `ALTER ROLE "${papel}" BYPASSRLS` },
]
export async function testarLimites(client, papel, limites = LIMITES_A_TESTAR) {
  const out = []
  for (const l of limites) {
    const sql = typeof l.sql === 'function' ? l.sql(papel) : l.sql
    let permitido = false
    let codigo = null
    if (l.foraDeTransacao) {
      try { await client.query(sql); permitido = true } catch (err) { codigo = err.code ?? null }
      if (permitido && l.desfazer) await client.query(l.desfazer)
    } else {
      await client.query('BEGIN')
      try { await client.query(sql); permitido = true } catch (err) { codigo = err.code ?? null }
      await client.query('ROLLBACK')
    }
    out.push({ rotulo: l.rotulo, permitido, codigo })
  }
  return out
}

// Roda `fn(q, client)` numa transação como dono das tabelas (SET LOCAL ROLE <papel>) quando o papel
// existe e o usuário atual pode assumi-lo; senão, como o usuário atual (banco ainda sem papel próprio).
export async function comoDonoDoBanco(client, database, fn) {
  const q = async (sql, params = []) => (await client.query(sql, params)).rows
  const papel = papelDoBanco(database)
  await client.query('BEGIN')
  try {
    const [pode] = await q("SELECT 1 FROM pg_roles WHERE rolname = $1 AND pg_has_role(current_user, oid, 'SET')", [papel])
    if (pode) await client.query(`SET LOCAL ROLE "${papel}"`)
    const r = await fn(q, client)
    await client.query('COMMIT')
    return r
  } catch (err) {
    try { await client.query('ROLLBACK') } catch { /* ignore */ }
    throw err
  }
}
