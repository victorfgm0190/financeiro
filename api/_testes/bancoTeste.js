import { afterAll, expect } from 'vitest'
import { PGlite } from '@electric-sql/pglite'

// SÓ PARA TESTES (pasta com "_": a Vercel não publica como rota). Abrir um PGlite custa segundos, então
// cada arquivo de teste abre o banco uma vez: `bancoDoArquivo(criar)` aplica o schema e os dados iniciais na
// primeira chamada e, nas seguintes, limpa tudo com TRUNCATE e devolve os dados iniciais.
//
// Isolamento: cada teste recebe o banco como `criar` o deixou. Se um teste mudou a ESTRUTURA (ALTER, DROP,
// tabela criada por uma rota), a assinatura muda e o schema é refeito na mesma instância; se ainda assim
// não ficar idêntico (papel, permissão no banco), o banco é reaberto do zero. Duas chamadas iguais no mesmo
// teste recebem bancos diferentes. Fora de um teste (beforeAll), cada chamada abre um banco novo.

const abertos = new Set()
const reservas = new Map()      // chave → [{ db, assinatura, sementes, sequencias }]
const usoNoTeste = new Map()    // chave → { teste, n }

// Banco sem reaproveitamento (o teste precisa de um Postgres realmente vazio). Fechado no fim do arquivo.
export function abrirPGlite() {
  const db = new PGlite()
  abertos.add(db)
  return db
}

// Catálogo direto (pg_attribute, pg_class): as visões de information_schema custam dez vezes mais.
const SQL_ASSINATURA = `
  WITH esquemas AS (SELECT oid, nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg\\_%' AND nspname <> 'information_schema')
  SELECT md5(COALESCE(string_agg(x, '|' ORDER BY x), '')) AS a FROM (
    SELECT 'c:' || c.oid::regclass::text || '.' || a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text || ':' || COALESCE(pg_get_expr(d.adbin, d.adrelid), '') AS x
      FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN esquemas e ON e.oid = c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
     WHERE a.attnum > 0 AND NOT a.attisdropped
    UNION ALL SELECT 'o:' || c.oid::regclass::text || ':' || c.relkind::text || ':' || c.relowner::regrole::text || ':' || COALESCE(c.relacl::text, '') || ':' || c.relrowsecurity::text
      FROM pg_class c JOIN esquemas e ON e.oid = c.relnamespace
    UNION ALL SELECT 'k:' || k.conrelid::regclass::text || '.' || k.conname || ':' || pg_get_constraintdef(k.oid) FROM pg_constraint k JOIN esquemas e ON e.oid = k.connamespace
    UNION ALL SELECT 't:' || tgrelid::regclass::text || '.' || tgname || ':' || tgenabled::text FROM pg_trigger WHERE NOT tgisinternal
    UNION ALL SELECT 'f:' || p.proname || ':' || md5(p.prosrc) || ':' || COALESCE(p.proacl::text, '') FROM pg_proc p JOIN esquemas e ON e.oid = p.pronamespace
    UNION ALL SELECT 'r:' || rolname || ':' || rolcanlogin::text || ':' || rolsuper::text FROM pg_roles WHERE rolname NOT LIKE 'pg\\_%'
    UNION ALL SELECT 'n:' || e.nspname || ':' || n.nspowner::regrole::text || ':' || COALESCE(n.nspacl::text, '') FROM pg_namespace n JOIN esquemas e ON e.oid = n.oid
    UNION ALL SELECT 'd:' || datname || ':' || COALESCE(datacl::text, '') FROM pg_database
    UNION ALL SELECT 'p:' || defaclrole::regrole::text || ':' || COALESCE(defaclacl::text, '') FROM pg_default_acl
  ) s`

const assinaturaDe = async (db) => (await db.query(SQL_ASSINATURA)).rows[0].a
const nomeSql = (n) => `"${String(n).replace(/"/g, '""')}"`

const tabelasDe = async (db) => (await db.query(
  `SELECT schemaname AS s, tablename AS t FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema') ORDER BY 1, 2`,
)).rows.map(r => `${nomeSql(r.s)}.${nomeSql(r.t)}`)

const sequenciasDe = async (db) => (await db.query(
  `SELECT schemaname AS s, sequencename AS n, last_value AS v FROM pg_sequences WHERE schemaname NOT IN ('pg_catalog', 'information_schema')`,
)).rows.map(r => ({ nome: `${nomeSql(r.s)}.${nomeSql(r.n)}`, valor: r.v }))

