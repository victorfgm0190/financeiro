import process from 'node:process'
import crypto from 'node:crypto'
import { Buffer } from 'node:buffer'
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import bcrypt from 'bcryptjs'
import { SQL_CENTRAL, SQL_MIGRACOES, usarBancos } from './_testes/pglite.js'
import { _definirFabricaDePool } from './_conexao.js'

// LINKS DE SENHA ("Esqueci minha senha" e convite) com o _db.js de verdade: um PGlite por database
// (central, vm, A, B, C suspenso). E-mail = fetch do Resend interceptado.

const { default: senhaHandler, RESPOSTA_ESQUECI, LIMITE_IP_POR_HORA, LIMITE_USUARIO_POR_HORA } = await import('./senha.js')
const { default: authHandler } = await import('./auth.js')
const { default: usuariosHandler } = await import('./usuarios.js')
const { ERRO_LINK } = await import('./_senhaTokens.js')

const SECRET = 'segredo-de-teste'
// Tabelas do app que as migrações alteram (o banco real vem de supabase/estrutura_base.sql).
const ANTES_DAS_MIGRACOES = 'CREATE TABLE IF NOT EXISTS configuracoes (id INTEGER PRIMARY KEY);\nCREATE TABLE IF NOT EXISTS lancamentos (id TEXT PRIMARY KEY, account_id TEXT);\n'
const TABELAS_APP = `
  CREATE TABLE IF NOT EXISTS perfis (id TEXT PRIMARY KEY, name TEXT, ordem INTEGER, created_at TIMESTAMPTZ DEFAULT now());
  INSERT INTO organizacoes (id, nome) VALUES ('org1', 'Org'), ('org2', 'Outra');
`
const bancos = {}
const qde = (nome) => async (sql, params = []) => (await bancos[nome].query(sql, params)).rows

async function criarUsuario(banco, username, { email = `${username}@teste.com`, nivel = 'admin', ativo = true, org = 'org1' } = {}) {
  const [u] = await qde(banco)(
    'INSERT INTO usuarios (username, nome, email, senha_hash, nivel, ativo) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [username, `${username[0].toUpperCase()}${username.slice(1)} Silva`, email, bcrypt.hashSync('senha-antiga-1', 4), nivel, ativo],
  )
  await qde(banco)('INSERT INTO membros (usuario_id, organizacao_id, papel) VALUES ($1, $2, $3)', [u.id, org, nivel === 'admin' ? 'admin' : 'usuario'])
  return u.id
}

const ids = {}
beforeAll(async () => {
  bancos.central = new PGlite()
  await bancos.central.exec(SQL_CENTRAL)
  await bancos.central.exec(`
    UPDATE ambientes SET database_name = 'banco_vm' WHERE sigla = 'vm';
    INSERT INTO ambientes (id, sigla, nome, database_name, status) VALUES
      ('amb-a', 'aa', 'Cliente A', 'banco_a', 'ativo'),
      ('amb-b', 'bb', 'Cliente B', 'banco_b', 'ativo'),
      ('amb-c', 'cc', 'Cliente C', 'banco_c', 'suspenso');`)
  for (const nome of ['banco_vm', 'banco_a', 'banco_b', 'banco_c']) {
    bancos[nome] = new PGlite()
    await bancos[nome].exec(ANTES_DAS_MIGRACOES + SQL_MIGRACOES + TABELAS_APP)
  }
  ids.victor = await criarUsuario('banco_vm', 'victor')
  ids.ana = await criarUsuario('banco_a', 'ana')
  ids.alice = await criarUsuario('banco_a', 'alice', { nivel: 'operador' })
  ids.semEmail = await criarUsuario('banco_a', 'semmail', { email: '' })
  ids.inativo = await criarUsuario('banco_a', 'inativo', { ativo: false })
  ids.outraOrg = await criarUsuario('banco_a', 'olga', { org: 'org2' })
  // MESMO login e e-mail em B: prova que nada atravessa de ambiente
  ids.anaB = await criarUsuario('banco_b', 'ana')
  ids.carla = await criarUsuario('banco_c', 'carla')
}, 180_000) // vários PGlite + migrações: com a suíte inteira em paralelo passa de 60 s

