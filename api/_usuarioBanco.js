import crypto from 'node:crypto'

// USUÁRIO POSTGRES PRÓPRIO DE CADA BANCO (R7, docs/grafity-2026-10.md §5.5). Cada database tem um
// usuário "<database>_app": dono só do próprio banco e das suas tabelas, sem CREATEROLE, CREATEDB,
// REPLICATION, BYPASSRLS e sem herdar neon_superuser. É ele que o /api usa nas requisições
// (api/_conexao.js); o neondb_owner fica para provisionamento, exclusão e scripts.
//
// Tudo roda como neondb_owner (quem cria o papel ganha ADMIN sobre ele). O neondb_owner vira membro
// do papel (INHERIT + SET), só nesse sentido: o papel não ganha nada do neondb_owner. DDL feito pelo
// neondb_owner (migrações, estrutura) roda com SET LOCAL ROLE dentro de transação — funciona até
// atrás do PgBouncer em modo transação — e os objetos nascem com dono <database>_app.
//
// Nunca REASSIGN OWNED BY neondb_owner: ele também passaria os databases (neondb, finup_central)
// para o papel do cliente. A troca de dono é objeto a objeto, só no schema public.
//
// A senha nunca aparece no SQL: o CREATE/ALTER ROLE recebe o verificador SCRAM-SHA-256 calculado aqui.

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

// Verificador no formato do pg_authid (RFC 5802/7677), o mesmo que o Postgres gera com
// password_encryption = scram-sha-256.
export function verificadorScram(senha, { salt = crypto.randomBytes(16), iteracoes = 4096 } = {}) {
  const salgada = crypto.pbkdf2Sync(String(senha).normalize('NFKC'), salt, iteracoes, 32, 'sha256')
  const hmac = (k, txt) => crypto.createHmac('sha256', k).update(txt).digest()
  const storedKey = crypto.createHash('sha256').update(hmac(salgada, 'Client Key')).digest()
  const serverKey = hmac(salgada, 'Server Key')
  return `SCRAM-SHA-256$${iteracoes}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`
}

// Literal SQL de um verificador (só base64 e "$:"; a regex garante que não há aspas).
function literalVerificador(v) {
  if (!/^SCRAM-SHA-256\$\d+:[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/.test(v)) throw new Error('verificador SCRAM inválido')
  return `'${v}'`
}

// Cria o papel (ou troca a senha e reafirma os atributos, se já existe), aplica os limites e torna o
// usuário atual (neondb_owner) membro dele. `q(sql, params)` = conexão como neondb_owner.
export async function criarOuAtualizarPapel(q, papel, verificador) {
  const [existe] = await q('SELECT 1 FROM pg_roles WHERE rolname = $1', [papel])
  await q(`${existe ? 'ALTER' : 'CREATE'} ROLE "${papel}" ${existe ? 'WITH ' : ''}${ATRIBUTOS_DO_PAPEL} PASSWORD ${literalVerificador(verificador)}`)
  for (const [k, v] of Object.entries(LIMITES_DO_PAPEL)) await q(`ALTER ROLE "${papel}" SET ${k} = '${v}'`)
  await q(`GRANT "${papel}" TO CURRENT_USER WITH INHERIT TRUE, SET TRUE`)
  return existe ? 'atualizado' : 'criado'
}

// O papel passa a ser dono do database conectado e de tudo no schema public (tabelas, sequences,
// views, funções, tipos). Devolve quantos objetos mudaram de dono.
export async function transferirDono(q, papel) {
  await q(`DO $$ BEGIN EXECUTE format('ALTER DATABASE %I OWNER TO %I', current_database(), '${papel}'); END $$`)
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

// Roda `fn(q, client)` numa transação como dono do banco (SET LOCAL ROLE <papel>) quando o papel
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
