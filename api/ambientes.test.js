import process from 'node:process'
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join, relative } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { SQL_CENTRAL, usarBancos, poolPGlite } from './_testes/pglite.js'
import { rodarNoAmbiente, ErroSemAmbiente, _definirFabricaDePool } from './_conexao.js'
import { _limparCacheAmbientes } from './_central.js'
import { query } from './_db.js'

// AMBIENTES (multi-cliente, um database por cliente) com o _db.js DE VERDADE — nada mockado: um
// PGlite por database (central, vm, A, B, C) atrás da fábrica de pools do _conexao.js. Qualquer
// database fora do mapa (ex.: neondb) faz a fábrica lançar.

const { default: authHandler, ERRO_LOGIN, ERRO_CODIGO } = await import('./auth.js')
const { default: pingHandler } = await import('./ping.js')
const { default: syncHandler } = await import('./sync.js')
const { default: searchHandler } = await import('./search.js')
const { default: loadHandler } = await import('./load.js')

const SECRET = 'segredo-de-teste'
const MIGRACAO = ['2026-10-14_usuarios.sql', '2026-10-17_niveis_acesso.sql']
  .map(f => readFileSync(fileURLToPath(new URL(`../supabase/migrations/${f}`, import.meta.url)), 'utf-8')).join('\n')
const TABELAS_APP = `
  CREATE TABLE IF NOT EXISTS perfis (id TEXT PRIMARY KEY, name TEXT, ordem INTEGER, created_at TIMESTAMPTZ DEFAULT now());
  CREATE TABLE contas (id TEXT PRIMARY KEY, profile_id TEXT);
  CREATE TABLE lancamentos (id TEXT PRIMARY KEY, date TEXT, amount NUMERIC, description TEXT, payee TEXT, account_id TEXT,
    to_account_id TEXT, reserva_funcao_id TEXT, reserva_auto BOOLEAN, created_at TIMESTAMPTZ DEFAULT now());
  CREATE TABLE agendamentos (id TEXT PRIMARY KEY, start_date TEXT, amount NUMERIC, description TEXT, payee TEXT, account_id TEXT);
  INSERT INTO organizacoes (id, nome) VALUES ('org1', 'Org');
`

// Banco com contador de comandos (para provar que B nunca foi tocado).
const contagem = {}
function contado(nome, db) {
  contagem[nome] = 0
  return {
    query: (...a) => { contagem[nome]++; return db.query(...a) },
    exec: (...a) => { contagem[nome]++; return db.exec(...a) },
  }
}

const bancos = {}
const pedidos = [] // nomes de database que a fábrica recebeu
const qde = (nome) => async (sql, params = []) => (await bancos[nome].query(sql, params)).rows
const central = qde('central')

async function criarUsuario(nome, username, senha) {
  const q = qde(nome)
  const [u] = await q(`INSERT INTO usuarios (username, nome, email, senha_hash, nivel) VALUES ($1, $1, $2, $3, 'admin') RETURNING id`,
    [username, `${username}@teste.com`, bcrypt.hashSync(senha, 4)])
  await q("INSERT INTO membros (usuario_id, organizacao_id, papel) VALUES ($1, 'org1', 'admin')", [u.id])
  return u.id
}

beforeAll(async () => {
  bancos.central = new PGlite()
  await bancos.central.exec(SQL_CENTRAL)
  // O 'vm' do seed aponta para o neondb; aqui ele vai para um banco de teste — e o neondb NÃO existe
  // no mapa: se algo tentar abri-lo, a fábrica lança.
  await bancos.central.exec(`
    UPDATE ambientes SET database_name = 'banco_vm' WHERE sigla = 'vm';
    INSERT INTO ambientes (id, sigla, nome, database_name, status) VALUES
      ('amb-a', 'aa', 'Cliente A', 'banco_a', 'ativo'),
      ('amb-b', 'bb', 'Cliente B', 'banco_b', 'ativo'),
      ('amb-c', 'cc', 'Cliente C', 'banco_c', 'suspenso');`)
  for (const nome of ['banco_vm', 'banco_a', 'banco_b', 'banco_c']) {
    bancos[nome] = new PGlite()
    await bancos[nome].exec(MIGRACAO + TABELAS_APP)
  }
  await criarUsuario('banco_vm', 'victor', 'senha-vm-123')
  await criarUsuario('banco_a', 'ana', 'senha-a-123')
  await criarUsuario('banco_b', 'bruno', 'senha-b-123')
  await criarUsuario('banco_c', 'carla', 'senha-c-123')
  await qde('banco_a')("INSERT INTO lancamentos (id, date, amount, description) VALUES ('la1', '2026-10-01', 50, 'Mercado A')")
  await qde('banco_b')("INSERT INTO lancamentos (id, date, amount, description) VALUES ('lb1', '2026-10-01', 50, 'Mercado B')")
}, 180_000) // vários PGlite + migrações: com a suíte inteira em paralelo passa de 60 s

