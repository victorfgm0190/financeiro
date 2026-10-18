import process from 'node:process'
import crypto from 'node:crypto'
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import jwt from 'jsonwebtoken'
import { SQL_CENTRAL, URL_CENTRAL_TESTE, poolPGlite } from './_testes/pglite.js'
import { _definirFabricaDePool } from './_conexao.js'
import { _limparCacheAmbientes } from './_central.js'
import { gerarIcs } from '../src/lib/agendaIcs.js'

// AGENDA NO CELULAR — rota pública /api/agenda e rota do dono /api/agenda-feed, com o central num
// PGlite. A fábrica de pool só conhece o CENTRAL e anota cada database aberto: qualquer tentativa
// de abrir o banco de um ambiente (banco_vm, banco_a…) falha e aparece em `abertos`.

const { default: agendaHandler } = await import('./agenda.js')
const { default: feedHandler } = await import('./agenda-feed.js')
const { cifrarToken, decifrarToken, chaveAgenda, aposEditarUsuario, hashTokenAgenda } = await import('./_agendaFeed.js')

const SECRET = 'segredo-de-teste'
const CHAVE = crypto.randomBytes(32).toString('base64')
let central
let abertos = []
const q = async (sql, params = []) => (await central.query(sql, params)).rows

beforeAll(async () => {
  central = new PGlite()
  await central.exec(SQL_CENTRAL)
  await central.exec(`
    UPDATE ambientes SET database_name = 'banco_vm' WHERE sigla = 'vm';
    INSERT INTO ambientes (id, sigla, nome, database_name, status) VALUES
      ('amb-a', 'aa', 'Cliente A', 'banco_a', 'ativo'),
      ('amb-c', 'cc', 'Cliente C', 'banco_c', 'suspenso');`)
  AMB_ID.vm = (await q("SELECT id FROM ambientes WHERE sigla = 'vm'"))[0].id
}, 60_000)

