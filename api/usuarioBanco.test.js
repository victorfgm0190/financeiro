import crypto from 'node:crypto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { cifrarSenha, decifrarSenha, aadDoAmbiente, ErroCifra } from './_cifraDb.js'
import {
  papelDoBanco, gerarSenhaDoBanco, criarOuAtualizarPapel, transferirDono, fecharConexao, comoDonoDoBanco, ErroPapel,
  testarLimites, LIMITES_A_TESTAR,
} from './_usuarioBanco.js'
import { configDoPool, urlDoDatabase, configTlsVerificado } from './_conexao.js'

// R7 — usuário Postgres próprio por ambiente (docs/grafity-2026-10.md §5.5): cifra da senha, papel
// restrito num Postgres de verdade (PGlite) e a escolha da credencial do pool.

const env = (extra = {}) => ({ FINUP_DB_KEY: crypto.randomBytes(32).toString('base64'), ...extra })

describe('cifra da senha (AES-256-GCM)', () => {
  it('ida e volta; cada cifra é diferente (IV aleatório)', () => {
    const e = env()
    const a = cifrarSenha('s3nh@', 'amb1|cliente_x', e)
    expect(a).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/)
    expect(a).not.toContain('s3nh@')
    expect(cifrarSenha('s3nh@', 'amb1|cliente_x', e)).not.toBe(a)
    expect(decifrarSenha(a, 'amb1|cliente_x', e)).toBe('s3nh@')
  })

  it('outro ambiente, outra chave ou cifra adulterada → ErroCifra sem a senha na mensagem', () => {
    const e = env()
    const a = cifrarSenha('segredo-123', aadDoAmbiente('amb1', 'cliente_x'), e)
    expect(() => decifrarSenha(a, aadDoAmbiente('amb2', 'cliente_x'), e)).toThrow(ErroCifra)
    expect(() => decifrarSenha(a, aadDoAmbiente('amb1', 'cliente_x'), env())).toThrow(ErroCifra)
    const [v, iv, tag, c] = a.split('.')
    const adulterada = [v, iv, tag, Buffer.from('xxxx').toString('base64url') + c.slice(6)].join('.')
    try { decifrarSenha(adulterada, aadDoAmbiente('amb1', 'cliente_x'), e) } catch (err) { expect(err.message).not.toContain('segredo') }
    expect(() => decifrarSenha(adulterada, aadDoAmbiente('amb1', 'cliente_x'), e)).toThrow(ErroCifra)
  })

  it('chave ausente ou com tamanho errado → erro claro', () => {
    expect(() => cifrarSenha('x', 'a', {})).toThrow(/FINUP_DB_KEY não configurada/)
    expect(() => cifrarSenha('x', 'a', { FINUP_DB_KEY: Buffer.alloc(16).toString('base64') })).toThrow(/32 bytes/)
  })
})

describe('papel e senha', () => {
  it('nome do papel = <database>_app; nome estranho é recusado', () => {
    expect(papelDoBanco('cliente_teste1')).toBe('cliente_teste1_app')
    for (const ruim of ['', 'a-b', 'A', 'x"; DROP', 'a'.repeat(60)]) expect(() => papelDoBanco(ruim)).toThrow()
  })

  it('senha gerada só com caracteres seguros num literal SQL; fora do formato é recusada sem ecoar o valor', async () => {
    expect(gerarSenhaDoBanco()).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const q = async () => []
    for (const ruim of ["abc'; DROP ROLE x; --" + 'a'.repeat(40), 'curta', '']) {
      const err = await criarOuAtualizarPapel(q, 'cliente_x_app', ruim).catch(e => e)
      expect(err.message).toBe('senha do banco fora do formato esperado')
    }
  })

  it('erro no CREATE ROLE: sobe só mensagem (sem a senha) e código, nunca o SQL; nada no console', async () => {
    const senha = gerarSenhaDoBanco()
    const espiar = ['log', 'info', 'warn', 'error'].map(m => vi.spyOn(console, m).mockImplementation(() => {}))
    // o "driver" ecoa o SQL inteiro na mensagem e pendura o SQL no erro
    const q = async (sql) => {
      if (/^SELECT/.test(sql)) return []
      throw Object.assign(new Error(`Neon only supports being given plaintext passwords: ${sql}`), { code: 'XX000', query: sql })
    }
    const err = await criarOuAtualizarPapel(q, 'cliente_x_app', senha).catch(e => e)
    expect(err).toBeInstanceOf(ErroPapel)
    expect(err.code).toBe('XX000')
    expect(err.message).toMatch(/^papel cliente_x_app recusado pelo banco \[XX000\]: Neon only supports/)
    expect(err.cause).toBeUndefined()
    expect(err.query).toBeUndefined()
    expect(JSON.stringify({ msg: err.message, stack: err.stack, ...err })).not.toContain(senha)
    for (const s of espiar) { expect(JSON.stringify(s.mock.calls)).not.toContain(senha); s.mockRestore() }
  })
})