let envOriginal
beforeEach(() => {
  envOriginal = { ...process.env }
  process.env.JWT_SECRET = SECRET
  delete process.env.ALLOW_ENV_ADMIN
  const mapa = Object.fromEntries(Object.entries(bancos).map(([n, db]) => [n, contado(n, db)]))
  usarBancos(new Proxy(mapa, { has: (t, n) => { pedidos.push(n); return n in t } }))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { process.env = envOriginal; vi.restoreAllMocks() })
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
  const headers = { host }
  if (auth) headers.authorization = `Bearer ${auth}`
  await handler({ method, body, url, headers }, res)
  return res
}
const host = (sigla) => `${sigla}.finup.app.br`
const login = (h, username, password, ambiente) => chamar(authHandler, { url: '/api/auth', host: h, body: { username, password, ambiente } })
const decodificar = (t) => jwt.decode(t)
async function tokenDe(sigla, username, senha) {
  const r = await login(sigla === 'vm' ? 'www.finup.app.br' : host(sigla), username, senha, sigla)
  expect(r.statusCode).toBe(200)
  return r.body.token
}
const tokenManual = (amb, amb_sigla) => jwt.sign({ sub: 'x', org: 'org1', nivel: 'admin', username: 'x', origem: 'db', amb, amb_sigla }, SECRET, { expiresIn: '1h' })

describe('login por ambiente', () => {
  it('cada usuário entra só no próprio ambiente; token leva amb e amb_sigla', async () => {
    const t = decodificar(await tokenDe('aa', 'ana', 'senha-a-123'))
    expect(t).toMatchObject({ amb: 'amb-a', amb_sigla: 'aa', username: 'ana' })

    // usuário de A não loga no endereço de B, nem pelo www com ambiente B
    expect((await login(host('bb'), 'ana', 'senha-a-123')).statusCode).toBe(401)
    const r = await login('www.finup.app.br', 'ana', 'senha-a-123', 'bb')
    expect(r.statusCode).toBe(401)
    expect(r.body.error).toBe(ERRO_LOGIN)
  })

  it('ambiente inexistente, suspenso e senha errada → a mesma mensagem', async () => {
    const respostas = await Promise.all([
      login('www.finup.app.br', 'ana', 'senha-a-123', 'zz'),
      login(host('cc'), 'carla', 'senha-c-123'),
      login('www.finup.app.br', 'carla', 'senha-c-123', 'cc'),
      login(host('aa'), 'ana', 'errada-000'),
    ])
    for (const r of respostas) expect([r.statusCode, r.body.error]).toEqual([401, 'Usuário, senha ou ambiente inválidos'])
  })

  it('no www, ambiente VM (ou vazio) continua no www com token; campo Ambiente é ignorado no subdomínio', async () => {
    const r = await login('www.finup.app.br', 'victor', 'senha-vm-123', 'VM')
    expect(r.body.redirect).toBeUndefined()
    expect(decodificar(r.body.token).amb_sigla).toBe('vm')
    expect(decodificar((await login('www.finup.app.br', 'victor', 'senha-vm-123')).body.token).amb_sigla).toBe('vm')
    // localhost / vercel.app usam AMBIENTE_PADRAO
    expect(decodificar((await login('localhost:5173', 'victor', 'senha-vm-123')).body.token).amb_sigla).toBe('vm')
    // em aa.finup.app.br o ambiente é o do endereço, mesmo que o corpo diga outro
    expect(decodificar((await login(host('aa'), 'ana', 'senha-a-123', 'bb')).body.token).amb_sigla).toBe('aa')
  })

  it('login fixo de emergência só vale no ambiente vm', async () => {
    Object.assign(process.env, { ALLOW_ENV_ADMIN: 'true', ADMIN_USER: 'emergencia', ADMIN_PASS: 'senha-fixa-123' })
    const vm = await login('www.finup.app.br', 'emergencia', 'senha-fixa-123', 'vm')
    expect(vm.statusCode).toBe(200)
    expect(decodificar(vm.body.token)).toMatchObject({ origem: 'env', amb_sigla: 'vm' })
    expect((await login(host('aa'), 'emergencia', 'senha-fixa-123')).statusCode).toBe(401)
  })

  it('bloqueio por tentativas fica no banco do ambiente', async () => {
    await criarUsuario('banco_b', 'beto', 'senha-beto-1')
    for (let i = 0; i < 5; i++) await login(host('bb'), 'beto', 'errada')
    const [b] = await qde('banco_b')("SELECT tentativas_falhas, bloqueado_ate FROM usuarios WHERE username = 'beto'")
    expect(b.bloqueado_ate).not.toBeNull()
    expect((await login(host('bb'), 'beto', 'senha-beto-1')).statusCode).toBe(401)
  })
})

