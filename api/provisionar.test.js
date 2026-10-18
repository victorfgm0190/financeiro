import process from 'node:process'
import crypto from 'node:crypto'
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import jwt from 'jsonwebtoken'
import { SQL_CENTRAL, usarBancos } from './_testes/pglite.js'
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
const { KIT_CATEGORIAS, KIT_GRUPOS_CONTA, KIT_GRUPOS_GERENCIAIS, KIT_TIPOS_DOCUMENTO, KIT_CENTROS_DE_CUSTO, rodapeDoCliente } = await import('./_kitBasico.js')
const { ESTRUTURA_BASE, MIGRACOES } = await import('./_sqlEmbutido.js')

const SECRET = 'segredo-de-teste'
const raiz = fileURLToPath(new URL('../supabase/', import.meta.url))
const ler = (f) => readFileSync(f, 'utf-8').replace(/\r\n/g, '\n') // igual ao scripts/gerar-sql-embutido.js
const ARQ_ESTRUTURA = ler(raiz + 'estrutura_base.sql')
const ARQ_MIGRACOES = readdirSync(raiz + 'migrations').filter(f => f.endsWith('.sql')).sort()
  .map(nome => ({ nome, sql: ler(raiz + 'migrations/' + nome) }))
const SQL_BANCO_NOVO = ARQ_ESTRUTURA + '\n' + ARQ_MIGRACOES.map(m => m.sql).join('\n')

const bancos = {}
const qde = (nome) => async (sql, params = []) => (await bancos[nome].query(sql, params)).rows
let clienteCriado = false

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
  // Banco do cliente: só "existe" depois que a API do Neon (simulada) o cria.
  bancos.cliente_mm = new PGlite()
}, 120_000)

// ─── API do Neon + Resend simulados ─────────────────────────────────────────────────────────────
const neon = { chamadas: [], falharCriacao: 0 }
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
  if (metodo === 'GET' && url.endsWith('/databases/cliente_mm')) return clienteCriado ? resp(200, { database: { name: 'cliente_mm' } }) : resp(404, { message: 'not found' })
  if (metodo === 'POST' && url.endsWith('/databases')) {
    if (neon.falharCriacao > 0) { neon.falharCriacao--; return resp(500, { message: 'instabilidade simulada' }) }
    expect(JSON.parse(init.body)).toEqual({ database: { name: 'cliente_mm', owner_name: 'neondb_owner' } })
    clienteCriado = true
    return resp(201, { database: { name: 'cliente_mm' }, operations: [{ id: 'op-1', action: 'create_database', status: 'running' }] })
  }
  if (metodo === 'GET' && url.endsWith('/operations/op-1')) return resp(200, { operation: { id: 'op-1', status: 'finished' } })
  return resp(404, { message: `rota simulada inexistente: ${metodo} ${url}` })
}

let envOriginal
beforeEach(() => {
  envOriginal = { ...process.env }
  Object.assign(process.env, {
    JWT_SECRET: SECRET, PLATAFORMA_ADMIN: 'vmoreira', RESEND_API_KEY: 're_teste', EMAIL_FROM: 'Finup <nao-responda@finup.app.br>',
    NEON_API_KEY: 'neon-chave', NEON_PROJECT_ID: 'proj-1', NEON_BRANCH_ID: 'br-1',
  })
  delete process.env.ALLOW_ENV_ADMIN
  usarBancos({
    central: bancos.central, banco_vm: bancos.banco_vm,
    cliente_mm: () => { if (!clienteCriado) throw new Error('database cliente_mm ainda não existe'); return bancos.cliente_mm },
  })
  vi.stubGlobal('fetch', vi.fn(fetchFalso))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { process.env = envOriginal; vi.unstubAllGlobals(); vi.restoreAllMocks() })
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
    expect(r.body.passos.map(p => p.feito)).toEqual([true, false, false, false, false, false, false])
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
  })

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

describe('rodapé do kit', () => {
  it('PF → nome; PJ → empresa', () => {
    expect(rodapeDoCliente({ tipo_pessoa: 'PF', nome: 'Ana Lima', empresa: 'X' })).toBe('Ana Lima')
    expect(rodapeDoCliente({ tipo_pessoa: 'PJ', nome: 'Ana Lima', empresa: 'Lima Contabilidade' })).toBe('Lima Contabilidade')
  })
})