let envOriginal
let emails
beforeEach(async () => {
  envOriginal = { ...process.env }
  Object.assign(process.env, { JWT_SECRET: SECRET, RESEND_API_KEY: 're_teste', EMAIL_FROM: 'Finup <nao-responda@finup.app.br>' })
  delete process.env.ALLOW_ENV_ADMIN
  usarBancos(bancos)
  await qde('central')('DELETE FROM senha_pedidos')
  for (const b of ['banco_vm', 'banco_a', 'banco_b']) await qde(b)('DELETE FROM senha_tokens')
  emails = []
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
    emails.push(JSON.parse(init.body))
    return { ok: true, status: 200, json: async () => ({ id: `re-${emails.length}` }) }
  }))
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
let ipSeq = 0
async function chamar(handler, { method = 'POST', body, url, host = 'www.finup.app.br', auth, ip } = {}) {
  const res = resposta()
  const headers = { host, 'x-forwarded-for': ip || `10.0.0.${++ipSeq % 250}` }
  if (auth) headers.authorization = `Bearer ${auth}`
  await handler({ method, body, url, headers, query: Object.fromEntries(new URL(url, 'http://x').searchParams) }, res)
  return res
}
const host = (sigla) => (sigla === 'vm' ? 'www.finup.app.br' : `${sigla}.finup.app.br`)
const esqueci = (h, login, ambiente, ip) => chamar(senhaHandler, { url: '/api/senha?acao=esqueci', host: h, body: { login, ambiente }, ip })
const validar = (h, token) => chamar(senhaHandler, { method: 'GET', url: `/api/senha?acao=validar&token=${encodeURIComponent(token)}`, host: h })
const definir = (h, token, novaSenha) => chamar(senhaHandler, { url: '/api/senha?acao=definir', host: h, body: { token, novaSenha } })
const tokenDoEmail = (e) => e.text.match(/definir-senha\?token=([A-Za-z0-9_-]+)/)[1]
const urlDoEmail = (e) => e.text.match(/https:\/\/\S+\/definir-senha\?token=\S+/)[0]
const sha256 = (t) => crypto.createHash('sha256').update(t).digest('hex')
async function login(sigla, username, password) {
  return chamar(authHandler, { url: '/api/auth', host: host(sigla), body: { username, password, ambiente: sigla } })
}
async function pedirToken(sigla, username) {
  const r = await esqueci(host(sigla), username, sigla)
  expect(r.body).toEqual(RESPOSTA_ESQUECI)
  expect(emails).toHaveLength(1)
  return tokenDoEmail(emails.pop())
}

