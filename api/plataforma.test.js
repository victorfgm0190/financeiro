import process from 'node:process'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import jwt from 'jsonwebtoken'
import { prepararCentralNoMesmoBanco } from './_testes/pglite.js'

// Pedido público + Controle de Clientes num Postgres de verdade (PGlite). Os handlers rodam de
// verdade: só o _db.js aponta para o PGlite. (O provisionamento completo do ambiente — Neon, banco
// do cliente, kit, convite — está em api/provisionar.test.js; aqui o Aprovar só roda o 1º passo.)
const estado = vi.hoisted(() => ({ db: null }))
vi.mock('./_db.js', () => ({
  query: async (sql, params = []) => (params.length ? (await estado.db.query(sql, params)).rows : (await estado.db.exec(sql)).at(-1)?.rows ?? []),
  parseBody: async (req) => req.body || {},
  withTransaction: (fn) => estado.db.transaction((tx) => fn(async (sql, params = []) => (await tx.query(sql, params)).rows)),
}))

const { default: cadastroHandler, LIMITE_POR_HORA } = await import('./cadastro-publico.js')
const { default: clientesHandler } = await import('./clientes.js')
const { default: siglaHandler } = await import('./sigla-disponivel.js')
const { _resetSchemaPronto, ehAdminPlataforma } = await import('./_plataforma.js')
const { enviarEmail } = await import('./_email.js')
const { modeloBoasVindas } = await import('./_emailBoasVindas.js')

const MIGRACAO_USUARIOS = readFileSync(fileURLToPath(new URL('../supabase/migrations/2026-10-14_usuarios.sql', import.meta.url)), 'utf-8')
  + readFileSync(fileURLToPath(new URL('../supabase/migrations/2026-10-17_niveis_acesso.sql', import.meta.url)), 'utf-8')
const SECRET = 'segredo-de-teste'
const q = async (sql, params = []) => (await estado.db.query(sql, params)).rows

function resposta() {
  return {
    statusCode: 200, body: undefined, headers: {},
    status(c) { this.statusCode = c; return this },
    json(b) { this.body = b; return this },
    end() { return this },
    setHeader(k, v) { this.headers[k] = v },
  }
}
async function chamar(handler, { method = 'GET', body, url = '/api/x', auth, ip = '10.0.0.1' } = {}) {
  const res = resposta()
  const headers = { 'x-forwarded-for': `${ip}, 172.16.0.1` }
  if (auth) headers.authorization = `Bearer ${auth}`
  await handler({ method, body, url, headers }, res)
  return res
}
const token = (username, nivel = 'admin') => jwt.sign({ sub: `id-${username}`, org: 'org1', nivel, username, nome: username, origem: 'db' }, SECRET, { expiresIn: '1h' })
const VMOREIRA = () => token('vmoreira')

const PEDIDO = {
  nome: 'Maria da Silva Souza', email: 'maria@exemplo.com', telefone: '(11) 91234-5678', tipo_pessoa: 'PF',
  documento: '529.982.247-25', sigla: 'mss', como_conheceu: 'Indicação', aceite_termos: true, website: '',
}
const pedir = (extra = {}, ip) => chamar(cadastroHandler, { method: 'POST', url: '/api/cadastro-publico', body: { ...PEDIDO, ...extra }, ip })
const clientes = (opts = {}) => chamar(clientesHandler, { url: '/api/clientes', auth: VMOREIRA(), ...opts })

let envOriginal
beforeEach(async () => {
  envOriginal = { ...process.env }
  process.env.JWT_SECRET = SECRET
  process.env.PLATAFORMA_ADMIN = 'vmoreira'
  estado.db = new PGlite()
  await estado.db.exec(MIGRACAO_USUARIOS)
  await prepararCentralNoMesmoBanco(() => estado.db)
  _resetSchemaPronto()
})
afterEach(() => { process.env = envOriginal })

