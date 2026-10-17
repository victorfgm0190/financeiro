import process from 'node:process'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import jwt from 'jsonwebtoken'

// Pedido público + Controle de Clientes num Postgres de verdade (PGlite). Os handlers rodam de
// verdade: só o _db.js aponta para o PGlite. As tabelas de usuários entram para provar que aprovar
// um cliente não cria login neste banco.
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
const { provisionarCliente } = await import('./_provisionar.js')
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

  it('aprovar devolve a boas-vindas, grava histórico e NÃO cria nenhuma linha em usuarios', async () => {
    await q("INSERT INTO organizacoes (id, nome) VALUES ('org1', 'Victor')")
    await q("INSERT INTO usuarios (username, nome, email, senha_hash, nivel) VALUES ('vmoreira', 'Victor', 'v@v.com', 'x', 'admin')")
    const antes = await q('SELECT * FROM usuarios ORDER BY id')
    const membrosAntes = await q('SELECT * FROM membros')
    await pedir()
    const id = await idDoPedido()

    const r = await clientes({ method: 'POST', url: '/api/clientes?acao=aprovar', body: { id } })
    expect(r.statusCode).toBe(200)
    expect(r.body.cliente.status).toBe('aprovado')
    expect(r.body.endereco).toBe('https://mss.finup.app.br')
    expect(r.body.mensagem).toContain('Olá, Maria!')
    expect(r.body.mensagem).toContain([
      'Acesse: https://finup.app.br',
      'Ambiente: MSS',
      'Usuário: admin (ou o e-mail maria@exemplo.com)',
      'Endereço do seu ambiente: https://mss.finup.app.br',
    ].join('\n'))
    expect(r.body.mensagem).not.toContain('Maria da Silva Souza')
    expect(r.body.mensagem).toMatch(/próxima etapa[\s\S]*link para criar a sua senha/)

    expect(await q('SELECT * FROM usuarios ORDER BY id')).toEqual(antes)
    expect(await q('SELECT * FROM membros')).toEqual(membrosAntes)
    const hist = await q('SELECT evento, autor FROM plataforma_historico WHERE cliente_id = $1 ORDER BY created_at', [id])
    expect(hist).toEqual([{ evento: 'pedido', autor: 'formulario' }, { evento: 'aprovado', autor: 'vmoreira' }])

    // Repetir só regera a mensagem.
    const de_novo = await provisionarCliente(id, { autor: 'vmoreira' })
    expect(de_novo.cliente.status).toBe('aprovado')
    expect((await q('SELECT count(*)::int AS n FROM usuarios'))[0].n).toBe(1)
  })

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
  const aprovado = async () => {
    await pedir()
    const [{ id }] = await q('SELECT id FROM plataforma_clientes')
    await clientes({ method: 'POST', url: '/api/clientes?acao=aprovar', body: { id } })
    return id
  }
  const historico = async (id) => (await q('SELECT evento, detalhe FROM plataforma_historico WHERE cliente_id = $1 AND evento LIKE $2', [id, 'email_%']))
  beforeEach(async () => {
    await estado.db.waitReady
    process.env.RESEND_API_KEY = 're_chave_secreta'
    process.env.EMAIL_FROM = 'Finup <nao-responda@finup.app.br>'
  })
  afterEach(() => vi.unstubAllGlobals())

  it('modelo: assunto com a sigla, mesmo conteúdo da mensagem, rodapé e HTML escapado', () => {
    const m = modeloBoasVindas({ nome: 'Ana Lima', email: 'ana@x.com', sigla: 'cv' })
    expect(m.assunto).toBe('Seu acesso ao Finup — ambiente CV')
    expect(m.texto).toContain('Acesse: https://finup.app.br\nAmbiente: CV\nUsuário: admin (ou o e-mail ana@x.com)\nEndereço do seu ambiente: https://cv.finup.app.br')
    expect(m.texto).toMatch(/próxima etapa[\s\S]*link para criar a sua senha/)
    expect(m.texto).toContain('Dúvidas? Responda este e-mail ou escreva para contato@finup.app.br')
    expect(m.html).toContain('https://cv.finup.app.br')
    expect(m.html).toContain('prefers-color-scheme: dark')
    expect(m.html).toContain('#0F6E56')
    const xss = modeloBoasVindas({ nome: '<i>Ana</i> Lima', email: 'a"b@x.com', sigla: 'cv' }).html
    expect(xss).toContain('Olá, &lt;i&gt;Ana&lt;/i&gt;!')
    expect(xss).toContain('a&quot;b@x.com')
    expect(xss).not.toContain('<i>Ana')
  })

  it('sucesso: POST no Resend com Bearer, from/reply_to, histórico email_enviado com o id; log sem chave nem conteúdo', async () => {
    const id = await aprovado()
    const fetch = respostaResend(200, { id: 'resend-123' })
    vi.stubGlobal('fetch', fetch)
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    const r = await clientes({ method: 'POST', url: '/api/clientes?acao=email', body: { id } })
    expect(r.statusCode).toBe(200)
    expect(r.body).toEqual({ ok: true, id: 'resend-123', para: 'maria@exemplo.com' })

    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer re_chave_secreta')
    const enviado = JSON.parse(init.body)
    expect(enviado).toMatchObject({
      from: 'Finup <nao-responda@finup.app.br>', to: ['maria@exemplo.com'], reply_to: 'contato@finup.app.br',
      subject: 'Seu acesso ao Finup — ambiente MSS',
    })
    expect(enviado.html).toContain('https://mss.finup.app.br')
    expect(enviado.text).toContain('Ambiente: MSS')

    expect(await historico(id)).toEqual([{ evento: 'email_enviado', detalhe: 'Boas-vindas para maria@exemplo.com · id resend-123' }])
    const logado = JSON.stringify(log.mock.calls)
    expect(logado).toContain('resend-123')
    expect(logado).not.toContain('re_chave_secreta')
    expect(logado).not.toContain('mss.finup.app.br')
    log.mockRestore()
  })

  it('falha da API: 502, histórico email_falhou com a mensagem de erro', async () => {
    const id = await aprovado()
    vi.stubGlobal('fetch', respostaResend(422, { name: 'validation_error', message: 'Invalid `to` field' }))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await clientes({ method: 'POST', url: '/api/clientes?acao=email', body: { id } })
    expect(r.statusCode).toBe(502)
    expect(r.body.error).toBe('Serviço de e-mail recusou o envio (422: Invalid `to` field)')
    expect(await historico(id)).toEqual([{ evento: 'email_falhou', detalhe: `Boas-vindas para maria@exemplo.com · ${r.body.error}` }])
    expect(JSON.stringify(err.mock.calls)).not.toContain('re_chave_secreta')
    err.mockRestore()
  })

  it('chave ausente: erro claro, sem chamar o Resend', async () => {
    const id = await aprovado()
    delete process.env.RESEND_API_KEY
    const fetch = respostaResend(200, { id: 'x' })
    vi.stubGlobal('fetch', fetch)
    await expect(enviarEmail({ para: 'a@b.com', assunto: 'x', html: '', texto: '' })).rejects.toThrow('Envio de e-mail não configurado')
    const r = await clientes({ method: 'POST', url: '/api/clientes?acao=email', body: { id } })
    expect(r.statusCode).toBe(503)
    expect(r.body.error).toBe('Envio de e-mail não configurado')
    expect(fetch).not.toHaveBeenCalled()
    expect((await historico(id))[0].evento).toBe('email_falhou')
  })

  it('só o PLATAFORMA_ADMIN dispara (admin comum 403) e só cliente aprovado recebe', async () => {
    await pedir()
    const [{ id }] = await q('SELECT id FROM plataforma_clientes')
    const fetch = respostaResend(200, { id: 'x' })
    vi.stubGlobal('fetch', fetch)
    const comum = await clientes({ method: 'POST', url: '/api/clientes?acao=email', body: { id }, auth: token('outro') })
    expect(comum.statusCode).toBe(403)
    const pedido = await clientes({ method: 'POST', url: '/api/clientes?acao=email', body: { id } })
    expect(pedido.statusCode).toBe(409)
    expect(fetch).not.toHaveBeenCalled()
  })
})