describe('esqueci minha senha', () => {
  it('gera link no ambiente do endereço, envia para o e-mail cadastrado e grava SÓ o hash', async () => {
    const r = await esqueci(host('aa'), 'ANA@teste.com ')
    expect(r.statusCode).toBe(200)
    expect(r.body).toEqual(RESPOSTA_ESQUECI)
    expect(emails).toHaveLength(1)
    const [e] = emails
    expect(e.to).toEqual(['ana@teste.com'])
    expect(e.subject).toBe('Redefinir sua senha do Finup')
    expect(e.text).toContain('1 hora')
    expect(e.text).toContain('Se não foi você, ignore este e-mail')
    expect(e.html).toContain('Criar nova senha')
    expect(urlDoEmail(e)).toMatch(/^https:\/\/aa\.finup\.app\.br\/definir-senha\?token=/)

    const token = tokenDoEmail(e)
    expect(Buffer.from(token, 'base64url')).toHaveLength(32)
    const linhas = await qde('banco_a')('SELECT * FROM senha_tokens')
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toMatchObject({ usuario_id: ids.ana, token_hash: sha256(token), tipo: 'redefinir', usado_em: null })
    expect(JSON.stringify(linhas)).not.toContain(token)
    expect(new Date(linhas[0].expira_em) - new Date(linhas[0].criado_em)).toBe(60 * 60 * 1000)
    // o mesmo login existe em B, mas B não foi tocado
    expect(await qde('banco_b')('SELECT * FROM senha_tokens')).toHaveLength(0)
  })

  it('no www usa o campo Ambiente; o link aponta para o endereço do ambiente', async () => {
    await esqueci('www.finup.app.br', 'ana', 'AA')
    expect(urlDoEmail(emails.pop())).toMatch(/^https:\/\/aa\.finup\.app\.br\//)
    await esqueci('www.finup.app.br', 'victor', '')
    expect(urlDoEmail(emails.pop())).toMatch(/^https:\/\/www\.finup\.app\.br\/definir-senha\?token=/)
    await esqueci('financeiro-gnsm.vercel.app', 'victor')
    expect(urlDoEmail(emails.pop())).toMatch(/^https:\/\/www\.finup\.app\.br\//)
  })

  it('resposta IGUAL e nenhum e-mail para login/ambiente inexistente, suspenso, sem e-mail ou inativo', async () => {
    // em sequência: o PGlite é uma conexão só (transações simultâneas se misturariam)
    const casos = [
      [host('aa'), 'ninguem'],
      ['www.finup.app.br', 'ana', 'zz'],
      ['zz.finup.app.br', 'ana'],
      [host('cc'), 'carla'],
      [host('aa'), 'semmail'],
      [host('aa'), 'inativo'],
      [host('aa'), ''],
      ['www.finup.app.br', 'ana', 'vm'], // ana não existe no vm
    ]
    for (const c of casos) {
      const r = await esqueci(...c)
      expect(r.statusCode).toBe(200)
      expect(r.body).toEqual(RESPOSTA_ESQUECI)
    }
    expect(console.error).not.toHaveBeenCalled()
    expect(emails).toHaveLength(0)
  })

  it('falha do Resend não muda a resposta', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })))
    const r = await esqueci(host('aa'), 'ana')
    expect(r.body).toEqual(RESPOSTA_ESQUECI)
  })

  it(`limite: ${LIMITE_IP_POR_HORA} por hora por IP (conta mesmo login inexistente; mesma resposta, sem e-mail acima)`, async () => {
    for (let i = 0; i < LIMITE_IP_POR_HORA; i++) {
      const r = await esqueci(host('aa'), `ninguem${i}`, null, '192.168.0.1')
      expect(r.body).toEqual(RESPOSTA_ESQUECI)
    }
    const barrado = await esqueci(host('aa'), 'ana', null, '192.168.0.1')
    expect(barrado.body).toEqual(RESPOSTA_ESQUECI)
    expect(emails).toHaveLength(0)
    // outro IP continua podendo
    await esqueci(host('aa'), 'ana', null, '192.168.0.2')
    expect(emails).toHaveLength(1)
    // resultado gravado em cada pedido (quadro "Tentativas de senha")
    const res = (await qde('central')("SELECT resultado, count(*)::int AS n FROM senha_pedidos WHERE chave LIKE 'ip:%' GROUP BY 1 ORDER BY 1"))
    expect(res).toEqual([
      { resultado: 'bloqueado_ip', n: 1 }, { resultado: 'enviado', n: 1 }, { resultado: 'nao_encontrado', n: LIMITE_IP_POR_HORA },
    ])
  })

  it(`limite: ${LIMITE_USUARIO_POR_HORA} por hora por usuário, de qualquer IP e por usuário ou e-mail`, async () => {
    for (let i = 0; i < LIMITE_USUARIO_POR_HORA + 2; i++) await esqueci(host('aa'), i % 2 ? 'ana' : 'ana@teste.com', null, `172.16.0.${i}`)
    expect(emails).toHaveLength(LIMITE_USUARIO_POR_HORA)
    expect((await qde('central')("SELECT count(*)::int AS n FROM senha_pedidos WHERE chave LIKE 'ip:%' AND resultado = 'bloqueado_usuario'"))[0].n).toBe(2)
    // o limite é do usuário NAQUELE ambiente: a "ana" de B não foi afetada
    await esqueci(host('bb'), 'ana', null, '172.16.1.1')
    expect(emails).toHaveLength(LIMITE_USUARIO_POR_HORA + 1)
    // pedidos com mais de 1 hora não contam
    await qde('central')("UPDATE senha_pedidos SET criado_em = now() - interval '61 minutes'")
    await esqueci(host('aa'), 'ana', null, '172.16.2.1')
    expect(emails).toHaveLength(LIMITE_USUARIO_POR_HORA + 2)
  })
})