describe('pedido pelo formulário público', () => {
  it('grava como pedido e aparece no Controle de Clientes', async () => {
    const r = await pedir()
    expect(r.statusCode).toBe(200)
    expect(r.body).toEqual({ ok: true, mensagem: 'Recebemos seu pedido, entraremos em contato.' })

    const lista = await clientes()
    expect(lista.statusCode).toBe(200)
    expect(lista.body.novos).toBe(1)
    const [c] = lista.body.clientes
    expect(c).toMatchObject({
      nome: 'Maria da Silva Souza', email: 'maria@exemplo.com', telefone: '11912345678', documento: '52998224725',
      sigla: 'mss', status: 'pedido', origem: 'formulario', aceite_ip: '10.0.0.1',
    })
    expect(c.aceite_termos_em).toBeTruthy()
    const det = await clientes({ url: `/api/clientes?id=${c.id}` })
    expect(det.body.historico.map(h => h.evento)).toEqual(['pedido'])
  })

  it('recusa sigla repetida (com sugestão) e sigla reservada', async () => {
    await pedir()
    const repetida = await pedir({ email: 'outra@exemplo.com', documento: '111.444.777-35' }, '10.0.0.2')
    expect(repetida.statusCode).toBe(409)
    expect(repetida.body.error).toMatch(/em uso/)
    expect(repetida.body.sugestao).toBe('msso')

    const reservada = await pedir({ email: 'x@exemplo.com', sigla: 'admin' }, '10.0.0.3')
    expect(reservada.statusCode).toBe(400)
    expect(reservada.body.error).toMatch(/reservada/)
    expect((await q('SELECT count(*)::int AS n FROM plataforma_clientes'))[0].n).toBe(1)
  })

  it('recusa CPF e CNPJ inválidos, e PJ sem empresa', async () => {
    expect((await pedir({ documento: '529.982.247-24' })).body.error).toBe('CPF inválido')
    expect((await pedir({ documento: '111.111.111-11' }, '10.0.0.2')).body.error).toBe('CPF inválido')
    expect((await pedir({ tipo_pessoa: 'PJ', documento: '11.222.333/0001-80', empresa: 'Acme' }, '10.0.0.3')).body.error).toBe('CNPJ inválido')
    expect((await pedir({ tipo_pessoa: 'PJ', documento: '11.222.333/0001-81' }, '10.0.0.4')).body.error).toBe('Informe a empresa')
    const ok = await pedir({ tipo_pessoa: 'PJ', documento: '11.222.333/0001-81', empresa: 'Acme Ltda' }, '10.0.0.5')
    expect(ok.statusCode).toBe(200)
  })

  it('telefone: celular com 9; fixo só com "não é WhatsApp"; guarda só dígitos', async () => {
    expect((await pedir({ telefone: '(43) 3322-1100' })).body.error).toMatch(/não é WhatsApp/)
    expect((await pedir({ telefone: '(43) 89999-8888' }, '10.0.0.2')).body.error).toMatch(/Telefone inválido/)
    expect((await pedir({ telefone: '' }, '10.0.0.3')).body.error).toMatch(/Informe o telefone/)
    expect((await pedir({ telefone: '(43) 3322-1100', nao_whatsapp: true }, '10.0.0.4')).statusCode).toBe(200)
    expect((await pedir({ email: 'b@exemplo.com', sigla: 'bb', telefone: '+55 (43) 99999-8888' }, '10.0.0.5')).statusCode).toBe(200)
    const tels = (await q('SELECT telefone FROM plataforma_clientes ORDER BY created_at')).map(r => r.telefone)
    expect(tels).toEqual(['4333221100', '43999998888'])
  })

  it('aceita CNPJ alfanumérico e guarda em maiúsculas, sem máscara', async () => {
    const r = await pedir({ tipo_pessoa: 'PJ', documento: '12.abc.345/01de-35', empresa: 'Lumen Tech' })
    expect(r.statusCode).toBe(200)
    expect((await q('SELECT documento FROM plataforma_clientes'))[0].documento).toBe('12ABC34501DE35')
    const invalido = await pedir({ tipo_pessoa: 'PJ', documento: '12.ABC.345/01DE-36', empresa: 'X', email: 'y@y.com', sigla: 'yy' }, '10.0.0.2')
    expect(invalido.body.error).toBe('CNPJ inválido')
  })

  it('exige o aceite dos termos', async () => {
    const r = await pedir({ aceite_termos: false })
    expect(r.statusCode).toBe(400)
    expect(r.body.error).toMatch(/termos/)
  })

  it(`bloqueia o ${LIMITE_POR_HORA + 1}º pedido na mesma hora pelo mesmo IP`, async () => {
    for (let i = 0; i < LIMITE_POR_HORA; i++) {
      const r = await pedir({ email: `p${i}@exemplo.com`, sigla: `sig${i}` }, '10.9.9.9')
      expect(r.statusCode).toBe(200)
    }
    const quarto = await pedir({ email: 'p9@exemplo.com', sigla: 'sig9' }, '10.9.9.9')
    expect(quarto.statusCode).toBe(429)
    expect((await pedir({ email: 'p9@exemplo.com', sigla: 'sig9' }, '10.1.1.1')).statusCode).toBe(200)
    // Envio com mais de 1 hora não conta mais.
    await q("UPDATE plataforma_cadastro_envios SET created_at = now() - interval '2 hours' WHERE ip = '10.9.9.9'")
    expect((await pedir({ email: 'p10@exemplo.com', sigla: 'sig10' }, '10.9.9.9')).statusCode).toBe(200)
  })

  it('e-mail já existente e robô recebem a MESMA resposta, sem novo cadastro', async () => {
    const primeiro = await pedir()
    const repetido = await pedir({ nome: 'Outra Pessoa', sigla: 'op', documento: '111.444.777-35' }, '10.0.0.2')
    const robo = await pedir({ email: 'robo@exemplo.com', sigla: 'robo', website: 'http://spam' }, '10.0.0.3')
    expect(repetido.statusCode).toBe(200)
    expect(repetido.body).toEqual(primeiro.body)
    expect(robo.body).toEqual(primeiro.body)
    const rows = await q('SELECT email FROM plataforma_clientes')
    expect(rows).toEqual([{ email: 'maria@exemplo.com' }])
    const hist = await q('SELECT evento FROM plataforma_historico ORDER BY created_at')
    expect(hist.map(h => h.evento)).toEqual(['pedido', 'pedido_repetido'])
  })
})