describe('token × endereço', () => {
  it('token de A no endereço de B → 401; token de cliente no www → 401; token do vm no cliente → 401', async () => {
    const a = await tokenDe('aa', 'ana', 'senha-a-123')
    const vm = await tokenDe('vm', 'victor', 'senha-vm-123')
    expect((await chamar(pingHandler, { method: 'GET', host: host('aa'), auth: a })).statusCode).toBe(200)
    expect((await chamar(pingHandler, { method: 'GET', host: host('bb'), auth: a })).statusCode).toBe(401)
    expect((await chamar(pingHandler, { method: 'GET', host: 'www.finup.app.br', auth: a })).statusCode).toBe(401)
    expect((await chamar(pingHandler, { method: 'GET', host: 'localhost:5173', auth: a })).statusCode).toBe(401)
    expect((await chamar(pingHandler, { method: 'GET', host: host('aa'), auth: vm })).statusCode).toBe(401)
    expect((await chamar(pingHandler, { method: 'GET', host: 'www.finup.app.br', auth: vm })).statusCode).toBe(200)
  })

  it('token com amb_sigla certa mas amb (id) de outro ambiente → 401', async () => {
    expect((await chamar(pingHandler, { method: 'GET', host: host('aa'), auth: tokenManual('amb-b', 'aa') })).statusCode).toBe(401)
  })

  it('token antigo (sem amb) vale só como vm', async () => {
    const antigo = jwt.sign({ sub: 'x', org: 'org1', nivel: 'admin', username: 'victor', origem: 'db' }, SECRET, { expiresIn: '1h' })
    expect((await chamar(pingHandler, { method: 'GET', host: 'www.finup.app.br', auth: antigo })).statusCode).toBe(200)
    expect((await chamar(pingHandler, { method: 'GET', host: host('aa'), auth: antigo })).statusCode).toBe(401)
  })

  it('ambiente suspenso → 403 "Ambiente indisponível" (também quando suspende depois do login)', async () => {
    const r = await chamar(pingHandler, { method: 'GET', host: host('cc'), auth: tokenManual('amb-c', 'cc') })
    expect([r.statusCode, r.body.error]).toEqual([403, 'Ambiente indisponível'])

    const a = await tokenDe('aa', 'ana', 'senha-a-123')
    await central("UPDATE ambientes SET status = 'suspenso' WHERE id = 'amb-a'")
    _limparCacheAmbientes()
    try {
      const s = await chamar(pingHandler, { method: 'GET', host: host('aa'), auth: a })
      expect([s.statusCode, s.body.error]).toEqual([403, 'Ambiente indisponível'])
    } finally {
      await central("UPDATE ambientes SET status = 'ativo' WHERE id = 'amb-a'")
      _limparCacheAmbientes()
    }
  })
})