let envOriginal
beforeEach(async () => {
  envOriginal = { ...process.env }
  Object.assign(process.env, { JWT_SECRET: SECRET, AGENDA_TOKEN_KEY: CHAVE, CENTRAL_DATABASE_URL: URL_CENTRAL_TESTE, AMBIENTE_PADRAO: 'vm' })
  _limparCacheAmbientes()
  abertos = []
  _definirFabricaDePool((nome) => {
    abertos.push(nome)
    if (nome !== 'central') throw new Error(`teste: a rota tentou abrir o banco do ambiente "${nome}"`)
    return poolPGlite(central)
  })
  await q('DELETE FROM agenda_cache')
  await q('DELETE FROM agenda_feeds')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => { process.env = envOriginal; vi.restoreAllMocks() })

function resposta() {
  return {
    statusCode: 200, body: undefined, headers: {},
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
    send(b) { this.body = b; return this },
    end() { return this },
    setHeader(k, v) { this.headers[k.toLowerCase()] = v },
  }
}
const HOST = { vm: 'www.finup.app.br', aa: 'aa.finup.app.br', cc: 'cc.finup.app.br' }
const AMB_ID = { vm: null, aa: 'amb-a', cc: 'amb-c' }
async function chamar(handler, { method = 'GET', url, body, sigla = 'aa', host = HOST[sigla], auth } = {}) {
  const res = resposta()
  const headers = { host }
  if (auth) headers.authorization = `Bearer ${auth}`
  await handler({ method, url, body, headers }, res)
  return res
}
const token = ({ sigla = 'aa', sub = 'u-ana', nivel = 'admin', permissoes = {}, origem = 'db' } = {}) => jwt.sign(
  { sub, org: 'org1', nivel, permissoes, perfis: 'todos', username: sub, nome: sub, origem, amb: AMB_ID[sigla], amb_sigla: sigla },
  SECRET, { expiresIn: '1h' })

const ICS = (titulo = 'Aluguel — R$ 1.500,00') => gerarIcs({ tipo: 'despesa', eventos: [{ uid: 'ag-x-20261030@finup.app.br', data: '2026-10-30', titulo }] })
const criar = (opcoes = { tipos: ['despesa', 'receita'], mostrarValores: true }, extra = {}) =>
  chamar(feedHandler, { method: 'POST', url: '/api/agenda-feed?acao=criar', body: opcoes, auth: token(extra), ...extra })
const publicar = (conteudos, extra = {}) =>
  chamar(feedHandler, { method: 'POST', url: '/api/agenda-feed?acao=publicar', body: { conteudos }, auth: token(extra), ...extra })
const baixar = (t, tipo = 'despesa', sigla = 'aa') => chamar(agendaHandler, { url: `/api/agenda?t=${encodeURIComponent(t)}&tipo=${tipo}`, sigla })

describe('cifra do token (AES-256-GCM)', () => {
  it('ida e volta; chave errada ou valor adulterado → null; nunca o token em texto puro', () => {
    const chave = chaveAgenda()
    const c = cifrarToken('tok-123', chave)
    expect(c).not.toContain('tok-123')
    expect(decifrarToken(c, chave)).toBe('tok-123')
    expect(cifrarToken('tok-123', chave)).not.toBe(c) // iv novo a cada cifragem
    expect(decifrarToken(c, crypto.randomBytes(32))).toBeNull()
    expect(decifrarToken(c.slice(0, -2) + 'AA', chave)).toBeNull()
  })
  it('AGENDA_TOKEN_KEY aceita base64/base64url/hex de 32 bytes; o resto é "sem chave"', () => {
    const b = crypto.randomBytes(32)
    expect(chaveAgenda({ AGENDA_TOKEN_KEY: b.toString('base64') })).toEqual(b)
    expect(chaveAgenda({ AGENDA_TOKEN_KEY: b.toString('base64url') })).toEqual(b)
    expect(chaveAgenda({ AGENDA_TOKEN_KEY: b.toString('hex') })).toEqual(b)
    expect(chaveAgenda({ AGENDA_TOKEN_KEY: 'curta' })).toBeNull()
    expect(chaveAgenda({})).toBeNull()
  })
})

describe('/api/agenda-feed (dono logado)', () => {
  it('sem AGENDA_TOKEN_KEY: GET avisa (configurado: false) e criar é recusado', async () => {
    delete process.env.AGENDA_TOKEN_KEY
    const g = await chamar(feedHandler, { url: '/api/agenda-feed', auth: token() })
    expect(g.body).toEqual({ configurado: false, feed: null })
    const c = await criar()
    expect(c.statusCode).toBe(503)
    expect((await q('SELECT count(*)::int AS n FROM agenda_feeds'))[0].n).toBe(0)
  })

  it('criar: grava só hash + token cifrado; o dono vê o MESMO link depois (outro aparelho)', async () => {
    const c = await criar()
    expect(c.statusCode).toBe(200)
    const t = c.body.feed.token
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const [linha] = await q('SELECT * FROM agenda_feeds')
    expect(linha.token_hash).toBe(hashTokenAgenda(t))
    expect(JSON.stringify(linha)).not.toContain(t)
    const g = await chamar(feedHandler, { url: '/api/agenda-feed', auth: token() })
    expect(g.body.configurado).toBe(true)
    expect(g.body.feed.token).toBe(t)
    expect(g.body.feed.tipos).toEqual(['despesa', 'receita'])
  })

  it('login de emergência não tem feed', async () => {
    const c = await criar(undefined, { origem: 'env' })
    expect(c.statusCode).toBe(403)
  })

  it('publicar exige VCALENDAR; tipos fora do feed são ignorados', async () => {
    await criar({ tipos: ['despesa'], mostrarValores: true })
    expect((await publicar({ despesa: '<html>' })).statusCode).toBe(400)
    const p = await publicar({ despesa: ICS(), receita: ICS() })
    expect(Object.keys(p.body.gravados)).toEqual(['despesa'])
  })

  it('sem permissão de ver agendamentos, publicar grava o calendário VAZIO', async () => {
    const semAg = { nivel: 'personalizado', permissoes: { agendamentos: { ver: false } } }
    const c = await criar(undefined, semAg)
    await publicar({ despesa: ICS() }, semAg)
    const r = await baixar(c.body.feed.token)
    expect(r.statusCode).toBe(200)
    expect(r.body).not.toContain('BEGIN:VEVENT')
    expect(r.body).toContain('X-WR-CALNAME:Finup Despesas')
  })

  it('um feed ativo por usuário; outros usuários e ambientes têm o seu', async () => {
    await criar()
    await criar(undefined, { sub: 'u-bia' })
    await criar(undefined, { sigla: 'vm', sub: 'u-ana' })
    const ativos = await q('SELECT ambiente_sigla, usuario_id FROM agenda_feeds WHERE revogado_em IS NULL ORDER BY 1, 2')
    expect(ativos).toEqual([
      { ambiente_sigla: 'aa', usuario_id: 'u-ana' }, { ambiente_sigla: 'aa', usuario_id: 'u-bia' }, { ambiente_sigla: 'vm', usuario_id: 'u-ana' },
    ])
  })

  it('não abre o banco do ambiente', async () => {
    await criar()
    await publicar({ despesa: ICS() })
    await chamar(feedHandler, { url: '/api/agenda-feed', auth: token() })
    expect([...new Set(abertos)]).toEqual(['central'])
  })
})

describe('/api/agenda (pública)', () => {
  async function feedPronto(opcoes) {
    const c = await criar(opcoes)
    await publicar({ despesa: ICS(), receita: gerarIcs({ tipo: 'receita', eventos: [] }) })
    return c.body.feed.token
  }

  it('token válido → .ics com Content-Type e Cache-Control pedidos', async () => {
    const t = await feedPronto()
    const r = await baixar(t)
    expect(r.statusCode).toBe(200)
    expect(r.headers['content-type']).toBe('text/calendar; charset=utf-8')
    expect(r.headers['cache-control']).toBe('s-maxage=3600, stale-while-revalidate=86400')
    expect(r.body).toContain('SUMMARY:Aluguel — R$ 1.500\\,00')
    const [f] = await q('SELECT ultimo_acesso_em FROM agenda_feeds WHERE revogado_em IS NULL')
    expect(f.ultimo_acesso_em).not.toBeNull()
  })

  it('NÃO abre conexão com o banco do ambiente (só o central)', async () => {
    const t = await feedPronto()
    abertos = []
    _definirFabricaDePool((nome) => {
      abertos.push(nome)
      if (nome !== 'central') throw new Error(`abriu ${nome}`)
      return poolPGlite(central)
    })
    for (const [tk, tipo, sigla] of [[t, 'despesa', 'aa'], [t, 'receita', 'aa'], ['invalido', 'despesa', 'aa'], [t, 'despesa', 'vm']]) {
      await baixar(tk, tipo, sigla)
    }
    expect(abertos).toEqual(['central'])
  })

  it('token revogado ("Gerar novo link") → 404; o novo funciona', async () => {
    const velho = await feedPronto()
    const novo = (await criar()).body.feed.token
    await publicar({ despesa: ICS() })
    const r = await baixar(velho)
    expect(r.statusCode).toBe(404)
    expect(r.body).toBeUndefined()
    expect(r.headers['cache-control']).toBe('s-maxage=3600, stale-while-revalidate=86400')
    expect((await baixar(novo)).statusCode).toBe(200)
  })

  it('ambiente errado (outro endereço) → 404', async () => {
    const t = await feedPronto()
    expect((await baixar(t, 'despesa', 'vm')).statusCode).toBe(404)
    expect((await baixar(t, 'despesa', 'cc')).statusCode).toBe(404)
  })

  it('ambiente suspenso → 404', async () => {
    const t = await feedPronto()
    await q("UPDATE ambientes SET status = 'suspenso' WHERE sigla = 'aa'")
    try {
      expect((await baixar(t)).statusCode).toBe(404)
    } finally {
      await q("UPDATE ambientes SET status = 'ativo' WHERE sigla = 'aa'")
    }
  })

  it('token inválido, sem token, tipo desconhecido ou não escolhido → 404', async () => {
    const t = await feedPronto({ tipos: ['despesa'], mostrarValores: true })
    expect((await baixar('x'.repeat(43))).statusCode).toBe(404)
    expect((await chamar(agendaHandler, { url: '/api/agenda?tipo=despesa' })).statusCode).toBe(404)
    expect((await baixar(t, 'transferencia')).statusCode).toBe(404)
    expect((await baixar(t, 'receita')).statusCode).toBe(404)
  })

  it('regeneração: o app publica o .ics novo e a rota serve o novo', async () => {
    const t = await feedPronto()
    await publicar({ despesa: ICS('Aluguel — R$ 1.600,00') })
    expect((await baixar(t)).body).toContain('R$ 1.600\\,00')
  })

  it('usuário desativado → feed revogado (404); acesso mudou → cache apagado (404 até o dono abrir o app)', async () => {
    const t = await feedPronto()
    const u = { id: 'u-ana', ativo: true, nivel: 'admin', permissoes: {}, perfis_permitidos: 'todos' }
    expect(await aposEditarUsuario('aa', u, { ...u, nome: 'Ana S.' })).toBeNull()
    expect((await baixar(t)).statusCode).toBe(200)
    expect(await aposEditarUsuario('aa', u, { ...u, perfis_permitidos: ['p1'] })).toBe('cache_apagado')
    expect((await baixar(t)).statusCode).toBe(404)
    await publicar({ despesa: ICS() })
    expect((await baixar(t)).statusCode).toBe(200)
    expect(await aposEditarUsuario('aa', u, { ...u, ativo: false })).toBe('revogado')
    expect((await baixar(t)).statusCode).toBe(404)
  })
})