describe('sigla pública', () => {
  it('checa disponibilidade e sugere pelas iniciais', async () => {
    await pedir()
    const ocupada = await chamar(siglaHandler, { url: '/api/sigla-disponivel?sigla=mss&nome=Maria%20da%20Silva%20Souza' })
    expect(ocupada.body).toEqual({ sigla: 'mss', disponivel: false, motivo: 'Essa sigla já está em uso', sugestao: 'msso' })
    const livre = await chamar(siglaHandler, { url: '/api/sigla-disponivel?sigla=Joao2' })
    expect(livre.body).toEqual({ sigla: 'joao2', disponivel: true })
    const reservada = await chamar(siglaHandler, { url: '/api/sigla-disponivel?sigla=www' })
    expect(reservada.body).toMatchObject({ disponivel: false, motivo: 'Essa sigla é reservada' })
    expect((await chamar(siglaHandler, { method: 'POST', url: '/api/sigla-disponivel' })).statusCode).toBe(405)
  })
})

describe('acesso ao Controle de Clientes', () => {
  it('admin comum (não PLATAFORMA_ADMIN) recebe 403 em tudo; sem token, 401', async () => {
    await pedir()
    const outro = token('gislaine', 'admin')
    for (const opts of [
      { url: '/api/clientes' }, { url: '/api/clientes?acao=resumo' },
      { method: 'POST', url: '/api/clientes', body: { nome: 'X', email: 'x@x.com', sigla: 'xx' } },
      { method: 'POST', url: '/api/clientes?acao=aprovar', body: { id: 'qualquer' } },
      { method: 'PATCH', url: '/api/clientes', body: { id: 'qualquer', nome: 'Y' } },
    ]) {
      const r = await chamar(clientesHandler, { ...opts, auth: outro })
      expect(r.statusCode).toBe(403)
    }
    expect((await chamar(clientesHandler, { url: '/api/clientes' })).statusCode).toBe(401)
    expect((await q("SELECT status FROM plataforma_clientes"))[0].status).toBe('pedido')
  })

  it('sem a variável PLATAFORMA_ADMIN ninguém entra', async () => {
    delete process.env.PLATAFORMA_ADMIN
    expect((await clientes()).statusCode).toBe(403)
    expect(ehAdminPlataforma({ username: 'vmoreira' }, {})).toBe(false)
    expect(ehAdminPlataforma({ username: 'VMoreira' }, { PLATAFORMA_ADMIN: ' vmoreira ' })).toBe(true)
  })
})