describe('validar e definir', () => {
  it('validar → nome e tipo; definir grava a senha, zera tentativas/bloqueio e tira "trocar senha"', async () => {
    await qde('banco_a')("UPDATE usuarios SET tentativas_falhas = 5, bloqueado_ate = now() + interval '10 minutes', trocar_senha = true WHERE id = $1", [ids.ana])
    const token = await pedirToken('aa', 'ana')
    const v = await validar(host('aa'), token)
    expect(v.statusCode).toBe(200)
    expect(v.body).toEqual({ ok: true, nome: 'Ana Silva', tipo: 'redefinir' })

    const d = await definir(host('aa'), token, 'nova-senha-123')
    expect(d.statusCode).toBe(200)
    const [u] = await qde('banco_a')('SELECT senha_hash, tentativas_falhas, bloqueado_ate, trocar_senha FROM usuarios WHERE id = $1', [ids.ana])
    expect(bcrypt.compareSync('nova-senha-123', u.senha_hash)).toBe(true)
    expect(u).toMatchObject({ tentativas_falhas: 0, bloqueado_ate: null, trocar_senha: false })
    const [t] = await qde('banco_a')('SELECT usado_em FROM senha_tokens')
    expect(t.usado_em).not.toBeNull()

    expect((await login('aa', 'ana', 'nova-senha-123')).statusCode).toBe(200)
    expect((await login('aa', 'ana', 'senha-antiga-1')).statusCode).toBe(401)
    // a "ana" de B continua com a senha dela
    expect((await login('bb', 'ana', 'senha-antiga-1')).statusCode).toBe(200)
  })

  it('reutilizado → 410', async () => {
    const token = await pedirToken('aa', 'ana')
    expect((await definir(host('aa'), token, 'nova-senha-123')).statusCode).toBe(200)
    const r = await definir(host('aa'), token, 'outra-senha-456')
    expect(r.statusCode).toBe(410)
    expect(r.body.error).toBe(ERRO_LINK)
    expect((await validar(host('aa'), token)).statusCode).toBe(410)
  })

  it('expirado → 410', async () => {
    const token = await pedirToken('aa', 'ana')
    await qde('banco_a')("UPDATE senha_tokens SET expira_em = now() - interval '1 second'")
    expect((await validar(host('aa'), token)).statusCode).toBe(410)
    expect((await definir(host('aa'), token, 'nova-senha-123')).statusCode).toBe(410)
  })

  it('pedir de novo invalida o link anterior do MESMO usuário (o de outro usuário continua valendo)', async () => {
    const t1 = await pedirToken('aa', 'ana')
    const tAlice = await pedirToken('aa', 'alice')
    const t2 = await pedirToken('aa', 'ana')
    expect((await validar(host('aa'), t1)).statusCode).toBe(410)
    expect((await validar(host('aa'), t2)).statusCode).toBe(200)
    expect((await validar(host('aa'), tAlice)).body).toMatchObject({ ok: true, nome: 'Alice Silva' })
  })

  it('token de outro usuário só muda a senha DO DONO do token', async () => {
    const tAlice = await pedirToken('aa', 'alice')
    const [antes] = await qde('banco_a')('SELECT senha_hash FROM usuarios WHERE id = $1', [ids.ana])
    expect((await definir(host('aa'), tAlice, 'senha-da-alice-1')).statusCode).toBe(200)
    const [depois] = await qde('banco_a')('SELECT senha_hash FROM usuarios WHERE id = $1', [ids.ana])
    expect(depois.senha_hash).toBe(antes.senha_hash)
    expect((await login('aa', 'alice', 'senha-da-alice-1')).statusCode).toBe(200)
    expect((await login('aa', 'ana', 'senha-da-alice-1')).statusCode).toBe(401)
  })

  it('token de OUTRO AMBIENTE não vale (nem no www) e não é gasto', async () => {
    const token = await pedirToken('aa', 'ana')
    for (const h of [host('bb'), 'www.finup.app.br', 'financeiro-gnsm.vercel.app', host('cc')]) {
      expect((await validar(h, token)).statusCode).toBe(410)
      expect((await definir(h, token, 'invasor-123456')).statusCode).toBe(410)
    }
    const [b] = await qde('banco_b')('SELECT senha_hash FROM usuarios WHERE id = $1', [ids.anaB])
    expect(bcrypt.compareSync('senha-antiga-1', b.senha_hash)).toBe(true)
    // no endereço certo continua valendo
    expect((await definir(host('aa'), token, 'nova-senha-123')).statusCode).toBe(200)
  })

  it('senha curta → 400 e o link continua valendo', async () => {
    const token = await pedirToken('aa', 'ana')
    const r = await definir(host('aa'), token, '1234567')
    expect(r.statusCode).toBe(400)
    expect(r.body.error).toMatch(/pelo menos 8/)
    expect((await validar(host('aa'), token)).statusCode).toBe(200)
  })

  it('usuário desativado depois do pedido → o link deixa de valer', async () => {
    const token = await pedirToken('aa', 'alice')
    await qde('banco_a')('UPDATE usuarios SET ativo = false WHERE id = $1', [ids.alice])
    try {
      expect((await validar(host('aa'), token)).statusCode).toBe(410)
      expect((await definir(host('aa'), token, 'nova-senha-123')).statusCode).toBe(410)
    } finally {
      await qde('banco_a')('UPDATE usuarios SET ativo = true WHERE id = $1', [ids.alice])
    }
  })

  it('token inexistente ou vazio → 410', async () => {
    expect((await validar(host('aa'), 'x'.repeat(43))).statusCode).toBe(410)
    expect((await validar(host('aa'), '')).statusCode).toBe(410)
    expect((await definir(host('aa'), '', 'nova-senha-123')).statusCode).toBe(410)
  })
})