describe('isolamento dos dados', () => {
  it('sync com token de A grava só no banco A', async () => {
    const a = await tokenDe('aa', 'ana', 'senha-a-123')
    contagem.banco_b = 0
    const r = await chamar(syncHandler, { url: '/api/sync', host: host('aa'), auth: a, body: {
      type: 'section', table: 'lancamentos', upsert: [{ id: 'novo-a', date: '2026-10-02', amount: 10, description: 'Feira' }], delete: [],
    } })
    expect(r.statusCode).toBe(200)
    expect(r.body.written.upserted).toBe(1)
    expect(await qde('banco_a')("SELECT id FROM lancamentos WHERE id = 'novo-a'")).toHaveLength(1)
    expect(await qde('banco_b')("SELECT id FROM lancamentos WHERE id = 'novo-a'")).toHaveLength(0)
    expect(contagem.banco_b).toBe(0)
  })

  it('search com token de A só enxerga A', async () => {
    const a = await tokenDe('aa', 'ana', 'senha-a-123')
    contagem.banco_b = 0
    const r = await chamar(searchHandler, { url: '/api/search', host: host('aa'), auth: a, body: { text: 'Mercado' } })
    expect(r.statusCode).toBe(200)
    expect(r.body.transactions.map(t => t.description)).toEqual(['Mercado A'])
    expect(contagem.banco_b).toBe(0)
  })

  it('load com token de A nunca toca o banco B', async () => {
    const a = await tokenDe('aa', 'ana', 'senha-a-123')
    contagem.banco_a = 0
    contagem.banco_b = 0
    // As tabelas de teste são mínimas (o load pode responder 500 por falta de alguma); o que se
    // prova aqui é ONDE ele lê: só no banco A.
    await chamar(loadHandler, { method: 'GET', url: '/api/load', host: host('aa'), auth: a })
    expect(contagem.banco_a).toBeGreaterThan(0)
    expect(contagem.banco_b).toBe(0)
  })

  it('nada nunca pediu o neondb à fábrica de pools', () => {
    expect(pedidos).not.toContain('neondb')
  })
})

describe('código de passagem (www → <sigla>.finup.app.br)', () => {
  async function codigoDe() {
    const r = await login('www.finup.app.br', 'ana', 'senha-a-123', 'aa')
    expect(r.statusCode).toBe(200)
    expect(r.body.token).toBeUndefined()
    const m = /^https:\/\/aa\.finup\.app\.br\/entrar\?c=(.+)$/.exec(r.body.redirect)
    expect(m).not.toBeNull()
    return decodeURIComponent(m[1])
  }
  const trocar = (h, codigo) => chamar(authHandler, { url: '/api/auth?acao=trocar-codigo', host: h, body: { codigo } })

  it('troca uma vez só; o central guarda só o hash', async () => {
    const codigo = await codigoDe()
    const linhas = await central('SELECT codigo_hash, payload FROM login_handoff')
    expect(linhas.some(l => l.codigo_hash === codigo)).toBe(false)
    const r = await trocar(host('aa'), codigo)
    expect(r.statusCode).toBe(200)
    expect(decodificar(r.body.token)).toMatchObject({ amb: 'amb-a', amb_sigla: 'aa', username: 'ana' })
    const de_novo = await trocar(host('aa'), codigo)
    expect([de_novo.statusCode, de_novo.body.error]).toEqual([401, ERRO_CODIGO])
  })

  it('código de outro ambiente é recusado (e não é gasto)', async () => {
    const codigo = await codigoDe()
    expect((await trocar(host('bb'), codigo)).statusCode).toBe(401)
    expect((await trocar('www.finup.app.br', codigo)).statusCode).toBe(401)
    expect((await trocar(host('aa'), codigo)).statusCode).toBe(200)
  })

  it('código expirado (60 s) é recusado', async () => {
    const codigo = await codigoDe()
    const [{ segundos }] = await central('SELECT extract(epoch FROM expira_em - created_at)::int AS segundos FROM login_handoff ORDER BY created_at DESC LIMIT 1')
    expect(segundos).toBe(60)
    await central("UPDATE login_handoff SET expira_em = now() - interval '1 second' WHERE usado_em IS NULL")
    expect((await trocar(host('aa'), codigo)).statusCode).toBe(401)
  })

  it('código inexistente → 401', async () => {
    expect((await trocar(host('aa'), 'nao-existe')).statusCode).toBe(401)
  })
})