describe('aprovação e ciclo de status', () => {
  const idDoPedido = async () => (await q('SELECT id FROM plataforma_clientes LIMIT 1'))[0].id

  it('recusar, suspender, reativar e cancelar seguem as transições permitidas', async () => {
    await pedir()
    const id = await idDoPedido()
    const status = (acao, motivo) => clientes({ method: 'POST', url: '/api/clientes?acao=status', body: { id, acao, motivo } })

    expect((await status('suspender')).statusCode).toBe(409)
    expect((await status('recusar', 'Dados incompletos')).body.cliente.status).toBe('recusado')
    expect((await clientes({ method: 'POST', url: '/api/clientes?acao=aprovar', body: { id } })).body.cliente.status).toBe('aprovado')
    expect((await status('suspender')).body.cliente.status).toBe('suspenso')
    expect((await status('reativar')).body.cliente.status).toBe('aprovado')
    expect((await status('cancelar')).body.cliente.status).toBe('cancelado')
    expect((await clientes({ method: 'POST', url: '/api/clientes?acao=aprovar', body: { id } })).statusCode).toBe(409)
    const det = await clientes({ url: `/api/clientes?id=${id}` })
    expect(det.body.historico.find(h => h.evento === 'recusado').detalhe).toContain('Dados incompletos')
  })

  it('novo cliente manual e edição (sigla única, travada depois da aprovação)', async () => {
    await pedir()
    const novo = await clientes({ method: 'POST', url: '/api/clientes', body: { nome: 'João Pereira', email: 'joao@x.com', sigla: 'mss' } })
    expect(novo.statusCode).toBe(409)
    const ok = await clientes({ method: 'POST', url: '/api/clientes', body: { nome: 'João Pereira', email: 'joao@x.com', sigla: 'jp', plano: 'Básico', valor_mensal: '49,90', dia_vencimento: 10, limite_usuarios: 3 } })
    expect(ok.statusCode).toBe(200)
    expect(ok.body.cliente).toMatchObject({ origem: 'manual', status: 'pedido', valor_mensal: 49.9, dia_vencimento: 10, limite_usuarios: 3 })

    const id = ok.body.cliente.id
    const ed = await clientes({ method: 'PATCH', url: '/api/clientes', body: { id, observacoes: 'Ligar na segunda', status: 'ativo', sigla: 'joaop' } })
    expect(ed.body.cliente).toMatchObject({ observacoes: 'Ligar na segunda', status: 'pedido', sigla: 'joaop' })
    await clientes({ method: 'POST', url: '/api/clientes?acao=aprovar', body: { id } })
    const travada = await clientes({ method: 'PATCH', url: '/api/clientes', body: { id, sigla: 'outra' } })
    expect(travada.statusCode).toBe(409)
    expect((await clientes({ method: 'PATCH', url: '/api/clientes', body: { id, dia_vencimento: 40 } })).statusCode).toBe(400)
    // Edição: fixo só com "não é WhatsApp"; guarda só dígitos.
    expect((await clientes({ method: 'PATCH', url: '/api/clientes', body: { id, telefone: '(43) 3322-1100' } })).statusCode).toBe(400)
    const fixo = await clientes({ method: 'PATCH', url: '/api/clientes', body: { id, telefone: '(43) 3322-1100', nao_whatsapp: true } })
    expect(fixo.body.cliente.telefone).toBe('4333221100')
  })
})

