import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prepararCentralNoMesmoBanco } from './_testes/pglite.js'

// Login (cadastro + login fixo de emergência) e API de usuários num Postgres de verdade (PGlite, em
// memória) criado pela PRÓPRIA migração. Os handlers rodam de verdade: só o _db.js aponta para o PGlite.
const estado = vi.hoisted(() => ({ db: null }))
vi.mock('./_db.js', () => ({
  query: async (sql, params = []) => (await estado.db.query(sql, params)).rows,
  parseBody: async (req) => req.body || {},
  withTransaction: (fn) => estado.db.transaction((tx) => fn(async (sql, params = []) => (await tx.query(sql, params)).rows)),
}))

const { autenticar, ERRO_LOGIN, default: authHandler } = await import('./auth.js')
const { default: usuariosHandler } = await import('./usuarios.js')

const MIGRACAO = readFileSync(fileURLToPath(new URL('../supabase/migrations/2026-10-14_usuarios.sql', import.meta.url)), 'utf-8')
  + readFileSync(fileURLToPath(new URL('../supabase/migrations/2026-10-17_niveis_acesso.sql', import.meta.url)), 'utf-8')
  + '\nCREATE TABLE IF NOT EXISTS perfis (id TEXT PRIMARY KEY, name TEXT, ordem INTEGER, created_at TIMESTAMPTZ DEFAULT now());'
const SECRET = 'segredo-de-teste'
const q = async (sql, params = []) => (await estado.db.query(sql, params)).rows
const AGORA = new Date('2026-10-14T12:00:00Z')
const depois = (min) => new Date(AGORA.getTime() + min * 60_000)
const ENV_ON = { ALLOW_ENV_ADMIN: 'true', ADMIN_USER: 'Emergencia', ADMIN_PASS: 'senha-fixa-123' }

function resposta() {
  return {
    statusCode: 200, body: undefined, headers: {},
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
    end() { return this },
    setHeader(k, v) { this.headers[k] = v },
  }
}
const token = (payload) => jwt.sign(payload, SECRET, { expiresIn: '1h' })
async function chamar(handler, { method = 'GET', body, url = '/api/usuarios', auth } = {}) {
  const res = resposta()
  await handler({ method, body, url, headers: auth ? { authorization: `Bearer ${auth}` } : {} }, res)
  return res
}

// Usuário do cadastro com hash de custo baixo (o compare usa o custo gravado no hash → teste rápido).
const NIVEL_DO_PAPEL = { admin: 'admin', usuario: 'operador', leitura: 'consulta' }
async function criarUsuario({ username, senha = 'senha-certa-1', papel = 'admin', nivel = NIVEL_DO_PAPEL[papel], ativo = true, org = 'org1', email = null, extra = {} }) {
  const [u] = await q('INSERT INTO usuarios (username, nome, senha_hash, ativo, email, nivel, permissoes, perfis_permitidos, trocar_senha) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
    [username, username.toUpperCase(), bcrypt.hashSync(senha, 4), ativo, email ?? `${username}@teste.com`, nivel,
      JSON.stringify(extra.permissoes || {}), JSON.stringify(extra.perfis ?? 'todos'), !!extra.trocar_senha])
  await q('INSERT INTO membros (usuario_id, organizacao_id, papel) VALUES ($1, $2, $3)', [u.id, org, papel])
  return u.id
}

// Custo 12 de verdade deixa a suíte lenta e rouba CPU dos outros testes com PGlite: aqui o hash usa
// custo 4 (o compare lê o custo do próprio hash, então o comportamento é o mesmo).
const hashReal = bcrypt.hash
let envOriginal
beforeEach(async () => {
  vi.spyOn(bcrypt, 'hash').mockImplementation((s) => hashReal(s, 4))
  envOriginal = { ...process.env }
  process.env.JWT_SECRET = SECRET
  delete process.env.ALLOW_ENV_ADMIN
  estado.db = new PGlite()
  await estado.db.exec(MIGRACAO)
  await prepararCentralNoMesmoBanco(() => estado.db)
  await q("INSERT INTO organizacoes (id, nome, created_at) VALUES ('org1', 'Victor', '2026-01-01'), ('org2', 'Outra', '2026-02-01')")
})
afterEach(() => {
  process.env = envOriginal
  vi.restoreAllMocks()
})

