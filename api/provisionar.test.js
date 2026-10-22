import process from 'node:process'
import crypto from 'node:crypto'
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import jwt from 'jsonwebtoken'
import { SQL_CENTRAL, usarBancos, poolPGlite } from './_testes/pglite.js'
import { _definirFabricaDePool } from './_conexao.js'

// PROVISIONAMENTO de um cliente (Etapa 2, Parte B) com o _db.js de verdade: um PGlite por database
// (central, o 'vm' com dados "do Victor" e o banco do cliente, que só passa a existir quando a API
// do Neon — simulada — o cria). E-mail = fetch do Resend interceptado.

const { default: clientesHandler } = await import('./clientes.js')
const { default: senhaHandler } = await import('./senha.js')
const { default: authHandler } = await import('./auth.js')
const { default: loadHandler } = await import('./load.js')
const { default: pingHandler } = await import('./ping.js')
const { default: syncHandler } = await import('./sync.js')
const { default: mappingHandler } = await import('./account-mapping.js')
const { PASSOS } = await import('./_provisionar.js')
const { KIT_CATEGORIAS, KIT_GRUPOS_CONTA, KIT_GRUPOS_GERENCIAIS, KIT_TIPOS_DOCUMENTO, KIT_CENTROS_DE_CUSTO, KIT_REGRAS_ITENS, rodapeDoCliente } = await import('./_kitBasico.js')
const { ESTRUTURA_BASE, MIGRACOES } = await import('./_sqlEmbutido.js')

const SECRET = 'segredo-de-teste'
const CHAVE_DB = crypto.randomBytes(32).toString('base64')
const raiz = fileURLToPath(new URL('../supabase/', import.meta.url))
const ler = (f) => readFileSync(f, 'utf-8').replace(/\r\n/g, '\n') // igual ao scripts/gerar-sql-embutido.js
const ARQ_ESTRUTURA = ler(raiz + 'estrutura_base.sql')
const ARQ_MIGRACOES = readdirSync(raiz + 'migrations').filter(f => f.endsWith('.sql')).sort()
  .map(nome => ({ nome, sql: ler(raiz + 'migrations/' + nome) }))
const SQL_BANCO_NOVO = ARQ_ESTRUTURA + '\n' + ARQ_MIGRACOES.map(m => m.sql).join('\n')

const bancos = {}
const qde = (nome) => async (sql, params = []) => (await bancos[nome].query(sql, params)).rows
// Databases que "existem" no Neon simulado (o vm e o central sempre existem; os de cliente só depois do POST).
const noNeon = new Set()

// Foto de um banco: contagem + md5 do conteúdo de cada tabela.
async function foto(nome) {
  const q = qde(nome)
  const tabs = (await q("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1")).map(r => r.table_name)
  const out = {}
  for (const t of tabs) {
    const [r] = await q(`SELECT count(*)::int AS n, md5(coalesce(string_agg(row_to_json(x)::text, '|' ORDER BY row_to_json(x)::text), '')) AS h FROM "${t}" x`)
    out[t] = r
  }
  return out
}

beforeAll(async () => {
  bancos.central = new PGlite()
  await bancos.central.exec(SQL_CENTRAL)
  await bancos.central.exec("UPDATE ambientes SET database_name = 'banco_vm' WHERE sigla = 'vm'")
  // O 'vm', com dados que são SÓ do Victor (nada disso pode aparecer no cliente).
  bancos.banco_vm = new PGlite()
  await bancos.banco_vm.exec(SQL_BANCO_NOVO)
  await bancos.banco_vm.exec(`
    INSERT INTO organizacoes (id, nome) VALUES ('org1', 'Victor');
    INSERT INTO usuarios (id, username, nome, email, senha_hash, nivel) VALUES ('u-v', 'vmoreira', 'Victor', 'v@v.com', 'x', 'admin');
    INSERT INTO membros (usuario_id, organizacao_id, papel) VALUES ('u-v', 'org1', 'admin');
    INSERT INTO configuracoes (id, financial_month_start_day) VALUES (1, 15);
    INSERT INTO categorias (id, name, type) VALUES ('cat_esc_hon', 'Honorarios Emerson/Piratininga', 'expense'), ('cat_1', 'Alimentação', 'expense');
    INSERT INTO reservas_funcoes (id, number, name) VALUES ('g2', '2', 'PharmaLog'), ('g3', '3', 'Contas Anuais');
    INSERT INTO account_mapping (grupo, nome_finup, nome_dindin) VALUES ('Itau Cofrinhos', 'Pharma', '5. 05 PHARMA LOG');
    INSERT INTO contas (id, name, type, balance) VALUES ('c1', 'Consórcio HS', 'investment', 0);`)
  // Bancos de cliente: só "existem" depois que a API do Neon (simulada) os cria.
  for (const nome of ['cliente_mm', 'cliente_zz', 'cliente_ww', 'cliente_kk', 'cliente_jj', 'cliente_hh', 'cliente_ll']) bancos[nome] = new PGlite()
}, 180_000) // vários PGlite + migrações: com a suíte inteira em paralelo passa de 60 s

// ─── API do Neon + Resend simulados ─────────────────────────────────────────────────────────────
const neon = { chamadas: [], falharCriacao: 0, falharExclusao: 0, antesDoDelete: null }
let emails = []
let falharEmail = 0
const resp = (status, json) => ({ ok: status < 300, status, json: async () => json })
async function fetchFalso(url, init = {}) {
  const metodo = init.method || 'GET'
  if (url.startsWith('https://api.resend.com')) {
    if (falharEmail > 0) { falharEmail--; return resp(500, { message: 'falha simulada' }) }
    emails.push(JSON.parse(init.body))
    return resp(200, { id: `re-${emails.length}` })
  }
  neon.chamadas.push(`${metodo} ${url.replace('https://console.neon.tech/api/v2', '')}`)
  const db = decodeURIComponent(url.match(/\/databases\/([^/?]+)$/)?.[1] || '')
  if (metodo === 'GET' && db) return noNeon.has(db) ? resp(200, { database: { name: db } }) : resp(404, { message: 'not found' })
  if (metodo === 'POST' && url.endsWith('/databases')) {
    if (neon.falharCriacao > 0) { neon.falharCriacao--; return resp(500, { message: 'instabilidade simulada' }) }
    const { database } = JSON.parse(init.body)
    expect(database.owner_name).toBe('neondb_owner')
    expect(database.name).toMatch(/^cliente_[a-z0-9]+$/)
    noNeon.add(database.name)
    return resp(201, { database, operations: [{ id: 'op-1', action: 'create_database', status: 'running' }] })
  }
  if (metodo === 'DELETE' && db) {
    if (neon.falharExclusao > 0) { neon.falharExclusao--; return resp(500, { message: 'falha simulada ao excluir' }) }
    if (!noNeon.has(db)) return resp(404, { message: 'not found' })
    if (neon.antesDoDelete) await neon.antesDoDelete(db)
    noNeon.delete(db)
    return resp(200, { database: { name: db }, operations: [{ id: 'op-2', action: 'delete_database', status: 'running' }] })
  }
  if (metodo === 'GET' && /\/operations\/op-\d$/.test(url)) return resp(200, { operation: { status: 'finished' } })
  return resp(404, { message: `rota simulada inexistente: ${metodo} ${url}` })
}