describe('papel restrito num Postgres de verdade (PGlite)', () => {
  let db
  const sqls = []
  const q = async (sql, params = []) => { sqls.push(sql); return (await db.query(sql, params)).rows }
  beforeEach(async () => {
    db = new PGlite()
    sqls.length = 0
    await db.exec('CREATE TABLE antes (id TEXT PRIMARY KEY); CREATE SEQUENCE seq_solta; CREATE VIEW v_antes AS SELECT id FROM antes')
  }, 30_000)

  it('cria restrito, com limites, dono de tudo; senha só no CREATE ROLE e guardada como SCRAM; repetir troca a senha', async () => {
    const senha = gerarSenhaDoBanco()
    expect(await criarOuAtualizarPapel(q, 'cliente_x_app', senha)).toBe('criado')
    expect(await transferirDono(q, 'cliente_x_app')).toBe(3)
    await fecharConexao(q, 'cliente_x_app')
    expect(sqls.filter(s => s.includes(senha))).toEqual([expect.stringMatching(/^CREATE ROLE "cliente_x_app" .* PASSWORD '/)])
    const [{ rolpassword }] = await q("SELECT rolpassword FROM pg_authid WHERE rolname = 'cliente_x_app'")
    expect(rolpassword).toMatch(/^SCRAM-SHA-256\$/)
    expect(rolpassword).not.toContain(senha)

    const [r] = await q("SELECT rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls, rolinherit, rolconnlimit, rolconfig FROM pg_roles WHERE rolname = 'cliente_x_app'")
    expect(r).toMatchObject({ rolsuper: false, rolcreaterole: false, rolcreatedb: false, rolreplication: false, rolbypassrls: false, rolinherit: false, rolconnlimit: 30 })
    expect(r.rolconfig.sort()).toEqual(['idle_in_transaction_session_timeout=60s', 'statement_timeout=25s'])
    expect(await q("SELECT relname, pg_get_userbyid(relowner) AS dono FROM pg_class WHERE relname IN ('antes', 'seq_solta', 'v_antes') ORDER BY 1"))
      .toEqual([{ relname: 'antes', dono: 'cliente_x_app' }, { relname: 'seq_solta', dono: 'cliente_x_app' }, { relname: 'v_antes', dono: 'cliente_x_app' }])
    // o banco fica com o usuário atual (neondb_owner em produção); o papel: CREATE só no schema public
    expect((await q('SELECT pg_get_userbyid(datdba) AS d FROM pg_database WHERE datname = current_database()'))[0].d).toBe('postgres')
    expect((await q(`SELECT has_database_privilege('cliente_x_app', current_database(), 'CREATE') AS db,
      has_schema_privilege('cliente_x_app', 'public', 'USAGE') AS u, has_schema_privilege('cliente_x_app', 'public', 'CREATE') AS c`))[0])
      .toEqual({ db: false, u: true, c: true })
    // o usuário atual (neondb_owner em produção) é membro do papel com INHERIT e SET — não o contrário
    expect(await q("SELECT m.inherit_option, m.set_option FROM pg_auth_members m JOIN pg_roles g ON g.oid = m.roleid WHERE g.rolname = 'cliente_x_app'"))
      .toEqual([{ inherit_option: true, set_option: true }])
    expect(await criarOuAtualizarPapel(q, 'cliente_x_app', gerarSenhaDoBanco())).toBe('atualizado')
    expect((await q("SELECT rolpassword FROM pg_authid WHERE rolname = 'cliente_x_app'"))[0].rolpassword).not.toBe(rolpassword)
    expect(await transferirDono(q, 'cliente_x_app')).toBe(0)
  })

  it('comoDonoDoBanco: com papel → objetos nascem dele (SET LOCAL, só na transação); sem papel → usuário atual', async () => {
    const client = { query: (sql, p) => db.query(sql, p) }
    await comoDonoDoBanco(client, 'cliente_y', (cq) => cq('CREATE TABLE sem_papel (id INT)'))
    await criarOuAtualizarPapel(q, 'cliente_y_app', 'x'.repeat(43))
    await transferirDono(q, 'cliente_y_app') // sem o GRANT CREATE no schema o papel nem cria em public (PG 15+)
    await comoDonoDoBanco(client, 'cliente_y', (cq) => cq('CREATE TABLE com_papel (id INT)'))
    expect(await q("SELECT tablename, tableowner FROM pg_tables WHERE tablename IN ('sem_papel', 'com_papel') ORDER BY 1"))
      .toEqual([{ tablename: 'com_papel', tableowner: 'cliente_y_app' }, { tablename: 'sem_papel', tableowner: 'cliente_y_app' }])
    expect((await q('SELECT current_user AS u'))[0].u).toBe('postgres') // SET LOCAL não vaza da transação
    await expect(comoDonoDoBanco(client, 'cliente_y', (cq) => cq('CREATE TABLE com_erro (id INT); SELECT 1/0'))).rejects.toThrow()
    expect(await q("SELECT 1 FROM pg_tables WHERE tablename = 'com_erro'")).toEqual([])
  })
})

describe('desenho: banco do admin, tabelas do papel (o que o load.js roda)', () => {
  it('banco de desenho antigo (dono = papel) volta ao admin; papel roda o DDL do load.js e não cria schema', async () => {
    const db = new PGlite()
    const q = async (sql, params = []) => (await db.query(sql, params)).rows
    await db.exec('CREATE TABLE lancamentos (id TEXT PRIMARY KEY); CREATE TABLE atalhos (id SERIAL PRIMARY KEY)')
    await criarOuAtualizarPapel(q, 'cliente_z_app', gerarSenhaDoBanco())
    await q("DO $$ BEGIN EXECUTE format('ALTER DATABASE %I OWNER TO cliente_z_app', current_database()); END $$") // desenho antigo
    await transferirDono(q, 'cliente_z_app')
    expect((await q('SELECT pg_get_userbyid(datdba) AS d FROM pg_database WHERE datname = current_database()'))[0].d).toBe('postgres')
    expect((await q("SELECT has_database_privilege('cliente_z_app', current_database(), 'CREATE') AS c"))[0].c).toBe(false)

    const comoPapel = async (sql) => { await db.exec(`SET ROLE cliente_z_app; ${sql}; RESET ROLE`) }
    // o mesmo tipo de DDL do load.js / _bem.js / atalhos.js
    await comoPapel('ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS serie_id TEXT')
    await comoPapel('CREATE INDEX IF NOT EXISTS idx_lancamentos_serie_id ON lancamentos (serie_id) WHERE serie_id IS NOT NULL')
    await comoPapel('CREATE TABLE IF NOT EXISTS atalhos (id SERIAL PRIMARY KEY)')
    await comoPapel('CREATE TABLE IF NOT EXISTS favorecido_alias (id SERIAL PRIMARY KEY, nome TEXT)')
    await comoPapel("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_x') THEN ALTER TABLE lancamentos ADD CONSTRAINT ck_x CHECK (id <> ''); END IF; END $$")
    await comoPapel('ALTER TABLE lancamentos ALTER COLUMN serie_id TYPE TEXT USING serie_id::text')
    expect((await q("SELECT tableowner FROM pg_tables WHERE tablename = 'favorecido_alias'"))[0].tableowner).toBe('cliente_z_app')
    await db.exec('RESET ROLE')
    await expect(comoPapel('CREATE SCHEMA r7_x')).rejects.toThrow(/permission denied for database/)
    await db.exec('RESET ROLE')
  }, 30_000)
})

describe('testarLimites (verificar): nada fica para trás, nem quando a operação é permitida', () => {
  it('como superusuário (tudo permitido) → relata PERMITIDO e desfaz; como o papel → negado', async () => {
    const db = new PGlite()
    const client = { query: (sql, p) => db.query(sql, p) }
    await db.exec('CREATE ROLE cliente_w_app NOSUPERUSER NOINHERIT')
    const limites = [
      { rotulo: 'CREATE ROLE', sql: 'CREATE ROLE r7_teste_nao_deve_existir' },
      { rotulo: 'CREATE SCHEMA', sql: 'CREATE SCHEMA r7_teste_nao_deve_existir' },
      { rotulo: 'CREATE TABLE', sql: 'CREATE TABLE r7_teste_nao_deve_existir (id INT)' },
      { rotulo: 'ALTER ROLE', sql: (papel) => `ALTER ROLE "${papel}" BYPASSRLS` },
    ]
    const sobras = async () => (await db.query(`SELECT
      (SELECT count(*)::int FROM pg_roles WHERE rolname = 'r7_teste_nao_deve_existir') AS papel,
      (SELECT count(*)::int FROM pg_namespace WHERE nspname = 'r7_teste_nao_deve_existir') AS schema,
      (SELECT count(*)::int FROM pg_tables WHERE tablename = 'r7_teste_nao_deve_existir') AS tabela,
      (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'cliente_w_app') AS bypass`)).rows[0]

    const comoSuper = await testarLimites(client, 'cliente_w_app', limites)
    expect(comoSuper.map(t => t.permitido)).toEqual([true, true, true, true])
    expect(await sobras()).toEqual({ papel: 0, schema: 0, tabela: 0, bypass: false })

    await db.exec('SET ROLE cliente_w_app')
    const comoPapel = await testarLimites(client, 'cliente_w_app', limites)
    await db.exec('RESET ROLE')
    expect(comoPapel.map(t => [t.permitido, t.codigo])).toEqual([[false, '42501'], [false, '42501'], [false, '42501'], [false, '42501']])
    expect(await sobras()).toEqual({ papel: 0, schema: 0, tabela: 0, bypass: false })
  }, 30_000)

  it('fora de transação (CREATE DATABASE): se passar, roda o desfazer', async () => {
    const feitas = []
    const client = { query: async (sql) => { feitas.push(sql); return { rows: [] } } }
    const [t] = await testarLimites(client, 'x_app', [{ rotulo: 'CREATE DATABASE', sql: 'CREATE DATABASE r7', foraDeTransacao: true, desfazer: 'DROP DATABASE IF EXISTS r7' }])
    expect(t).toEqual({ rotulo: 'CREATE DATABASE', permitido: true, codigo: null })
    expect(feitas).toEqual(['CREATE DATABASE r7', 'DROP DATABASE IF EXISTS r7'])
  })

  it('a lista padrão cobre CREATE ROLE/DATABASE/EXTENSION/SCHEMA, SET ROLE e BYPASSRLS; só CREATE DATABASE fora de transação', () => {
    expect(LIMITES_A_TESTAR.map(l => l.rotulo)).toEqual(['CREATE ROLE', 'CREATE DATABASE', 'CREATE EXTENSION dblink', 'CREATE SCHEMA', 'SET ROLE neondb_owner', 'ALTER ROLE ... BYPASSRLS'])
    expect(LIMITES_A_TESTAR.filter(l => l.foraDeTransacao).map(l => l.rotulo)).toEqual(['CREATE DATABASE'])
  })
})

describe('credencial do pool (api/_conexao.js)', () => {
  const ADMIN = 'postgresql://neondb_owner:adm@ep-x.neon.tech/finup_central?sslmode=require'
  const base = { CENTRAL_DATABASE_URL: ADMIN }

  it('ambiente com usuário próprio → usuário e senha decifrada, mesmo host do admin', async () => {
    const e = env({ ...base, ADMIN_DATABASE_URL: ADMIN })
    const cifrada = cifrarSenha('senha-do-papel', aadDoAmbiente('amb1', 'cliente_x'), e)
    const cfg = await configDoPool('cliente_x', { env: e, buscarCredencial: async () => ({ id: 'amb1', db_usuario: 'cliente_x_app', db_senha_cifrada: cifrada }) })
    expect(cfg).toEqual({ origem: 'papel', host: 'ep-x.neon.tech', port: 5432, database: 'cliente_x', user: 'cliente_x_app', password: 'senha-do-papel' })
  })

  it('sem usuário próprio → fallback no neondb_owner (ADMIN_DATABASE_URL, ou a central enquanto ela não existe)', async () => {
    const semCred = { buscarCredencial: async () => ({ id: 'amb1', db_usuario: null, db_senha_cifrada: null }) }
    expect(await configDoPool('cliente_x', { env: base, ...semCred }))
      .toEqual({ origem: 'fallback', connectionString: 'postgresql://neondb_owner:adm@ep-x.neon.tech/cliente_x?sslmode=require' })
    const outra = 'postgresql://neondb_owner:adm@ep-y.neon.tech/neondb'
    expect((await configDoPool('cliente_x', { env: { ...base, ADMIN_DATABASE_URL: outra }, ...semCred })).connectionString)
      .toBe('postgresql://neondb_owner:adm@ep-y.neon.tech/cliente_x')
    await expect(configDoPool('cliente_x', { env: { ...base, FINUP_DB_ESTRITO: 'true' }, ...semCred })).rejects.toThrow(/FINUP_DB_ESTRITO/)
  })

  it('o central usa a CENTRAL_DATABASE_URL, sem consultar credencial', async () => {
    const cfg = await configDoPool('finup_central', { env: base, buscarCredencial: async () => { throw new Error('não devia') } })
    expect(cfg).toEqual({ origem: 'central', connectionString: ADMIN })
  })

  it('cifra de outro ambiente não serve (troca de linha no central)', async () => {
    const e = env(base)
    const cifrada = cifrarSenha('p', aadDoAmbiente('amb_outro', 'cliente_outro'), e)
    await expect(configDoPool('cliente_x', { env: e, buscarCredencial: async () => ({ id: 'amb1', db_usuario: 'cliente_x_app', db_senha_cifrada: cifrada }) }))
      .rejects.toThrow(ErroCifra)
  })

  it('TLS verificado (caminho do CREATE ROLE): sslmode=verify-full na URL e rejectUnauthorized', () => {
    const cfg = configTlsVerificado(urlDoDatabase('cliente_x', base))
    expect(cfg.ssl).toEqual({ rejectUnauthorized: true })
    const u = new URL(cfg.connectionString)
    expect(u.searchParams.get('sslmode')).toBe('verify-full')
    expect(u.pathname).toBe('/cliente_x')
    expect(configTlsVerificado('postgresql://a:b@h/x').connectionString).toBe('postgresql://a:b@h/x?sslmode=verify-full')
  })

  it('urlDoDatabase usa o admin e recusa nome estranho', () => {
    expect(urlDoDatabase('cliente_x', base)).toBe('postgresql://neondb_owner:adm@ep-x.neon.tech/cliente_x?sslmode=require')
    expect(() => urlDoDatabase('x/../y', base)).toThrow()
  })
})