describe('migração', () => {
  it('é idempotente e grava username só em minúsculo', async () => {
    await estado.db.exec(MIGRACAO)
    await expect(q("INSERT INTO usuarios (username, senha_hash) VALUES ('Victor', 'x')")).rejects.toThrow()
    const [o] = await q("INSERT INTO organizacoes (nome) VALUES ('Nova') RETURNING id")
    expect(typeof o.id).toBe('string')
  })
})

describe('login por cadastro', () => {
  it('ok: payload com sub/org/papel/username/origem db; zera tentativas e grava último login', async () => {
    const id = await criarUsuario({ username: 'vmoreira' })
    await q('UPDATE usuarios SET tentativas_falhas = 3 WHERE id = $1', [id])
    const p = await autenticar(q, { username: ' VMoreira ', password: 'senha-certa-1' }, { env: {}, agora: AGORA })
    expect(p).toEqual({ sub: id, org: 'org1', papel: 'admin', nivel: 'admin', permissoes: {}, perfis: 'todos', trocarSenha: false, username: 'vmoreira', nome: 'VMOREIRA', origem: 'db' })
    const [u] = await q('SELECT tentativas_falhas, ultimo_login FROM usuarios WHERE id = $1', [id])
    expect(u.tentativas_falhas).toBe(0)
    expect(new Date(u.ultimo_login).toISOString()).toBe(AGORA.toISOString())
  })

  it('senha errada: recusa e conta a tentativa', async () => {
    const id = await criarUsuario({ username: 'vmoreira' })
    expect(await autenticar(q, { username: 'vmoreira', password: 'errada-xx' }, { env: {}, agora: AGORA })).toBeNull()
    expect((await q('SELECT tentativas_falhas FROM usuarios WHERE id = $1', [id]))[0].tentativas_falhas).toBe(1)
  })

  it('5 falhas bloqueiam por 15 minutos, mesmo com a senha certa; depois libera', async () => {
    await criarUsuario({ username: 'vmoreira' })
    for (let i = 0; i < 5; i++) await autenticar(q, { username: 'vmoreira', password: 'errada-xx' }, { env: {}, agora: AGORA })
    const [u] = await q("SELECT bloqueado_ate FROM usuarios WHERE username = 'vmoreira'")
    expect(new Date(u.bloqueado_ate).toISOString()).toBe(depois(15).toISOString())
    expect(await autenticar(q, { username: 'vmoreira', password: 'senha-certa-1' }, { env: {}, agora: depois(14) })).toBeNull()
    expect(await autenticar(q, { username: 'vmoreira', password: 'senha-certa-1' }, { env: {}, agora: depois(16) })).not.toBeNull()
  })

  it('usuário inativo não entra, nem com a senha certa', async () => {
    await criarUsuario({ username: 'vmoreira', ativo: false })
    expect(await autenticar(q, { username: 'vmoreira', password: 'senha-certa-1' }, { env: ENV_ON, agora: AGORA })).toBeNull()
  })

  it('handler: token de 12h com o payload; erro genérico 401', async () => {
    await criarUsuario({ username: 'vmoreira' })
    const ok = await chamar(authHandler, { method: 'POST', body: { username: 'vmoreira', password: 'senha-certa-1' } })
    const p = jwt.verify(ok.body.token, SECRET)
    expect(p).toMatchObject({ sub: expect.any(String), org: 'org1', papel: 'admin', username: 'vmoreira', origem: 'db' })
    expect(p.exp - p.iat).toBe(12 * 3600)
    const r = await chamar(authHandler, { method: 'POST', body: { username: 'vmoreira', password: 'errada-xx' } })
    expect(r.statusCode).toBe(401)
    expect(r.body).toEqual({ error: ERRO_LOGIN })
  })
})