let envOriginal
beforeEach(() => {
  envOriginal = { ...process.env }
  Object.assign(process.env, {
    JWT_SECRET: SECRET, PLATAFORMA_ADMIN: 'vmoreira', RESEND_API_KEY: 're_teste', EMAIL_FROM: 'Finup <nao-responda@finup.app.br>',
    NEON_API_KEY: 'neon-chave', NEON_PROJECT_ID: 'proj-1', NEON_BRANCH_ID: 'br-1', FINUP_DB_KEY: CHAVE_DB,
  })
  delete process.env.ALLOW_ENV_ADMIN
  // Banco que não existe responde como o Postgres (3D000).
  const doNeon = (nome) => () => { if (!noNeon.has(nome)) throw Object.assign(new Error(`database ${nome} não existe no Neon`), { code: '3D000' }); return bancos[nome] }
  usarBancos({
    central: bancos.central, banco_vm: bancos.banco_vm,
    cliente_mm: doNeon('cliente_mm'), cliente_zz: doNeon('cliente_zz'), cliente_ww: doNeon('cliente_ww'),
    cliente_kk: doNeon('cliente_kk'), cliente_jj: doNeon('cliente_jj'), cliente_hh: doNeon('cliente_hh'),
    cliente_ll: doNeon('cliente_ll'),
  })
  vi.stubGlobal('fetch', vi.fn(fetchFalso))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { process.env = envOriginal; neon.antesDoDelete = null; vi.unstubAllGlobals(); vi.restoreAllMocks() })
afterAll(() => { _definirFabricaDePool(null) })

function resposta() {
  return {
    statusCode: 200, body: undefined, headers: {},
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
    end() { return this },
    setHeader(k, v) { this.headers[k] = v },
  }
}
async function chamar(handler, { method = 'POST', body, url = '/api/x', host = 'www.finup.app.br', auth } = {}) {
  const res = resposta()
  const headers = { host, 'x-forwarded-for': '10.1.1.1' }
  if (auth) headers.authorization = `Bearer ${auth}`
  await handler({ method, body, url, headers, query: Object.fromEntries(new URL(url, 'http://x').searchParams) }, res)
  return res
}
const idVm = async () => (await qde('central')("SELECT id FROM ambientes WHERE sigla = 'vm'"))[0].id
const tokenAdminPlataforma = async () => jwt.sign({ sub: 'u-v', org: 'org1', nivel: 'admin', username: 'vmoreira', origem: 'db', amb: await idVm(), amb_sigla: 'vm' }, SECRET, { expiresIn: '1h' })
const clientes = async (opts) => chamar(clientesHandler, { auth: await tokenAdminPlataforma(), ...opts })
const MM = 'mm.finup.app.br'
const urlDoEmail = (e) => e.text.match(/https:\/\/\S+\/definir-senha\?token=([A-Za-z0-9_-]+)/)
const sha256 = (t) => crypto.createHash('sha256').update(t).digest('hex')

describe('estrutura base', () => {
  it('supabase/estrutura_base.sql: nenhum comando de dados, cabeçalho com commit e data', () => {
    expect(ARQ_ESTRUTURA).not.toMatch(/^\s*(INSERT|UPDATE|DELETE|COPY|TRUNCATE)\b/im)
    expect(ARQ_ESTRUTURA).not.toMatch(/\bINSERT\s+INTO\b/i)
    expect(ARQ_ESTRUTURA).toMatch(/Gerado por scripts\/gerar-estrutura-base\.js em \d{4}-\d{2}-\d{2}T/)
    expect(ARQ_ESTRUTURA).toMatch(/\(commit [0-9a-f]{7,}\)/)
    expect(ARQ_ESTRUTURA).not.toMatch(/CREATE TABLE IF NOT EXISTS (plataforma_\w+|_migracoes) /)
  })

  it('estrutura + todas as migrações num PGlite vazio, sem erro', async () => {
    const db = new PGlite()
    await db.exec(SQL_BANCO_NOVO)
    const tabelas = (await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")).rows.map(r => r.table_name)
    for (const t of ['usuarios', 'senha_tokens', 'lancamentos', 'configuracoes', 'categorias']) expect(tabelas).toContain(t)
    const cols = (await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'configuracoes'")).rows.map(r => r.column_name)
    expect(cols).toEqual(expect.arrayContaining(['rodape_titulo', 'rodape_frase']))
    // nenhuma linha em tabela nenhuma
    for (const t of tabelas) expect((await db.query(`SELECT count(*)::int AS n FROM "${t}"`)).rows[0].n).toBe(0)
  }, 60_000)

  it('api/_sqlEmbutido.js está igual aos .sql (rode scripts/gerar-sql-embutido.js se falhar)', () => {
    expect(ESTRUTURA_BASE).toBe(ARQ_ESTRUTURA)
    expect(MIGRACOES).toEqual(ARQ_MIGRACOES)
  })
})

describe('provisionamento do cliente (Aprovar)', () => {
  let clienteId
  let fotoVmAntes

  it('cliente manual; falha do Neon e do e-mail no meio; "Tentar novamente" continua sem duplicar', async () => {
    fotoVmAntes = await foto('banco_vm')
    const novo = await clientes({ url: '/api/clientes', body: { nome: 'Marina Mendes', email: 'Marina@Exemplo.com', sigla: 'mm', telefone: '(11) 91234-5678' } })
    expect(novo.statusCode).toBe(200)
    clienteId = novo.body.cliente.id
    const aprovar = () => clientes({ url: '/api/clientes?acao=aprovar', body: { id: clienteId } })

    // 1º passo (ambiente) ok
    let r = await aprovar()
    expect(r.statusCode).toBe(200)
    expect(r.body.passos.map(p => p.feito)).toEqual([true, false, false, false, false, false, false, false])
    expect(r.body.cliente.status).toBe('aprovado')
    const [amb] = await qde('central')("SELECT * FROM ambientes WHERE sigla = 'mm'")
    expect(amb).toMatchObject({ database_name: 'cliente_mm', status: 'provisionando', cliente_id: clienteId })

    // 2º passo: o Neon falha → erro + histórico; nada mais andou
    neon.falharCriacao = 1
    r = await aprovar()
    expect(r.statusCode).toBe(502)
    expect(r.body.error).toMatch(/instabilidade simulada/)
    // tentar de novo: cria o database e segue
    r = await aprovar()
    expect(r.statusCode).toBe(200)
    expect(r.body.proximo).toBe('usuario')
    r = await aprovar() // usuário próprio do banco
    expect(r.statusCode).toBe(200)
    expect(r.body.proximo).toBe('estrutura')

    await aprovar() // estrutura
    await aprovar() // kit
    r = await aprovar() // admin
    expect(r.body.proximo).toBe('convite')

    // convite: o Resend falha → erro; o token gerado nessa tentativa morre no próximo
    falharEmail = 1
    r = await aprovar()
    expect(r.statusCode).toBe(502)
    expect(r.body.error).toMatch(/E-mail não enviado/)
    r = await aprovar() // convite de novo
    expect(r.statusCode).toBe(200)
    r = await aprovar() // ativar
    expect(r.statusCode).toBe(200)
    expect(r.body.concluido).toBe(true)
    expect(r.body.cliente.status).toBe('ativo')
    expect(r.body.mensagem).toContain('Endereço do seu ambiente: https://mm.finup.app.br')
    expect(r.body.mensagem).not.toMatch(/próxima etapa/)

    // repetir depois de concluído não faz nada
    r = await aprovar()
    expect(r.body.concluido).toBe(true)

    // cada passo registrado UMA vez; as duas falhas no histórico
    const hist = await qde('central')('SELECT evento FROM plataforma_historico WHERE cliente_id = $1', [clienteId])
    for (const p of PASSOS) expect(hist.filter(h => h.evento === `prov_${p.id}`)).toHaveLength(1)
    expect(hist.filter(h => h.evento === 'prov_falhou')).toHaveLength(2)
    // o database foi criado uma vez só (1 POST com falha + 1 com sucesso); nada de DELETE
    expect(neon.chamadas.filter(c => c.startsWith('POST'))).toHaveLength(2)
    expect(neon.chamadas.some(c => c.startsWith('DELETE'))).toBe(false)
  }, 120_000)

  it('usuário próprio (R7): papel restrito, dono de TODAS as tabelas do provisionamento (banco do admin), senha só cifrada', async () => {
    const q = qde('cliente_mm')
    const [papel] = await q(`SELECT rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls, rolinherit, rolcanlogin, rolconfig
      FROM pg_roles WHERE rolname = 'cliente_mm_app'`)
    expect(papel).toMatchObject({ rolsuper: false, rolcreaterole: false, rolcreatedb: false, rolreplication: false, rolbypassrls: false, rolinherit: false, rolcanlogin: true })
    expect(papel.rolconfig.sort()).toEqual(['idle_in_transaction_session_timeout=60s', 'statement_timeout=25s'])
    expect(await q("SELECT g.rolname FROM pg_auth_members m JOIN pg_roles g ON g.oid = m.roleid JOIN pg_roles u ON u.oid = m.member WHERE u.rolname = 'cliente_mm_app'")).toEqual([])
    // o banco fica com o admin (postgres no PGlite = neondb_owner no Neon) e o papel não tem CREATE nele
    expect((await q('SELECT pg_get_userbyid(datdba) AS dono FROM pg_database WHERE datname = current_database()'))[0].dono).toBe('postgres')
    expect((await q("SELECT has_database_privilege('cliente_mm_app', current_database(), 'CREATE') AS db, has_schema_privilege('cliente_mm_app', 'public', 'CREATE') AS sch"))[0])
      .toEqual({ db: false, sch: true })
    // estrutura, migrações, kit e admin rodaram com SET LOCAL ROLE: tudo nasce com dono cliente_mm_app
    const donos = await q("SELECT DISTINCT tableowner FROM pg_tables WHERE schemaname = 'public'")
    expect(donos).toEqual([{ tableowner: 'cliente_mm_app' }])
    expect((await q("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public'"))[0].n).toBeGreaterThan(40)
    // CONNECT: PUBLIC fora; o papel dentro
    const [{ acl }] = await q('SELECT datacl::text AS acl FROM pg_database WHERE datname = current_database()')
    expect(acl).not.toMatch(/(^|[{,])=[A-Za-z]*c/)
    expect(acl).toMatch(/cliente_mm_app=[A-Za-z]*c/)
    // central: só a cifra (decifra com a chave e o ambiente certos; senha nunca em texto)
    const [amb] = await qde('central')("SELECT id, db_usuario, db_senha_cifrada FROM ambientes WHERE sigla = 'mm'")
    expect(amb.db_usuario).toBe('cliente_mm_app')
    expect(amb.db_senha_cifrada).toMatch(/^v1./)
    const { decifrarSenha, aadDoAmbiente } = await import('./_cifraDb.js')
    expect(decifrarSenha(amb.db_senha_cifrada, aadDoAmbiente(amb.id, 'cliente_mm'))).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(() => decifrarSenha(amb.db_senha_cifrada, aadDoAmbiente(amb.id, 'cliente_zz'))).toThrow()
    // a senha foi em texto no CREATE ROLE e o banco guardou só o hash SCRAM
    const senha = decifrarSenha(amb.db_senha_cifrada, aadDoAmbiente(amb.id, 'cliente_mm'))
    const [{ rolpassword }] = await q("SELECT rolpassword FROM pg_authid WHERE rolname = 'cliente_mm_app'")
    expect(rolpassword).toMatch(/^SCRAM-SHA-256\$/)
    expect(rolpassword).not.toContain(senha)
  })

  it('ambiente ativo no central, com a versão das migrações', async () => {
    const [amb] = await qde('central')("SELECT status, schema_versao FROM ambientes WHERE sigla = 'mm'")
    expect(amb).toEqual({ status: 'ativo', schema_versao: MIGRACOES.length })
    const mig = (await qde('cliente_mm')('SELECT nome FROM _migracoes ORDER BY nome')).map(r => r.nome)
    expect(mig).toEqual(['_estrutura_base', ...MIGRACOES.map(m => m.nome)].sort())
  })

  it('kit básico exato e NENHUM dado do vm no cliente', async () => {
    const q = qde('cliente_mm')
    expect((await q('SELECT name FROM categorias ORDER BY name')).map(r => r.name)).toEqual(KIT_CATEGORIAS.map(c => c[1]).sort())
    expect((await q('SELECT name FROM grupos_conta ORDER BY "order"')).map(r => r.name)).toEqual(KIT_GRUPOS_CONTA.map(g => g[1]))
    expect((await q('SELECT name, fixed FROM reservas_funcoes ORDER BY id')).map(r => r.name)).toEqual(KIT_GRUPOS_GERENCIAIS.map(g => g[2]))
    expect((await q('SELECT nome FROM tipos_documento ORDER BY ordem')).map(r => r.nome)).toEqual(KIT_TIPOS_DOCUMENTO)
    expect((await q('SELECT padrao FROM contrato_regras_itens WHERE contrato_id IS NULL ORDER BY padrao')).map(r => r.padrao)).toEqual(KIT_REGRAS_ITENS.map(r => r[0]).sort())
    const [cfg] = await q('SELECT financial_month_start_day, cost_centers, rodape_titulo, rodape_frase FROM configuracoes')
    expect(cfg).toEqual({ financial_month_start_day: 1, cost_centers: KIT_CENTROS_DE_CUSTO, rodape_titulo: 'Marina Mendes', rodape_frase: null })
    expect(await q('SELECT * FROM account_mapping')).toEqual([])
    expect(await q('SELECT * FROM contas')).toEqual([])
    expect(await q('SELECT * FROM lancamentos')).toEqual([])
    // usuário admin com o e-mail do cliente e senha inutilizável (bcrypt de bytes aleatórios)
    const us = await q('SELECT username, nome, email, nivel, ativo, trocar_senha, senha_hash FROM usuarios')
    expect(us).toHaveLength(1)
    expect(us[0]).toMatchObject({ username: 'admin', nome: 'Marina Mendes', email: 'marina@exemplo.com', nivel: 'admin', ativo: true, trocar_senha: false })
    expect(us[0].senha_hash).toMatch(/^\$2[aby]\$/)
    expect((await q('SELECT papel FROM membros'))).toEqual([{ papel: 'admin' }])
    // nada que é do Victor
    const tudo = JSON.stringify(await Promise.all(['categorias', 'reservas_funcoes', 'organizacoes', 'usuarios', 'contas'].map(t => q(`SELECT * FROM ${t}`))))
    for (const s of ['Emerson', 'PharmaLog', 'Contas Anuais', 'Victor', 'vmoreira', 'Consórcio', 'PHARMA']) expect(tudo).not.toContain(s)
  })

  it('o banco do vm não mudou (contagem e conteúdo de todas as tabelas)', async () => {
    expect(await foto('banco_vm')).toEqual(fotoVmAntes)
  })

  it('convite: só no banco do cliente, link para mm.finup.app.br, vale só lá; senha definida → login', async () => {
    expect(emails).toHaveLength(1)
    const [e] = emails
    expect(e.to).toEqual(['marina@exemplo.com'])
    expect(e.subject).toBe('Seu acesso ao Finup — ambiente MM')
    expect(e.html).toContain('Criar minha senha')
    const [url, token] = urlDoEmail(e)
    expect(url.startsWith('https://mm.finup.app.br/definir-senha?token=')).toBe(true)

    const tokens = await qde('cliente_mm')('SELECT token_hash, tipo, usado_em FROM senha_tokens ORDER BY criado_em')
    expect(tokens).toHaveLength(2) // o da tentativa com e-mail falho (já invalidado) + o enviado
    expect(tokens[0].usado_em).not.toBeNull()
    expect(tokens[1]).toMatchObject({ token_hash: sha256(token), tipo: 'convite', usado_em: null })
    expect(await qde('banco_vm')('SELECT * FROM senha_tokens')).toEqual([])

    const validar = (host) => chamar(senhaHandler, { method: 'GET', url: `/api/senha?acao=validar&token=${token}`, host })
    expect((await validar('www.finup.app.br')).statusCode).toBe(410)
    expect((await validar(MM)).body).toEqual({ ok: true, nome: 'Marina Mendes', tipo: 'convite' })
    const d = await chamar(senhaHandler, { url: '/api/senha?acao=definir', host: MM, body: { token, novaSenha: 'senha-da-marina-1' } })
    expect(d.statusCode).toBe(200)

    const login = await chamar(authHandler, { url: '/api/auth', host: MM, body: { username: 'admin', password: 'senha-da-marina-1' } })
    expect(login.statusCode).toBe(200)
    expect(jwt.decode(login.body.token)).toMatchObject({ amb_sigla: 'mm', username: 'admin', nivel: 'admin' })
    // pelo e-mail também; no www com o ambiente MM → código de passagem para o endereço do cliente
    expect((await chamar(authHandler, { url: '/api/auth', host: MM, body: { username: 'marina@exemplo.com', password: 'senha-da-marina-1' } })).statusCode).toBe(200)
    const www = await chamar(authHandler, { url: '/api/auth', body: { username: 'admin', password: 'senha-da-marina-1', ambiente: 'mm' } })
    expect(www.body.redirect).toMatch(/^https:\/\/mm\.finup\.app\.br\/entrar\?c=/)
    // token do cliente não abre o www, e o do vm não abre o cliente
    expect((await chamar(pingHandler, { method: 'GET', auth: login.body.token })).statusCode).toBe(401)
    expect((await chamar(pingHandler, { method: 'GET', auth: login.body.token, host: MM })).statusCode).toBe(200)
    expect((await chamar(pingHandler, { method: 'GET', auth: await tokenAdminPlataforma(), host: MM })).statusCode).toBe(401)
  }, 30_000)

  it('/api/load no cliente: só o kit, rodapé do cliente, dia 1; nenhum seed do vm; Dindin vazio e bloqueado', async () => {
    const auth = (await chamar(authHandler, { url: '/api/auth', host: MM, body: { username: 'admin', password: 'senha-da-marina-1' } })).body.token
    const r = await chamar(loadHandler, { method: 'GET', url: '/api/load', host: MM, auth })
    expect(r.statusCode).toBe(200)
    expect(r.body.cats.map(c => c.name).sort()).toEqual(KIT_CATEGORIAS.map(c => c[1]).sort())
    expect(r.body.cfg).toMatchObject({ financial_month_start_day: 1, rodape_titulo: 'Marina Mendes' })
    expect(r.body.accs).toEqual([])
    expect((await chamar(mappingHandler, { method: 'GET', url: '/api/account-mapping', host: MM, auth })).body).toEqual([])
    const sync = await chamar(syncHandler, { url: '/api/sync', host: MM, auth, body: { type: 'section', table: 'account_mapping', upsert: [{ id: 1, nome_dindin: 'x' }], delete: [] } })
    expect(sync.statusCode).toBe(403)
    expect(await qde('cliente_mm')('SELECT * FROM account_mapping')).toEqual([])
  }, 60_000)

  it('/api/load no vm continua rodando os seeds dele (Consórcio etc.)', async () => {
    const auth = jwt.sign({ sub: 'u-v', org: 'org1', nivel: 'admin', username: 'vmoreira', origem: 'db', amb: await idVm(), amb_sigla: 'vm' }, SECRET)
    const r = await chamar(loadHandler, { method: 'GET', url: '/api/load', auth })
    expect(r.statusCode).toBe(200)
    expect(r.body.cats.map(c => c.name)).toContain('Consórcio')
    expect(r.body.cfg.financial_month_start_day).toBe(15)
    expect(r.body.cfg.rodape_titulo).toBeNull()
  }, 60_000)

  it('reenviar convite: link novo, o anterior deixa de valer', async () => {
    emails = []
    const r = await clientes({ url: '/api/clientes?acao=reenviar-convite', body: { id: clienteId } })
    expect(r.statusCode).toBe(200)
    expect(r.body).toMatchObject({ ok: true, para: 'marina@exemplo.com' })
    const [, token] = urlDoEmail(emails[0])
    expect((await chamar(senhaHandler, { method: 'GET', url: `/api/senha?acao=validar&token=${token}`, host: MM })).body.tipo).toBe('convite')
    const validos = await qde('cliente_mm')('SELECT count(*)::int AS n FROM senha_tokens WHERE usado_em IS NULL')
    expect(validos[0].n).toBe(1)
  })

  it('suspender → login e API "Ambiente indisponível"; reativar → volta; cancelar não apaga o banco', async () => {
    const status = (acao) => clientes({ url: '/api/clientes?acao=status', body: { id: clienteId, acao } })
    const entrar = () => chamar(authHandler, { url: '/api/auth', host: MM, body: { username: 'admin', password: 'senha-da-marina-1' } })
    const auth = (await entrar()).body.token

    expect((await status('suspender')).body.cliente.status).toBe('suspenso')
    expect((await qde('central')("SELECT status FROM ambientes WHERE sigla = 'mm'"))[0].status).toBe('suspenso')
    expect((await entrar()).statusCode).toBe(401)
    const api = await chamar(pingHandler, { method: 'GET', auth, host: MM })
    expect(api.statusCode).toBe(403)
    expect(api.body.error).toBe('Ambiente indisponível')

    expect((await status('reativar')).body.cliente.status).toBe('ativo')
    expect((await qde('central')("SELECT status FROM ambientes WHERE sigla = 'mm'"))[0].status).toBe('ativo')
    expect((await entrar()).statusCode).toBe(200)

    const chamadasAntes = neon.chamadas.length
    expect((await status('cancelar')).body.cliente.status).toBe('cancelado')
    expect((await qde('central')("SELECT status FROM ambientes WHERE sigla = 'mm'"))[0].status).toBe('cancelado')
    expect((await entrar()).statusCode).toBe(401)
    expect(neon.chamadas.length).toBe(chamadasAntes) // nada pedido ao Neon (nenhuma exclusão)
    expect((await qde('cliente_mm')('SELECT count(*)::int AS n FROM usuarios'))[0].n).toBe(1) // banco intacto
    // reativar um cancelado que já esteve no ar → ativo de novo
    expect((await status('reativar')).body.cliente.status).toBe('ativo')
  })
})

describe('usuário próprio (R7): senha em texto só por TLS verificado e nunca em log', () => {
  it('CREATE ROLE só na conexão verificada; erro no CREATE ROLE não vaza a senha (log, histórico, resposta)', async () => {
    const novo = await clientes({ url: '/api/clientes', body: { nome: 'Lia Lopes', email: 'lia@exemplo.com', sigla: 'll' } })
    const id = novo.body.cliente.id
    const aprovar = () => clientes({ url: '/api/clientes?acao=aprovar', body: { id } })
    await aprovar() // ambiente
    expect((await aprovar()).body.proximo).toBe('usuario') // database

    let senha = null
    const roleSemTls = []
    const doNeon = () => { if (!noNeon.has('cliente_ll')) throw new Error('não existe'); return bancos.cliente_ll }
    _definirFabricaDePool((nome, { tlsVerificado } = {}) => {
      if (!(nome in bancos)) throw new Error(`teste: database "${nome}" não existe`)
      const pool = poolPGlite(nome === 'cliente_ll' ? doNeon : bancos[nome])
      const query = async (sql, p) => {
        if (/ROLE .* PASSWORD/.test(sql)) {
          if (!tlsVerificado) roleSemTls.push(nome)
          senha = sql.match(/PASSWORD '([^']+)'/)[1]
          // o "driver" ecoa o SQL na mensagem e pendura o SQL no erro
          throw Object.assign(new Error(`syntax error in: ${sql}`), { code: '42601', query: sql })
        }
        return pool.query(sql, p)
      }
      return { query, connect: async () => ({ query, release() {} }) }
    })

    const r = await aprovar()
    expect(r.statusCode).toBe(500)
    expect(senha).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(roleSemTls).toEqual([])
    expect(JSON.stringify(r.body)).not.toContain(senha)
    const hist = await qde('central')('SELECT evento, detalhe FROM plataforma_historico WHERE cliente_id = $1', [id])
    expect(JSON.stringify(hist)).not.toContain(senha)
    expect(hist.find(h => h.evento === 'prov_falhou').detalhe).toMatch(/papel cliente_ll_app recusado pelo banco \[42601\]: syntax error in: .*PASSWORD '\*\*\*'/)
    for (const m of ['log', 'info', 'warn', 'error']) expect(JSON.stringify(console[m].mock.calls)).not.toContain(senha)
    // nada gravado: sem papel e sem credencial no central
    expect((await qde('cliente_ll')("SELECT 1 FROM pg_roles WHERE rolname = 'cliente_ll_app'"))).toEqual([])
    expect((await qde('central')("SELECT db_usuario FROM ambientes WHERE sigla = 'll'"))[0].db_usuario).toBeNull()
  }, 120_000)
})

describe('rodapé do kit', () => {
  it('PF → nome; PJ → empresa', () => {
    expect(rodapeDoCliente({ tipo_pessoa: 'PF', nome: 'Ana Lima', empresa: 'X' })).toBe('Ana Lima')
    expect(rodapeDoCliente({ tipo_pessoa: 'PJ', nome: 'Ana Lima', empresa: 'Lima Contabilidade' })).toBe('Lima Contabilidade')
  })
})

// ─── Quadro "Tentativas de senha" + "Liberar agora" ───────────────────────────────────────────────
describe('tentativas de senha (Controle de Clientes)', () => {
  const idDe = async (sigla) => (await qde('central')('SELECT id FROM plataforma_clientes WHERE sigla = $1', [sigla]))[0].id
  const esqueci = (login) => chamar(senhaHandler, { url: '/api/senha?acao=esqueci', host: MM, body: { login } })

  it('mostra login digitado, resultado, IP mascarado e o bloqueio; "Liberar agora" zera só este ambiente', async () => {
    await qde('central')('DELETE FROM senha_pedidos')
    const id = await idDe('mm')
    await esqueci('ninguem')
    for (let i = 0; i < 4; i++) await esqueci('admin') // 3 enviados + 1 bloqueado por usuário
    // pedido de OUTRO ambiente (vm) não pode ser apagado pelo "liberar" do mm
    await chamar(senhaHandler, { url: '/api/senha?acao=esqueci', body: { login: 'vmoreira', ambiente: 'vm' } })
    const totalAntes = (await qde('central')('SELECT count(*)::int AS n FROM senha_pedidos'))[0].n

    const r = await clientes({ method: 'GET', url: `/api/clientes?acao=tentativas-senha&id=${id}` })
    expect(r.statusCode).toBe(200)
    expect(r.body.pedidos).toHaveLength(5)
    expect(r.body.pedidos.map(p => p.resultado).sort()).toEqual(['bloqueado_usuario', 'enviado', 'enviado', 'enviado', 'nao_encontrado'])
    expect(r.body.pedidos.map(p => p.login)).toContain('ninguem')
    for (const p of r.body.pedidos) expect(p.ip).toBe('10.1.x.x')
    expect(JSON.stringify(r.body)).not.toContain('10.1.1.1')
    expect(r.body.bloqueios).toEqual([expect.objectContaining({ tipo: 'usuario', alvo: 'admin' })])
    expect(new Date(r.body.liberadoEm).getTime()).toBeGreaterThan(Date.now() + 50 * 60 * 1000)
    expect(r.body.limites).toEqual({ porIpPorHora: 10, porUsuarioPorHora: 3 })

    const lib = await clientes({ url: '/api/clientes?acao=liberar-senha', body: { id } })
    expect(lib.statusCode).toBe(200)
    // mm: 5 linhas de IP + 4 do usuário admin; o pedido do vm (usuário vmoreira existe lá) deixa 2 linhas que ficam
    expect(lib.body.apagados).toBe(9)
    expect(totalAntes).toBe(11)
    expect((await qde('central')('SELECT count(*)::int AS n FROM senha_pedidos'))[0].n).toBe(2)
    const depois = await clientes({ method: 'GET', url: `/api/clientes?acao=tentativas-senha&id=${id}` })
    expect(depois.body).toMatchObject({ pedidos: [], bloqueios: [], liberadoEm: null })
    const hist = await qde('central')("SELECT detalhe FROM plataforma_historico WHERE cliente_id = $1 AND evento = 'senha_liberada'", [id])
    expect(hist[0].detalhe).toMatch(/^Limite de senha liberado por vmoreira/)
    // de novo pode pedir
    emails = []
    await esqueci('admin')
    expect(emails).toHaveLength(1)
  })
})

// ─── Excluir cliente ────────────────────────────────────────────────────────────────────────────
describe('excluir cliente', () => {
  const excluir = (id, confirmacao) => clientes({ url: '/api/clientes?acao=excluir', body: { id, confirmacao } })
  const status = (id, acao) => clientes({ url: '/api/clientes?acao=status', body: { id, acao } })
  const novo = async (sigla, nome = `Cliente ${sigla}`) => {
    const r = await clientes({ url: '/api/clientes', body: { nome, email: `${sigla}@exemplo.com`, sigla } })
    expect(r.statusCode).toBe(200)
    return r.body.cliente.id
  }
  const provisionar = async (id) => {
    for (let i = 0; i < 10; i++) {
      const r = await clientes({ url: '/api/clientes?acao=aprovar', body: { id } })
      expect(r.statusCode).toBe(200)
      if (r.body.concluido) return
    }
    throw new Error('não concluiu')
  }
  const sobrou = async (id, sigla) => {
    const q = qde('central')
    const n = async (sql, p) => (await q(`SELECT count(*)::int AS n FROM ${sql}`, p))[0].n
    return {
      cliente: await n('plataforma_clientes WHERE id = $1 OR sigla = $2', [id, sigla]),
      historico: await n('plataforma_historico WHERE cliente_id = $1', [id]),
      ambiente: await n('ambientes WHERE cliente_id = $1 OR sigla = $2', [id, sigla]),
      handoff: await n("login_handoff h WHERE NOT EXISTS (SELECT 1 FROM ambientes a WHERE a.id = h.ambiente_id)"),
      pedidos: await n("senha_pedidos WHERE ambiente_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ambientes a WHERE a.id = senha_pedidos.ambiente_id)"),
    }
  }

  it('fluxo completo: provisiona zz, cancela, exclui → database some do Neon, nada sobra no central, auditoria, sigla livre', async () => {
    const fotoVm = await foto('banco_vm')
    const id = await novo('zz', 'Zélia Zanetti')
    await provisionar(id)
    expect(noNeon.has('cliente_zz')).toBe(true)
    const [amb] = await qde('central')("SELECT id FROM ambientes WHERE sigla = 'zz'")
    // rastros no central: pedido de senha e código de passagem do ambiente zz
    await chamar(senhaHandler, { url: '/api/senha?acao=esqueci', host: 'zz.finup.app.br', body: { login: 'admin' } })
    await qde('central')("INSERT INTO login_handoff (codigo_hash, ambiente_id, payload, expira_em) VALUES ('h-zz', $1, '{}', now())", [amb.id])

    // ativo → recusado (precisa cancelar antes); a tela recebe exclusao.pode = false
    let det = await clientes({ method: 'GET', url: `/api/clientes?id=${id}` })
    expect(det.body.exclusao).toEqual({ pode: false, motivo: 'Cancele o cliente antes de excluir' })
    let r = await excluir(id, 'zz')
    expect(r.statusCode).toBe(409)
    expect(noNeon.has('cliente_zz')).toBe(true)

    expect((await status(id, 'cancelar')).body.cliente.status).toBe('cancelado')
    det = await clientes({ method: 'GET', url: `/api/clientes?id=${id}` })
    expect(det.body.exclusao).toEqual({ pode: true })
    expect(det.body.ambiente).toMatchObject({ database_name: 'cliente_zz', status: 'cancelado' })

    // sigla digitada errada → recusa, nada apagado
    r = await excluir(id, 'zx')
    expect(r.statusCode).toBe(400)
    expect(r.body.error).toBe('A sigla digitada não confere')
    expect(noNeon.has('cliente_zz')).toBe(true)
    expect((await sobrou(id, 'zz')).cliente).toBe(1)

    const deletesAntes = neon.chamadas.filter(c => c.startsWith('DELETE')).length
    r = await excluir(id, ' ZZ ')
    expect(r.statusCode).toBe(200)
    expect(r.body).toMatchObject({ ok: true, sigla: 'zz' })
    // o database sumiu do Neon (um DELETE, só dele) e não abre mais
    const deletes = neon.chamadas.filter(c => c.startsWith('DELETE')).slice(deletesAntes)
    expect(deletes).toEqual(['DELETE /projects/proj-1/branches/br-1/databases/cliente_zz'])
    expect(noNeon.has('cliente_zz')).toBe(false)
    // nada sobrou no central
    expect(await sobrou(id, 'zz')).toEqual({ cliente: 0, historico: 0, ambiente: 0, handoff: 0, pedidos: 0 })
    // auditoria sem senha nem token
    const aud = await qde('central')("SELECT * FROM plataforma_exclusoes WHERE sigla = 'zz'")
    expect(aud).toHaveLength(1)
    expect(aud[0]).toMatchObject({ cliente_id: id, nome: 'Zélia Zanetti', database_name: 'cliente_zz', autor: 'vmoreira' })
    expect(Object.keys(aud[0]).some(k => /senha|token|hash/.test(k))).toBe(false)
    // sigla livre para outro cliente
    const outro = await clientes({ url: '/api/clientes', body: { nome: 'Outro ZZ', email: 'outro@exemplo.com', sigla: 'zz' } })
    expect(outro.statusCode).toBe(200)
    // o vm não foi tocado
    expect(await foto('banco_vm')).toEqual(fotoVm)
  }, 120_000)

  it('falha no Neon no meio → erro + histórico; "excluir" de novo continua sem repetir nada', async () => {
    const id = await novo('ww')
    await provisionar(id)
    await status(id, 'cancelar')
    neon.falharExclusao = 1
    let r = await excluir(id, 'ww')
    expect(r.statusCode).toBe(502)
    expect((await qde('central')("SELECT evento FROM plataforma_historico WHERE cliente_id = $1 AND evento = 'excl_falhou'", [id]))).toHaveLength(1)
    expect(noNeon.has('cliente_ww')).toBe(true)
    r = await excluir(id, 'ww')
    expect(r.statusCode).toBe(200)
    expect(noNeon.has('cliente_ww')).toBe(false)
    expect(await sobrou(id, 'ww')).toEqual({ cliente: 0, historico: 0, ambiente: 0, handoff: 0, pedidos: 0 })
  }, 120_000)

  // R7: o papel vive no cluster (no Neon, um papel criado em cliente_kk existe também no central). No
  // PGlite cada database é uma instância; por isso o teste cria o mesmo papel no central e confere lá.
  const donoDoBanco = async (nome) => (await bancos[nome].query('SELECT pg_get_userbyid(datdba) AS d FROM pg_database WHERE datname = current_database()')).rows[0].d
  const papelExiste = async (nome, papel) => (await bancos[nome].query('SELECT 1 FROM pg_roles WHERE rolname = $1', [papel])).rows.length > 0

  it('usuário próprio (R7): o banco volta ao admin ANTES do DROP e o papel <database>_app é removido', async () => {
    const id = await novo('kk')
    await provisionar(id)
    expect(await donoDoBanco('cliente_kk')).toBe('postgres')
    // banco do desenho antigo (dono = papel, como o cliente_teste1 ficou em 21/10): a exclusão o devolve
    await bancos.cliente_kk.exec("DO $$ BEGIN EXECUTE format('ALTER DATABASE %I OWNER TO cliente_kk_app', current_database()); END $$")
    await bancos.central.exec('CREATE ROLE cliente_kk_app')
    await status(id, 'cancelar')

    let donoNoDrop = null
    neon.antesDoDelete = async (db) => { if (db === 'cliente_kk') donoNoDrop = await donoDoBanco('cliente_kk') }
    const r = await excluir(id, 'kk')
    expect(r.statusCode).toBe(200)
    // (a) no momento do DELETE no Neon o dono já era o admin (postgres no PGlite = neondb_owner no Neon)
    expect(donoNoDrop).toBe('postgres')
    expect(noNeon.has('cliente_kk')).toBe(false)
    // (b) o papel não existe mais
    expect(await papelExiste('central', 'cliente_kk_app')).toBe(false)
    // nada de falha engolida com aviso
    expect(console.warn).not.toHaveBeenCalledWith(expect.stringContaining('[excluirCliente]'), expect.anything())
    expect(await sobrou(id, 'kk')).toEqual({ cliente: 0, historico: 0, ambiente: 0, handoff: 0, pedidos: 0 })
  }, 120_000)

  it('usuário próprio (R7): se o dono não volta ao admin, a exclusão PARA (sem DROP no Neon, sem apagar o papel)', async () => {
    const id = await novo('jj')
    await provisionar(id)
    await bancos.cliente_jj.exec("DO $$ BEGIN EXECUTE format('ALTER DATABASE %I OWNER TO cliente_jj_app', current_database()); END $$") // desenho antigo
    await bancos.central.exec('CREATE ROLE cliente_jj_app')
    await status(id, 'cancelar')
    // o pool admin do cliente_jj recusa o ALTER DATABASE (ex.: permissão negada)
    const negado = Object.assign(new Error('must be able to SET ROLE "cliente_jj_app"'), { code: '42501' })
    const real = poolPGlite(bancos.cliente_jj)
    const fabrica = (nome, { admin } = {}) => {
      if (nome === 'cliente_jj' && admin) return { ...real, query: async (sql, p) => { if (/ALTER DATABASE/.test(sql)) throw negado; return real.query(sql, p) } }
      if (nome === 'central') return poolPGlite(bancos.central)
      if (nome === 'cliente_jj') return real
      throw new Error(`teste: database "${nome}" não existe`)
    }
    _definirFabricaDePool(fabrica)

    const deletesAntes = neon.chamadas.filter(c => c.startsWith('DELETE')).length
    let r = await excluir(id, 'jj')
    expect(r.statusCode).toBe(500)
    expect(neon.chamadas.filter(c => c.startsWith('DELETE')).length).toBe(deletesAntes)
    expect(noNeon.has('cliente_jj')).toBe(true)
    expect(await donoDoBanco('cliente_jj')).toBe('cliente_jj_app')
    expect(await papelExiste('central', 'cliente_jj_app')).toBe(true)
    const hist = await qde('central')("SELECT detalhe FROM plataforma_historico WHERE cliente_id = $1 AND evento = 'excl_falhou'", [id])
    expect(hist).toHaveLength(1)
    expect(hist[0].detalhe).toMatch(/dono de cliente_jj não devolvido/)
    expect((await sobrou(id, 'jj')).cliente).toBe(1)

    // permissão de volta → "excluir" de novo conclui
    _definirFabricaDePool((nome) => poolPGlite(bancos[nome]))
    r = await excluir(id, 'jj')
    expect(r.statusCode).toBe(200)
    expect(noNeon.has('cliente_jj')).toBe(false)
    expect(await papelExiste('central', 'cliente_jj_app')).toBe(false)
  }, 120_000)

  it('usuário próprio (R7): DROP feito e papel não removido → "excluir" de novo pula o dono (3D000) e remove o papel', async () => {
    const id = await novo('hh')
    await provisionar(id)
    await bancos.central.exec('CREATE ROLE cliente_hh_app')
    await status(id, 'cancelar')
    let falharDropRole = 1
    _definirFabricaDePool((nome, { admin } = {}) => {
      if (!(nome in bancos)) throw new Error(`teste: database "${nome}" não existe`)
      const pool = poolPGlite(nome === 'cliente_hh' ? () => { if (!noNeon.has('cliente_hh')) throw Object.assign(new Error('não existe'), { code: '3D000' }); return bancos.cliente_hh } : bancos[nome])
      if (nome !== 'central' || !admin) return pool
      return { ...pool, query: async (sql, p) => { if (/DROP ROLE/.test(sql) && falharDropRole-- > 0) throw new Error('falha simulada no DROP ROLE'); return pool.query(sql, p) } }
    })

    let r = await excluir(id, 'hh')
    expect(r.statusCode).toBe(500)
    expect(noNeon.has('cliente_hh')).toBe(false) // o DROP no Neon já aconteceu
    expect(await papelExiste('central', 'cliente_hh_app')).toBe(true)
    r = await excluir(id, 'hh')
    expect(r.statusCode).toBe(200)
    expect(await papelExiste('central', 'cliente_hh_app')).toBe(false)
    expect(await sobrou(id, 'hh')).toEqual({ cliente: 0, historico: 0, ambiente: 0, handoff: 0, pedidos: 0 })
  }, 120_000)

  it('nunca aprovado (só cadastro): exclui sem chamar o Neon', async () => {
    const id = await novo('yy')
    const antes = neon.chamadas.length
    const r = await excluir(id, 'yy')
    expect(r.statusCode).toBe(200)
    expect(neon.chamadas.length).toBe(antes)
    expect(await sobrou(id, 'yy')).toMatchObject({ cliente: 0, historico: 0 })
  })

  it('travas: vm e siglas reservadas, database que não é de cliente, status ativo, sigla errada', async () => {
    const q = qde('central')
    const antes = neon.chamadas.length
    // vm (e reservadas): cadastro com a sigla vm direto no banco (o formulário nem aceita)
    await q("INSERT INTO plataforma_clientes (id, nome, email, sigla, status) VALUES ('c-vm', 'Victor', 'v@v.com', 'vm', 'cancelado'), ('c-api', 'Api', 'a@a.com', 'api', 'cancelado')")
    for (const [id, sigla] of [['c-vm', 'vm'], ['c-api', 'api']]) {
      const r = await excluir(id, sigla)
      expect(r.statusCode).toBe(409)
      expect(r.body.error).toMatch(/reservada/)
    }
    expect((await q("SELECT status FROM ambientes WHERE sigla = 'vm'"))[0].status).toBe('ativo')
    // database que não casa com cliente_<sigla> (neondb, finup_central, de outra sigla)
    for (const [i, db] of ['finup_central', 'cliente_outro', 'neondbx', 'postgres'].entries()) {
      const sigla = `tr${i}`
      await q("INSERT INTO plataforma_clientes (id, nome, email, sigla, status) VALUES ($1, 'Trava', 't@t.com', $2, 'cancelado')", [`c-${sigla}`, sigla])
      await q("INSERT INTO ambientes (sigla, nome, database_name, status, cliente_id) VALUES ($1, 'Trava', $2, 'cancelado', $3)", [sigla, db, `c-${sigla}`])
      const r = await excluir(`c-${sigla}`, sigla)
      expect(r.statusCode).toBe(409)
      expect(r.body.error).toMatch(/não é um banco de cliente/)
    }
    // ativo (o mm) → precisa cancelar antes; sigla errada nunca passa
    const mm = (await q("SELECT id FROM plataforma_clientes WHERE sigla = 'mm'"))[0].id
    expect((await excluir(mm, 'mm')).statusCode).toBe(409)
    expect(neon.chamadas.length).toBe(antes) // nada pedido ao Neon em nenhuma recusa
    expect(noNeon.has('cliente_mm')).toBe(true)
  })

  it('a API do Neon recusa apagar neondb, finup_central ou nome fora de cliente_<sigla> (sem chamar o Neon)', async () => {
    const { excluirDatabase } = await import('./_neon.js')
    const antes = neon.chamadas.length
    for (const nome of ['neondb', 'finup_central', 'postgres', 'cliente_', 'cliente_a;drop', 'Cliente_aa', 'outro_aa']) {
      await expect(excluirDatabase(nome)).rejects.toThrow(/não pode ser excluído/)
    }
    await expect(excluirDatabase('cliente_xx', { protegidos: ['cliente_xx'] })).rejects.toThrow(/não pode ser excluído/)
    expect(neon.chamadas.length).toBe(antes)
  })

  it('o central nunca pode ser o neondb (as plataforma_* antigas de lá não são tocadas)', async () => {
    const { situacaoExclusao } = await import('./_excluirCliente.js')
    const c = { id: 'c1', sigla: 'aa', status: 'cancelado' }
    expect(situacaoExclusao(c, null, { central: 'neondb' })).toMatchObject({ pode: false })
    expect(situacaoExclusao(c, null, { central: 'finup_central' })).toEqual({ pode: true })
    const amb = { cliente_id: 'c1', sigla: 'aa', database_name: 'cliente_aa', status: 'cancelado' }
    expect(situacaoExclusao(c, amb, { central: 'finup_central' })).toEqual({ pode: true })
    expect(situacaoExclusao({ ...c, status: 'ativo' }, { ...amb, status: 'ativo' }, { central: 'finup_central' })).toMatchObject({ pode: false })
    for (const db of ['finup_central', 'neondb', 'cliente_bb', 'postgres']) {
      expect(situacaoExclusao(c, { ...amb, database_name: db }, { central: 'finup_central' })).toMatchObject({ pode: false })
    }
  })
})