describe('e-mail de boas-vindas (Resend)', () => {
  const respostaResend = (status, json) => vi.fn(async () => ({ ok: status < 300, status, json: async () => json }))
  const URL_CONVITE = 'https://cv.finup.app.br/definir-senha?token=abc123'
  beforeEach(async () => {
    await estado.db.waitReady
    process.env.RESEND_API_KEY = 're_chave_secreta'
    process.env.EMAIL_FROM = 'Finup <nao-responda@finup.app.br>'
  })
  afterEach(() => vi.unstubAllGlobals())

  it('modelo: assunto com a sigla, dados de acesso, botão "Criar minha senha" (48 h), rodapé e HTML escapado', () => {
    const m = modeloBoasVindas({ nome: 'Ana Lima', email: 'ana@x.com', sigla: 'cv' }, { url: URL_CONVITE })
    expect(m.assunto).toBe('Seu acesso ao Finup — ambiente CV')
    expect(m.texto).toContain('Acesse: https://finup.app.br\nAmbiente: CV\nUsuário: admin (ou o e-mail ana@x.com)\nEndereço do seu ambiente: https://cv.finup.app.br')
    expect(m.texto).toContain(`Criar minha senha: ${URL_CONVITE}`)
    expect(m.texto).toContain('48 horas')
    expect(m.texto).not.toMatch(/próxima etapa/)
    expect(m.html).not.toMatch(/próxima etapa/)
    expect(m.texto).toContain('Dúvidas? Responda este e-mail ou escreva para contato@finup.app.br')
    expect(m.html).toContain('Criar minha senha</a>')
    expect(m.html).toContain(`href="${URL_CONVITE}"`)
    expect(m.html).toContain('prefers-color-scheme: dark')
    expect(m.html).toContain('#0F6E56')
    // rótulo longo em linha própria, com o link embaixo (não encosta)
    expect(m.html).toMatch(/Endereço do seu ambiente<\/div>\s*<div[^>]*padding-top:4px[^>]*><a href="https:\/\/cv\.finup\.app\.br"/)
    const xss = modeloBoasVindas({ nome: '<i>Ana</i> Lima', email: 'a"b@x.com', sigla: 'cv' }, { url: URL_CONVITE }).html
    expect(xss).toContain('Olá, &lt;i&gt;Ana&lt;/i&gt;!')
    expect(xss).toContain('a&quot;b@x.com')
    expect(xss).not.toContain('<i>Ana')
  })

  it('modelo: "Instale o Finup no celular" com o endereço do PRÓPRIO ambiente (nunca o www), sem imagem nem script', () => {
    const m = modeloBoasVindas({ nome: 'Ana Lima', email: 'ana@x.com', sigla: 'cv' }, { url: URL_CONVITE })
    for (const t of [m.texto, m.html]) {
      expect(t).toContain('Instale o Finup no celular')
      expect(t).toContain('Não precisa baixar nada na loja de aplicativos')
      expect(t).toContain('Adicionar à Tela de Início')
      expect(t).toContain('Instalar app')
      expect(t).not.toContain('www.finup.app.br')
    }
    expect(m.texto).toContain('Ver passo a passo: https://cv.finup.app.br/instalar')
    expect(m.texto).toContain('iPhone: abra https://cv.finup.app.br no Safari')
    expect(m.texto).toContain('Android: abra https://cv.finup.app.br no Chrome')
    expect(m.html).toContain('href="https://cv.finup.app.br/instalar"')
    expect(m.html).toContain('Ver passo a passo</a>')
    // a seção vem DEPOIS do botão "Criar minha senha"
    expect(m.html.indexOf('Instale o Finup no celular')).toBeGreaterThan(m.html.indexOf('Criar minha senha</a>'))
    expect(m.texto.indexOf('Instale o Finup')).toBeGreaterThan(m.texto.indexOf('Criar minha senha:'))
    expect(m.html).not.toMatch(/<script|<img|javascript:/i)
    // outro cliente → o endereço dele
    expect(modeloBoasVindas({ nome: 'Bia', email: 'b@x.com', sigla: 'bb' }).texto).toContain('https://bb.finup.app.br/instalar')
  })

  it('sucesso: POST no Resend com Bearer e from/reply_to; log sem chave nem conteúdo', async () => {
    const fetch = respostaResend(200, { id: 'resend-123' })
    vi.stubGlobal('fetch', fetch)
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    const m = modeloBoasVindas({ nome: 'Maria', email: 'maria@exemplo.com', sigla: 'mss' }, { url: 'https://mss.finup.app.br/definir-senha?token=t' })
    expect(await enviarEmail({ para: 'maria@exemplo.com', assunto: m.assunto, html: m.html, texto: m.texto })).toEqual({ id: 'resend-123' })

    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer re_chave_secreta')
    expect(JSON.parse(init.body)).toMatchObject({
      from: 'Finup <nao-responda@finup.app.br>', to: ['maria@exemplo.com'], reply_to: 'contato@finup.app.br',
      subject: 'Seu acesso ao Finup — ambiente MSS',
    })
    const logado = JSON.stringify(log.mock.calls)
    expect(logado).toContain('resend-123')
    expect(logado).not.toContain('re_chave_secreta')
    expect(logado).not.toContain('token=t')
    log.mockRestore()
  })

  it('falha da API: erro com a mensagem do Resend', async () => {
    vi.stubGlobal('fetch', respostaResend(422, { name: 'validation_error', message: 'Invalid `to` field' }))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(enviarEmail({ para: 'a@b.com', assunto: 'x', html: '', texto: '' })).rejects.toThrow('Serviço de e-mail recusou o envio (422: Invalid `to` field)')
    expect(JSON.stringify(err.mock.calls)).not.toContain('re_chave_secreta')
    err.mockRestore()
  })

  it('chave ausente: erro claro, sem chamar o Resend', async () => {
    delete process.env.RESEND_API_KEY
    const fetch = respostaResend(200, { id: 'x' })
    vi.stubGlobal('fetch', fetch)
    await expect(enviarEmail({ para: 'a@b.com', assunto: 'x', html: '', texto: '' })).rejects.toThrow('Envio de e-mail não configurado')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reenviar convite: só o PLATAFORMA_ADMIN (admin comum 403) e só cliente ativo (pedido 409)', async () => {
    await pedir()
    const [{ id }] = await q('SELECT id FROM plataforma_clientes')
    const fetch = respostaResend(200, { id: 'x' })
    vi.stubGlobal('fetch', fetch)
    const comum = await clientes({ method: 'POST', url: '/api/clientes?acao=reenviar-convite', body: { id }, auth: token('outro') })
    expect(comum.statusCode).toBe(403)
    const pedido = await clientes({ method: 'POST', url: '/api/clientes?acao=reenviar-convite', body: { id } })
    expect(pedido.statusCode).toBe(409)
    expect(fetch).not.toHaveBeenCalled()
  })
})