describe('login fixo de emergência', () => {
  it('funciona com ALLOW_ENV_ADMIN=true: papel admin, org da primeira organização, origem env, loga o uso', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const p = await autenticar(q, { username: 'emergencia', password: 'senha-fixa-123' }, { env: ENV_ON, agora: AGORA })
    expect(p).toMatchObject({ sub: 'env:emergencia', org: 'org1', papel: 'admin', username: 'emergencia', origem: 'env' })
    expect(warn.mock.calls[0][0]).toMatch(/LOGIN VIA ADMIN FIXO.*2026-10-14T12:00:00/)
  })

  it('recusado com ALLOW_ENV_ADMIN=false ou ausente — mesma resposta genérica', async () => {
    for (const allow of ['false', undefined]) {
      const env = { ...ENV_ON, ALLOW_ENV_ADMIN: allow }
      expect(await autenticar(q, { username: 'emergencia', password: 'senha-fixa-123' }, { env, agora: AGORA })).toBeNull()
    }
    Object.assign(process.env, { ADMIN_USER: 'emergencia', ADMIN_PASS: 'senha-fixa-123', ALLOW_ENV_ADMIN: 'false' })
    const r = await chamar(authHandler, { method: 'POST', body: { username: 'emergencia', password: 'senha-fixa-123' } })
    expect(r.statusCode).toBe(401)
    expect(r.body).toEqual({ error: ERRO_LOGIN })
  })

  it('outro usuário do cadastro NÃO entra com o ADMIN_PASS', async () => {
    await criarUsuario({ username: 'gislaine', papel: 'usuario', email: 'g@exemplo.com' })
    for (const login of ['gislaine', 'g@exemplo.com']) {
      expect(await autenticar(q, { username: login, password: 'senha-fixa-123' }, { env: ENV_ON, agora: AGORA })).toBeNull()
    }
  })

  it('sem a migração (tabela usuarios inexistente) cai no login fixo com org null', async () => {
    estado.db = new PGlite()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const p = await autenticar(q, { username: 'emergencia', password: 'senha-fixa-123' }, { env: ENV_ON, agora: AGORA })
    expect(p).toMatchObject({ papel: 'admin', origem: 'env', org: null })
  }, 30_000) // PGlite novo dentro do teste: com a suíte inteira em paralelo passa dos 5 s padrão

  it('cria a organização "Victor" se ainda não houver nenhuma', async () => {
    await q('DELETE FROM organizacoes')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const p = await autenticar(q, { username: 'emergencia', password: 'senha-fixa-123' }, { env: ENV_ON, agora: AGORA })
    const orgs = await q('SELECT id, nome FROM organizacoes')
    expect(orgs).toEqual([{ id: p.org, nome: 'Victor' }])
  })

  it('5 falhas bloqueiam o login fixo por 15 minutos', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (let i = 0; i < 5; i++) await autenticar(q, { username: 'emergencia', password: 'errada' }, { env: ENV_ON, agora: AGORA })
    expect(await autenticar(q, { username: 'emergencia', password: 'senha-fixa-123' }, { env: ENV_ON, agora: depois(10) })).toBeNull()
    expect(await autenticar(q, { username: 'emergencia', password: 'senha-fixa-123' }, { env: ENV_ON, agora: depois(16) })).not.toBeNull()
  })
})