// O que `criar` deixou gravado: só as tabelas com linhas, com as colunas que aceitam INSERT.
async function lerSementes(db) {
  const sementes = []
  for (const tabela of await tabelasDe(db)) {
    const { rows } = await db.query(`SELECT COALESCE(json_agg(x), '[]'::json)::text AS j FROM ${tabela} x`)
    if (rows[0].j === '[]') continue
    const cols = (await db.query(
      `SELECT a.attname AS c FROM pg_attribute a
        WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''`,
      [tabela],
    )).rows.map(r => nomeSql(r.c)).join(', ')
    sementes.push({ tabela, cols, json: rows[0].j })
  }
  return sementes
}

async function criarReserva(criar) {
  const db = abrirPGlite()
  await db.query('SELECT 1')
  await criar(db)
  return { db, assinatura: await assinaturaDe(db), sementes: await lerSementes(db), sequencias: await sequenciasDe(db) }
}

// Apaga os schemas e aplica `criar` de novo, sem o custo de abrir outro PGlite.
async function refazerSchema(db, criar) {
  const { rows } = await db.query(`SELECT nspname AS n FROM pg_namespace WHERE nspname NOT LIKE 'pg\\_%' AND nspname <> 'information_schema'`)
  for (const r of rows) await db.exec(`DROP SCHEMA ${nomeSql(r.n)} CASCADE`)
  await db.exec('CREATE SCHEMA public; GRANT USAGE ON SCHEMA public TO PUBLIC')
  await criar(db)
}

// TRUNCATE só no que tem linhas: nas 63 tabelas de uma vez custa meio segundo.
async function comLinhas(db) {
  const tabelas = await tabelasDe(db)
  if (!tabelas.length) return []
  const sql = tabelas.map(t => `SELECT '${t.replace(/'/g, "''")}' AS t WHERE EXISTS (SELECT 1 FROM ${t})`).join(' UNION ALL ')
  return (await db.query(sql)).rows.map(r => r.t)
}

async function limpar({ db, sementes, sequencias }) {
  const sujas = await comLinhas(db)
  if (sujas.length) await db.exec(`TRUNCATE ${sujas.join(', ')} RESTART IDENTITY CASCADE`)
  if (sementes.length) {
    // Com gatilhos e chaves desligados: as linhas voltam exatamente como estavam, em qualquer ordem.
    await db.exec("SET session_replication_role = 'replica'")
    for (const s of sementes) {
      await db.query(`INSERT INTO ${s.tabela} (${s.cols}) SELECT ${s.cols} FROM json_populate_recordset(null::${s.tabela}, $1::json)`, [s.json])
    }
    await db.exec("SET session_replication_role = 'origin'")
  }
  for (const q of sequencias) {
    if (q.valor != null) await db.query('SELECT setval($1::regclass, $2)', [q.nome, q.valor])
  }
}

// Fecha o que um teste possa ter deixado aberto ou trocado na sessão.
async function normalizarSessao(db) {
  await db.exec('ROLLBACK').catch(() => {})
  await db.exec("RESET ALL; SET ROLE NONE; SET session_replication_role = 'origin'")
}

// `criar(db)`: aplica o schema e os dados iniciais. `chave`: separa bancos diferentes criados pela mesma
// função (por padrão, o próprio texto de `criar`).
export async function bancoDoArquivo(criar, chave = criar.toString()) {
  const teste = expect.getState().currentTestName
  if (!teste) return (await criarReserva(criar)).db

  const uso = usoNoTeste.get(chave)
  const n = uso?.teste === teste ? uso.n + 1 : 0
  usoNoTeste.set(chave, { teste, n })
  if (!reservas.has(chave)) reservas.set(chave, [])
  const lista = reservas.get(chave)

  const reserva = lista[n]
  if (!reserva) {
    const nova = await criarReserva(criar)
    lista[n] = nova
    return nova.db
  }
  await normalizarSessao(reserva.db)
  if ((await assinaturaDe(reserva.db)) === reserva.assinatura) {
    await limpar(reserva)
    return reserva.db
  }
  const refeito = await refazerSchema(reserva.db, criar).then(() => assinaturaDe(reserva.db)).catch(() => null)
  if (refeito === reserva.assinatura) return reserva.db
  await reserva.db.close().catch(() => {})
  abertos.delete(reserva.db)
  const nova = await criarReserva(criar)
  lista[n] = nova
  return nova.db
}

afterAll(async () => {
  for (const db of abertos) await db.close().catch(() => {})
  abertos.clear()
  reservas.clear()
  usoNoTeste.clear()
}, 60_000)