describe('convite (admin)', () => {
  const tokenAdmin = async (sigla, username, senha) => {
    await qde(sigla === 'aa' ? 'banco_a' : 'banco_vm')('UPDATE usuarios SET senha_hash = $2 WHERE username = $1', [username, bcrypt.hashSync(senha, 4)])
    const r = await login(sigla, username, senha)
    expect(r.statusCode).toBe(200)
    return r.body.token
  }
  const convidar = (sigla, auth, id) => chamar(usuariosHandler, { url: '/api/usuarios?acao=enviar-convite', host: host(sigla), auth, body: { id } })

  it('admin envia: e-mail com usuário, ambiente e link de 48 h para o endereço do ambiente', async () => {
    const auth = await tokenAdmin('aa', 'ana', 'senha-ana-123')
    const r = await convidar('aa', auth, ids.alice)
    expect(r.statusCode).toBe(200)
    expect(r.body).toEqual({ ok: true, email: 'alice@teste.com' })
    const [e] = emails
    expect(e.subject).toBe('Crie sua senha de acesso ao Finup')
    expect(e.text).toContain('Usuário: alice')
    expect(e.text).toContain('Ambiente: AA')
    expect(e.text).toContain('48 horas')
    expect(e.html).toContain('Criar minha senha')
    expect(urlDoEmail(e)).toMatch(/^https:\/\/aa\.finup\.app\.br\/definir-senha\?token=/)
    const token = tokenDoEmail(e)
    const [t] = await qde('banco_a')('SELECT token_hash, tipo, expira_em, criado_em FROM senha_tokens WHERE usuario_id = $1', [ids.alice])
    expect(t.token_hash).toBe(sha256(token))
    expect(new Date(t.expira_em) - new Date(t.criado_em)).toBe(48 * 60 * 60 * 1000)
    expect((await validar(host('aa'), token)).body).toEqual({ ok: true, nome: 'Alice Silva', tipo: 'convite' })
    expect((await validar(host('bb'), token)).statusCode).toBe(410)
  })

  it('no vm o link aponta para o www', async () => {
    const auth = await tokenAdmin('vm', 'victor', 'senha-vm-1234')
    expect((await convidar('vm', auth, ids.victor)).statusCode).toBe(200)
    expect(urlDoEmail(emails[0])).toMatch(/^https:\/\/www\.finup\.app\.br\/definir-senha\?token=/)
  })

  it('só admin; sem e-mail, inativo e de outra organização/ambiente são recusados', async () => {
    await qde('banco_a')('UPDATE usuarios SET senha_hash = $1 WHERE id = $2', [bcrypt.hashSync('senha-alice-1', 4), ids.alice])
    const operador = (await login('aa', 'alice', 'senha-alice-1')).body.token
    expect((await convidar('aa', operador, ids.ana)).statusCode).toBe(403)

    const auth = await tokenAdmin('aa', 'ana', 'senha-ana-123')
    expect((await convidar('aa', auth, ids.semEmail)).statusCode).toBe(409)
    expect((await convidar('aa', auth, ids.inativo)).statusCode).toBe(409)
    expect((await convidar('aa', auth, ids.outraOrg)).statusCode).toBe(404)
    expect((await convidar('aa', auth, ids.anaB)).statusCode).toBe(404) // id de B não existe em A
    expect((await convidar('bb', auth, ids.anaB)).statusCode).toBe(401) // token de A no endereço de B
    expect(emails).toHaveLength(0)
    expect(await qde('banco_a')('SELECT * FROM senha_tokens')).toHaveLength(0)
  })
})