describe('transição: ADMIN_USER = vmoreira também cadastrado — as duas senhas valem', () => {
  const ENV_V = { ALLOW_ENV_ADMIN: 'true', ADMIN_USER: 'VMoreira', ADMIN_PASS: 'senha-fixa-123' }
  const entrar = (login, password, env = ENV_V, agora = AGORA) => autenticar(q, { username: login, password }, { env, agora })
  const cadastro = async (id) => (await q('SELECT tentativas_falhas, bloqueado_ate FROM usuarios WHERE id = $1', [id]))[0]
  let id
  beforeEach(async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    id = await criarUsuario({ username: 'vmoreira', papel: 'usuario', email: 'victor@exemplo.com' })
  })

  it('entra com a senha do cadastro (origem db)', async () => {
    expect(await entrar('vmoreira', 'senha-certa-1')).toMatchObject({ sub: id, nivel: 'operador', origem: 'db' })
  })

  it('entra com o ADMIN_PASS: origem env, token do próprio usuário, papel admin, tentativas intactas', async () => {
    await q('UPDATE usuarios SET tentativas_falhas = 2 WHERE id = $1', [id])
    const p = await entrar('vmoreira', 'senha-fixa-123')
    expect(p).toEqual({ sub: id, org: 'org1', papel: 'admin', nivel: 'admin', permissoes: {}, perfis: 'todos', trocarSenha: false, username: 'vmoreira', nome: 'VMOREIRA', origem: 'env' })
    expect((await cadastro(id)).tentativas_falhas).toBe(2)
  })

  it('bloqueado ou inativo no cadastro: o ADMIN_PASS ainda entra (recuperação); a senha do cadastro não', async () => {
    for (let i = 0; i < 5; i++) await entrar('vmoreira', 'errada-xx')
    expect(estaBloqueadoAgora(await cadastro(id))).toBe(true)
    expect(await entrar('vmoreira', 'senha-certa-1')).toBeNull()
    // O login fixo também contou as 5 falhas (bloqueio próprio): espera os 15 min dele.
    expect(await entrar('vmoreira', 'senha-fixa-123', ENV_V, depois(10))).toBeNull()
    await q('DELETE FROM login_bloqueios')
    expect(await entrar('vmoreira', 'senha-fixa-123', ENV_V, depois(10))).toMatchObject({ sub: id, origem: 'env' })
    await q('UPDATE usuarios SET ativo = false, tentativas_falhas = 0, bloqueado_ate = NULL WHERE id = $1', [id])
    expect(await entrar('vmoreira', 'senha-fixa-123')).toMatchObject({ sub: id, origem: 'env' })
    expect(await entrar('vmoreira', 'senha-certa-1')).toBeNull()
  })

  it('ALLOW_ENV_ADMIN=false: o ADMIN_PASS não funciona, só a senha do cadastro', async () => {
    const off = { ...ENV_V, ALLOW_ENV_ADMIN: 'false' }
    expect(await entrar('vmoreira', 'senha-fixa-123', off)).toBeNull()
    expect(await entrar('vmoreira', 'senha-certa-1', off)).toMatchObject({ origem: 'db' })
  })

  it('login pelo e-mail funciona com as duas senhas', async () => {
    expect(await entrar(' Victor@Exemplo.COM ', 'senha-certa-1')).toMatchObject({ sub: id, origem: 'db' })
    expect(await entrar('victor@exemplo.com', 'senha-fixa-123')).toMatchObject({ sub: id, origem: 'env', papel: 'admin' })
  })

  it('falhas: ADMIN_PASS com o login fixo bloqueado não conta tentativa no cadastro; senha errada conta nos dois', async () => {
    await entrar('vmoreira', 'errada-xx')
    expect((await cadastro(id)).tentativas_falhas).toBe(1)
    expect((await q('SELECT tentativas_falhas FROM login_bloqueios'))[0].tentativas_falhas).toBe(1)
    await q("UPDATE login_bloqueios SET bloqueado_ate = now() + interval '1 day'")
    expect(await entrar('vmoreira', 'senha-fixa-123', ENV_V, new Date())).toBeNull()
    expect((await cadastro(id)).tentativas_falhas).toBe(1)
  })
})

const estaBloqueadoAgora = (u) => !!u.bloqueado_ate && new Date(u.bloqueado_ate) > AGORA