describe('sem contexto de ambiente', () => {
  it('query() fora de um ambiente lança — nunca cai num banco padrão', async () => {
    await expect(query('SELECT 1')).rejects.toBeInstanceOf(ErroSemAmbiente)
  })

  it('dentro de um ambiente, query() usa o banco dele', async () => {
    const [r] = await rodarNoAmbiente({ database_name: 'banco_a' }, () => query("SELECT description FROM lancamentos WHERE id = 'la1'"))
    expect(r.description).toBe('Mercado A')
  })
})

describe('todas as rotas protegidas usam comAmbiente', () => {
  const PUBLICAS = new Set(['auth.js', 'cadastro-publico.js', 'sigla-disponivel.js', 'senha.js'])
  const raiz = fileURLToPath(new URL('.', import.meta.url))
  const rotas = []
  ;(function varrer(dir) {
    for (const nome of readdirSync(dir)) {
      const p = join(dir, nome)
      if (nome.startsWith('_')) continue
      if (statSync(p).isDirectory()) varrer(p)
      else if (nome.endsWith('.js') && !nome.endsWith('.test.js')) rotas.push(relative(raiz, p).replace(/\\/g, '/'))
    }
  })(raiz)

  it('acha as rotas', () => { expect(rotas.length).toBeGreaterThan(40) })

  it.each(rotas)('%s', async (rota) => {
    const mod = await import(pathToFileURL(join(raiz, rota)).href)
    if (PUBLICAS.has(rota)) expect(mod.default?.comAmbiente).toBeUndefined()
    else expect(mod.default?.comAmbiente).toBe(true)
  }, 30_000)
})

describe('ensure*Schema(): "já rodei" por banco', () => {
  it('cada um roda nos DOIS bancos (não para depois do primeiro)', async () => {
    for (const nome of ['banco_e1', 'banco_e2']) {
      bancos[nome] = new PGlite()
      await bancos[nome].exec(MIGRACAO + TABELAS_APP)
    }
    usarBancos(bancos)
    const { ensureHistoricoSchema } = await import('./_historico.js')
    const { ensureTiposDocumentoSchema } = await import('./_tiposDocumento.js')
    const { ensureBemSchema } = await import('./_bem.js')
    const { ensureAtalhosSchema } = await import('./atalhos.js')
    const consultas = await import('./fluxo-consultas.js')
    const datas = await import('./fluxo-datas-provisorias.js')
    const provisorios = await import('./fluxo-provisorios.js')
    const integridade = await import('./integridade.js')
    const TABELAS = ['historico_alteracoes', 'tipos_documento', 'financing', 'atalhos_usuario', 'fluxo_consultas',
      'fluxo_datas_provisorias', 'fluxo_provisorios', 'pendencias_integridade']

    for (const nome of ['banco_e1', 'banco_e2']) {
      await rodarNoAmbiente({ database_name: nome }, async () => {
        await ensureHistoricoSchema()
        await ensureTiposDocumentoSchema()
        await ensureBemSchema()
        await ensureAtalhosSchema()
        await consultas.ensureSchema()
        await datas.ensureSchema()
        await provisorios.ensureSchema()
        await integridade.ensureSchema()
      })
      const existentes = (await qde(nome)("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")).map(r => r.table_name)
      expect(existentes, nome).toEqual(expect.arrayContaining(TABELAS))
    }
  }, 60_000)

  it('ensurePlataformaSchema: um registro por banco central', async () => {
    const { ensurePlataformaSchema } = await import('./_plataforma.js')
    const c1 = new PGlite()
    const c2 = new PGlite()
    for (const [nome, db] of [['central_um', c1], ['central_dois', c2]]) {
      _definirFabricaDePool(() => poolPGlite(db))
      process.env.CENTRAL_DATABASE_URL = `postgresql://t:t@localhost/${nome}`
      await ensurePlataformaSchema()
      const [r] = (await db.query("SELECT to_regclass('plataforma_clientes') AS t")).rows
      expect(r.t, nome).toBe('plataforma_clientes')
    }
  }, 60_000)
})
