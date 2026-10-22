import crypto from 'node:crypto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { cifrarSenha, decifrarSenha, aadDoAmbiente, ErroCifra } from './_cifraDb.js'
import {
  papelDoBanco, gerarSenhaDoBanco, criarOuAtualizarPapel, transferirDono, fecharConexao, comoDonoDoBanco, ErroPapel,
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
    expect((await q('SELECT pg_get_userbyid(datdba) AS d FROM pg_database WHERE datname = current_database()'))[0].d).toBe('cliente_x_app')
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
    await transferirDono(q, 'cliente_y_app') // sem ser dono do banco o papel nem cria em public (PG 15+)
    await comoDonoDoBanco(client, 'cliente_y', (cq) => cq('CREATE TABLE com_papel (id INT)'))
    expect(await q("SELECT tablename, tableowner FROM pg_tables WHERE tablename IN ('sem_papel', 'com_papel') ORDER BY 1"))
      .toEqual([{ tablename: 'com_papel', tableowner: 'cliente_y_app' }, { tablename: 'sem_papel', tableowner: 'cliente_y_app' }])
    expect((await q('SELECT current_user AS u'))[0].u).toBe('postgres') // SET LOCAL não vaza da transação
    await expect(comoDonoDoBanco(client, 'cliente_y', (cq) => cq('CREATE TABLE com_erro (id INT); SELECT 1/0'))).rejects.toThrow()
    expect(await q("SELECT 1 FROM pg_tables WHERE tablename = 'com_erro'")).toEqual([])
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