describe('API /api/usuarios', () => {
  const admin = (id, extra = {}) => token({ sub: id, org: 'org1', papel: 'admin', username: 'vmoreira', origem: 'db', ...extra })

  it('GET nunca devolve senha_hash e só lista a organização do token', async () => {
    const id = await criarUsuario({ username: 'vmoreira' })
    await criarUsuario({ username: 'gislaine', papel: 'usuario' })
    await criarUsuario({ username: 'de-fora', org: 'org2' })
    const r = await chamar(usuariosHandler, { auth: admin(id) })
    expect(r.statusCode).toBe(200)
    expect(r.body.usuarios.map(u => u.username).sort()).toEqual(['gislaine', 'vmoreira'])
    for (const u of r.body.usuarios) expect(u).not.toHaveProperty('senha_hash')
    expect(JSON.stringify(r.body)).not.toMatch(/senha_hash|\$2[aby]\$/)
  })

  it('não-admin recebe 403; sem token, 401', async () => {
    for (const papel of ['usuario', 'leitura']) {
      const r = await chamar(usuariosHandler, { auth: token({ sub: 'x', org: 'org1', papel, username: 'x', origem: 'db' }) })
      expect(r.statusCode).toBe(403)
    }
    expect((await chamar(usuariosHandler, {})).statusCode).toBe(401)
  })

  it('POST cria usuário na organização; senha curta → 400; repetido → 409', async () => {
    const id = await criarUsuario({ username: 'vmoreira' })
    const curto = await chamar(usuariosHandler, { method: 'POST', auth: admin(id), body: { username: 'novo', nome: 'N', email: 'n@x.com', senha: '1234567' } })
    expect(curto.statusCode).toBe(400)
    const semEmail = await chamar(usuariosHandler, { method: 'POST', auth: admin(id), body: { username: 'novo', nome: 'N', senha: '12345678' } })
    expect(semEmail.statusCode).toBe(400)
    const r = await chamar(usuariosHandler, { method: 'POST', auth: admin(id), body: { username: 'Novo.User', nome: 'Novo', email: 'Novo@X.com', senha: '12345678', nivel: 'consulta', trocar_senha: true } })
    expect(r.body.usuario).toMatchObject({ username: 'novo.user', nome: 'Novo', email: 'novo@x.com', nivel: 'consulta', ativo: true, trocar_senha: true, perfis_permitidos: 'todos', criado_por: 'vmoreira' })
    expect(r.body.usuario).not.toHaveProperty('senha_hash')
    expect(await autenticar(q, { username: 'novo.user', password: '12345678' }, { env: {}, agora: AGORA })).toMatchObject({ nivel: 'consulta', org: 'org1', trocarSenha: true })
    const dup = await chamar(usuariosHandler, { method: 'POST', auth: admin(id), body: { username: 'novo.user', nome: 'N', email: 'outro@x.com', senha: '12345678' } })
    expect(dup.statusCode).toBe(409)
  }, 20_000)

  it('e-mail repetido é recusado na criação e na edição (sem diferenciar maiúsculas); formato inválido → 400', async () => {
    const id = await criarUsuario({ username: 'vmoreira', email: 'victor@exemplo.com' })
    const outro = await criarUsuario({ username: 'gislaine', papel: 'usuario' })
    const post = await chamar(usuariosHandler, { method: 'POST', auth: admin(id), body: { username: 'novo', nome: 'N', email: 'VICTOR@exemplo.com', senha: '12345678' } })
    expect(post.statusCode).toBe(409)
    const patch = await chamar(usuariosHandler, { method: 'PATCH', auth: admin(id), body: { id: outro, email: 'Victor@Exemplo.com' } })
    expect(patch.statusCode).toBe(409)
    const invalido = await chamar(usuariosHandler, { method: 'PATCH', auth: admin(id), body: { id: outro, email: 'sem-arroba' } })
    expect(invalido.statusCode).toBe(400)
    // O próprio e-mail não conta como repetido; e o banco também barra (índice único em lower(email)).
    const mesmo = await chamar(usuariosHandler, { method: 'PATCH', auth: admin(id), body: { id, email: 'Victor@exemplo.com' } })
    expect(mesmo.body.usuario.email).toBe('victor@exemplo.com')
    await expect(q("UPDATE usuarios SET email = 'VICTOR@EXEMPLO.COM' WHERE id = $1", [outro])).rejects.toThrow()
  })

  it('o único admin não se rebaixa nem se desativa; com outro admin ativo, pode', async () => {
    const id = await criarUsuario({ username: 'vmoreira' })
    for (const body of [{ id, nivel: 'operador' }, { id, ativo: false }]) {
      const r = await chamar(usuariosHandler, { method: 'PATCH', auth: admin(id), body })
      expect(r.statusCode).toBe(409)
    }
    await criarUsuario({ username: 'gislaine', papel: 'admin' })
    // com outro admin ativo, ainda não pode DESATIVAR a si mesmo
    const euMesmo = await chamar(usuariosHandler, { method: 'PATCH', auth: admin(id), body: { id, ativo: false } })
    expect(euMesmo.statusCode).toBe(409)
    expect(euMesmo.body.error).toMatch(/próprio usuário/)
    const r = await chamar(usuariosHandler, { method: 'PATCH', auth: admin(id), body: { id, nivel: 'operador' } })
    expect(r.body.usuario.nivel).toBe('operador')
    expect((await q('SELECT papel FROM membros WHERE usuario_id = $1', [id]))[0].papel).toBe('usuario')
  })

  it('PATCH edita, desbloqueia e redefine senha; usuário de outra organização → 404', async () => {
    const id = await criarUsuario({ username: 'vmoreira' })
    const outro = await criarUsuario({ username: 'gislaine', papel: 'usuario' })
    await q("UPDATE usuarios SET tentativas_falhas = 5, bloqueado_ate = now() + interval '1 hour' WHERE id = $1", [outro])
    const r = await chamar(usuariosHandler, { method: 'PATCH', auth: admin(id), body: { id: outro, nome: 'Gislaine', email: 'g@x.com', desbloquear: true } })
    expect(r.body.usuario).toMatchObject({ nome: 'Gislaine', email: 'g@x.com', tentativas_falhas: 0, bloqueado_ate: null })
    await chamar(usuariosHandler, { method: 'PATCH', auth: admin(id), body: { id: outro, novaSenha: 'nova-senha-9' } })
    expect(await autenticar(q, { username: 'gislaine', password: 'nova-senha-9' }, { env: {}, agora: new Date() })).not.toBeNull()
    const fora = await criarUsuario({ username: 'de-fora', org: 'org2' })
    expect((await chamar(usuariosHandler, { method: 'PATCH', auth: admin(id), body: { id: fora, nome: 'x' } })).statusCode).toBe(404)
  }, 20_000)

  it('trocar a própria senha: exige a atual; indisponível para o login fixo', async () => {
    const id = await criarUsuario({ username: 'gislaine', papel: 'leitura' })
    const auth = token({ sub: id, org: 'org1', papel: 'leitura', username: 'gislaine', origem: 'db' })
    const url = '/api/usuarios?acao=minha-senha'
    const errada = await chamar(usuariosHandler, { method: 'POST', url, auth, body: { senhaAtual: 'nao-e-essa', novaSenha: 'nova-senha-9' } })
    expect(errada.statusCode).toBe(400)
    const ok = await chamar(usuariosHandler, { method: 'POST', url, auth, body: { senhaAtual: 'senha-certa-1', novaSenha: 'nova-senha-9' } })
    expect(ok.body).toMatchObject({ ok: true })
    expect(jwt.verify(ok.body.token, SECRET)).toMatchObject({ sub: id, nivel: 'consulta', trocarSenha: false })
    expect(await autenticar(q, { username: 'gislaine', password: 'nova-senha-9' }, { env: {}, agora: AGORA })).not.toBeNull()
    const env = token({ sub: 'env:emergencia', org: 'org1', papel: 'admin', username: 'emergencia', origem: 'env' })
    const r = await chamar(usuariosHandler, { method: 'POST', url, auth: env, body: { senhaAtual: 'x', novaSenha: 'nova-senha-9' } })
    expect(r.statusCode).toBe(403)
  }, 20_000)
})

describe('middleware', () => {
  it('requireAuth preenche req.user; token antigo { user, role } continua aceito', async () => {
    const { requireAuth } = await import('./_auth.js')
    const req = { headers: { authorization: `Bearer ${token({ user: 'vmoreira', role: 'admin' })}` } }
    expect(requireAuth(req, resposta())).toBe(true)
    expect(req.user).toEqual({ id: 'env:vmoreira', orgId: null, nivel: 'admin', papel: 'admin', permissoes: {}, perfis: 'todos', username: 'vmoreira', nome: 'vmoreira', origem: 'env' })
  })
})

describe('níveis de acesso na API', () => {
  const tk = (nivel, extra = {}) => token({ sub: 'u1', org: 'org1', nivel, papel: nivel, username: 'u1', origem: 'db', ...extra })
  const reqDe = (auth, method, url) => ({ method, url, headers: { authorization: `Bearer ${auth}` } })

  it('Consulta: leitura passa; qualquer gravação devolve 403 (rotas de vários módulos)', async () => {
    const { requireAuth } = await import('./_auth.js')
    const consulta = tk('consulta')
    expect(requireAuth(reqDe(consulta, 'GET', '/api/load'), resposta())).toBe(true)
    expect(requireAuth(reqDe(consulta, 'POST', '/api/search'), resposta())).toBe(true)
    for (const [method, url] of [['POST', '/api/reserve-periods'], ['DELETE', '/api/fluxo-provisorios?id=1'], ['PUT', '/api/agendamentos'],
      ['POST', '/api/transactions-bulk-update'], ['POST', '/api/bem/criar'], ['POST', '/api/financiamento/parcela/x/pagar'], ['POST', '/api/integridade'],
      ['POST', '/api/historico'], ['POST', '/api/rota-nova-qualquer']]) {
      const res = resposta()
      expect(requireAuth(reqDe(consulta, method, url), res)).toBe(false)
      expect(res.statusCode).toBe(403)
    }
  })

  it('Operador grava nos módulos, mas não em Cadastros/Configurações; Admin grava tudo', async () => {
    const { requireAuth } = await import('./_auth.js')
    expect(requireAuth(reqDe(tk('operador'), 'POST', '/api/reserve-periods'), resposta())).toBe(true)
    expect(requireAuth(reqDe(tk('operador'), 'POST', '/api/tipos-documento'), resposta())).toBe(false)
    expect(requireAuth(reqDe(tk('operador'), 'POST', '/api/bem/migrate'), resposta())).toBe(false)
    expect(requireAuth(reqDe(tk('admin'), 'POST', '/api/bem/migrate'), resposta())).toBe(true)
  })

  it('Personalizado: só o que o JSON libera (incluir/editar/excluir implicam ver)', async () => {
    const { requireAuth } = await import('./_auth.js')
    const p = tk('personalizado', { permissoes: { fluxo: { incluir: true } } })
    expect(requireAuth(reqDe(p, 'POST', '/api/fluxo-provisorios'), resposta())).toBe(true)
    expect(requireAuth(reqDe(p, 'DELETE', '/api/fluxo-provisorios'), resposta())).toBe(false)
    expect(requireAuth(reqDe(p, 'POST', '/api/reserve-periods'), resposta())).toBe(false)
  })

  it('o JSON de permissões gravado é normalizado (só módulos conhecidos; ver implícito)', async () => {
    const id = await criarUsuario({ username: 'vmoreira' })
    const admin = token({ sub: id, org: 'org1', nivel: 'admin', papel: 'admin', username: 'vmoreira', origem: 'db' })
    const r = await chamar(usuariosHandler, { method: 'POST', auth: admin, body: {
      username: 'pers', nome: 'P', email: 'p@x.com', senha: '12345678', nivel: 'personalizado',
      permissoes: { agendamentos: { editar: true }, inventado: { ver: true } },
    } })
    expect(r.body.usuario.permissoes.agendamentos).toEqual({ ver: true, incluir: false, editar: true, excluir: false })
    expect(r.body.usuario.permissoes).not.toHaveProperty('inventado')
    const tokenLogin = await autenticar(q, { username: 'pers', password: '12345678' }, { env: {}, agora: AGORA })
    expect(tokenLogin.permissoes.agendamentos.editar).toBe(true)
  })
})
