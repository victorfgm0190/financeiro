import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import process from 'node:process'
import { query, parseBody } from './_db.js'
import { centralQuery, buscarAmbientePorSigla, buscarAmbientePorId, ambienteAtivo } from './_central.js'
import { rodarNoAmbiente } from './_conexao.js'
import { ambienteDoReq, comAmbienteNoPayload, ERRO_AMBIENTE_INDISPONIVEL } from './_ambiente.js'
import { queryParam } from './_plataforma.js'
import { normalizarSigla } from '../src/lib/plataforma.js'
import { AMBIENTE_PRINCIPAL, enderecoDoAmbiente } from '../src/lib/ambienteHost.js'
import {
  normUser, conferirSenha, compararFicticio, ehTabelaInexistente, estaBloqueado, estadoAposFalha, nivelDoPapel,
} from './_usuarios.js'
import { normalizarPermissoes, normalizarPerfis } from '../src/lib/permissoes.js'

// Login por USUÁRIO ou E-MAIL, em dois modos SEPARADOS (um não trava o outro):
//   a) procura o usuário (username ou e-mail, sem maiúsculas/espaços) na tabela usuarios;
//   b) CADASTRO (normal): ativo, não bloqueado e senha = senha_hash → entra (origem 'db'). Falha
//      conta só no cadastro: 5 erros → bloqueado por 15 min.
//   c) ACESSO DE EMERGÊNCIA: só com `emergencia: true` (link "Acesso de emergência" da tela de login,
//      só no ambiente principal — em endereço de cliente o pedido é recusado). ALLOW_ENV_ADMIN ===
//      'true', o login é o ADMIN_USER (ou o e-mail do usuário cujo username = ADMIN_USER) e a senha =
//      ADMIN_PASS → entra (origem 'env'), MESMO com o cadastro bloqueado ou inativo: é a recuperação.
//      Se o usuário existe na tabela, o token é DELE (sub/org/nome), com papel forçado 'admin'. Também
//      cobre a tabela inexistente (migração não rodada) ou o banco fora do ar. Bloqueio próprio, mais
//      rígido (LIMITE_EMERGENCIA): 3 erros por usuário e 5 por IP → 30 min (login_bloqueios).
//   d) a resposta de erro é sempre a mesma: não revela se o usuário existe, está inativo ou bloqueado.
// Sucesso → JWT { sub, org, nivel, papel, permissoes, perfis, trocarSenha, username, nome, origem,
// amb, amb_sigla } válido por 12h.
//
// AMBIENTE (multi-cliente, docs/ambientes.md): o login roda no banco do ambiente — o do endereço
// (<sigla>.finup.app.br) ou, no www / vercel.app / localhost, o digitado no campo Ambiente (vazio →
// o do endereço). Ambiente inexistente, suspenso ou senha errada → a MESMA resposta (ERRO_LOGIN).
// Login no www com o ambiente de um CLIENTE não devolve token: devolve { redirect } para
// https://<sigla>.finup.app.br/entrar?c=<código de passagem> (uso único, 60 s, só o hash no central),
// e POST /api/auth?acao=trocar-codigo { codigo } naquele endereço troca o código pelo token.

export const ERRO_LOGIN = 'Usuário, senha ou ambiente inválidos'
export const ERRO_CODIGO = 'Código de acesso inválido ou expirado. Entre novamente.'
export const CODIGO_VALIDADE_S = 60
export const JWT_EXPIRA = '12h'

// Username nunca tem "@" e e-mail sempre tem: no máximo um usuário casa com o login.
const SQL_USUARIO = `
  SELECT u.id, u.username, u.nome, u.senha_hash, u.ativo, u.tentativas_falhas, u.bloqueado_ate,
         u.nivel, u.permissoes, u.perfis_permitidos, u.trocar_senha, u.token_versao,
         m.organizacao_id, m.papel
    FROM usuarios u
    LEFT JOIN LATERAL (
      SELECT organizacao_id, papel FROM membros WHERE usuario_id = u.id ORDER BY created_at, id LIMIT 1
    ) m ON true
   WHERE u.username = $1 OR lower(u.email) = $1
   ORDER BY (u.username = $1) DESC
   LIMIT 1`

// Cadastro utilizável no passo (b): ativo, com organização e fora do bloqueio.
const cadastroUtilizavel = (u, agora) => !!u && !!u.ativo && !!u.papel && !estaBloqueado(u, agora)

async function registrarFalhaCadastro(q, u, agora) {
  const e = estadoAposFalha(u, agora)
  await q('UPDATE usuarios SET tentativas_falhas = $2, bloqueado_ate = $3 WHERE id = $1', [u.id, e.tentativas_falhas, e.bloqueado_ate])
}

// ─── LOGIN FIXO DE EMERGÊNCIA ──────────────────────────────────────────────────────────────────
// REMOVER LOGIN FIXO ANTES DA COMERCIALIZAÇÃO (esta seção inteira, o passo (c) de autenticar(), a
// tabela login_bloqueios e as variáveis ADMIN_USER / ADMIN_PASS / ALLOW_ENV_ADMIN na Vercel).

// Fallback do bloqueio quando a tabela login_bloqueios não existe: por instância (fraco, mas melhor
// que nada até a migração rodar).
const bloqueiosEmMemoria = new Map()

async function lerBloqueioEnv(q, chave) {
  try {
    const [r] = await q('SELECT tentativas_falhas, bloqueado_ate FROM login_bloqueios WHERE chave = $1', [chave])
    return r || { tentativas_falhas: 0, bloqueado_ate: null }
  } catch {
    return bloqueiosEmMemoria.get(chave) || { tentativas_falhas: 0, bloqueado_ate: null }
  }
}

async function gravarBloqueioEnv(q, chave, estado) {
  try {
    await q(
      `INSERT INTO login_bloqueios (chave, tentativas_falhas, bloqueado_ate, updated_at) VALUES ($1, $2, $3, now())
       ON CONFLICT (chave) DO UPDATE SET tentativas_falhas = EXCLUDED.tentativas_falhas,
         bloqueado_ate = EXCLUDED.bloqueado_ate, updated_at = now()`,
      [chave, estado.tentativas_falhas, estado.bloqueado_ate],
    )
  } catch {
    bloqueiosEmMemoria.set(chave, estado)
  }
}

// Compara em tempo constante (o hash iguala os tamanhos, exigência do timingSafeEqual).
const igualSeguro = (a, b) => crypto.timingSafeEqual(
  crypto.createHash('sha256').update(String(a)).digest(),
  crypto.createHash('sha256').update(String(b)).digest(),
)

// Organização do token do login fixo sem cadastro: a primeira criada ("Victor"); cria se ainda não
// há nenhuma. Sem a tabela (migração não rodada) → null.
async function organizacaoPadrao(q) {
  try {
    const [org] = await q('SELECT id FROM organizacoes ORDER BY created_at, id LIMIT 1')
    if (org) return org.id
    const [nova] = await q("INSERT INTO organizacoes (nome) VALUES ('Victor') RETURNING id")
    return nova.id
  } catch (err) {
    console.error('[api/auth] organização padrão indisponível:', err.message)
    return null
  }
}

// O login fixo se aplica a este login? ALLOW_ENV_ADMIN ligado, ADMIN_USER/ADMIN_PASS configurados e
// o login digitado é o ADMIN_USER — ou é o e-mail do usuário cadastrado cujo username = ADMIN_USER.
function loginFixoAplicavel(env, login, cadastro) {
  const adminUser = normUser(env.ADMIN_USER)
  if (env.ALLOW_ENV_ADMIN !== 'true' || !adminUser || !env.ADMIN_PASS) return false
  return igualSeguro(login, adminUser) || (!!cadastro && cadastro.username === adminUser)
}

async function payloadLoginFixo(q, login, cadastro, agora) {
  console.warn(`[api/auth] LOGIN VIA ADMIN FIXO — ${agora.toISOString()} — login "${login}"`)
  if (cadastro) {
    // Mesma pessoa do cadastro: histórico atribuído ao id dela. Papel forçado admin (recuperação).
    return {
      sub: cadastro.id, org: cadastro.organizacao_id ?? await organizacaoPadrao(q), papel: 'admin', nivel: 'admin',
      permissoes: {}, perfis: 'todos', trocarSenha: false,
      username: cadastro.username, nome: cadastro.nome || cadastro.username, origem: 'env',
    }
  }
  return {
    sub: `env:${login}`, org: await organizacaoPadrao(q), papel: 'admin', nivel: 'admin', permissoes: {}, perfis: 'todos',
    trocarSenha: false, username: login, nome: login, origem: 'env',
  }
}
// ─── fim do login fixo ─────────────────────────────────────────────────────────────────────────

// Payload do JWT de um usuário do cadastro: nível, permissões (só valem no personalizado) e perfis
// permitidos viajam no token — a API autoriza sem ir ao banco. `papel` = nível, para tokens/código
// antigos que ainda olham papel === 'admin'. `tv` = token_versao do login: mudou no banco (usuário
// desativado, acesso ou senha alterados) → o token deixa de valer (api/_sessao.js).
export function payloadDoCadastro(u) {
  const nivel = u.nivel || nivelDoPapel(u.papel) || 'consulta'
  return {
    sub: u.id, org: u.organizacao_id, papel: nivel, nivel,
    permissoes: nivel === 'personalizado' ? normalizarPermissoes(u.permissoes) : {},
    perfis: normalizarPerfis(u.perfis_permitidos),
    trocarSenha: !!u.trocar_senha,
    username: u.username, nome: u.nome || u.username, origem: 'db', tv: Number(u.token_versao) || 0,
  }
}

// Limites do acesso de emergência: mais rígidos que os do cadastro (5 / 15 min) e em DUAS chaves de
// login_bloqueios — por usuário (env:<ADMIN_USER>) e por IP (envip:<ip>, qualquer usuário digitado).
export const LIMITE_EMERGENCIA = {
  usuario: { max: 3, bloqueioMs: 30 * 60 * 1000 },
  ip: { max: 5, bloqueioMs: 30 * 60 * 1000 },
}

// Acesso de emergência (pedido com `emergencia: true`, link da tela de login no ambiente principal):
// confere SÓ o ADMIN_PASS e conta SÓ nos bloqueios de emergência — o cadastro não é tocado. Entra
// mesmo com o cadastro bloqueado ou inativo (é a recuperação). REMOVER ANTES DA COMERCIALIZAÇÃO.
async function autenticarEmergencia(q, login, senha, cadastro, { env, agora, ip }) {
  const ligado = env.ALLOW_ENV_ADMIN === 'true' && !!normUser(env.ADMIN_USER) && !!env.ADMIN_PASS
  if (!ligado) { await compararFicticio(senha); return null }
  const chaveIp = `envip:${ip || 'desconhecido'}`
  const estadoIp = await lerBloqueioEnv(q, chaveIp)
  if (estaBloqueado(estadoIp, agora)) { await compararFicticio(senha); return null }

  const chave = `env:${normUser(env.ADMIN_USER)}`
  const fixo = loginFixoAplicavel(env, login, cadastro)
  const estado = fixo ? await lerBloqueioEnv(q, chave) : null
  if (fixo && !estaBloqueado(estado, agora) && igualSeguro(senha, env.ADMIN_PASS)) {
    if (estado.tentativas_falhas || estado.bloqueado_ate) await gravarBloqueioEnv(q, chave, { tentativas_falhas: 0, bloqueado_ate: null })
    return payloadLoginFixo(q, login, cadastro, agora)
  }
  // Falha (usuário errado, senha errada ou usuário bloqueado): conta no IP; e no usuário, se é o dele.
  await gravarBloqueioEnv(q, chaveIp, estadoAposFalha(estadoIp, agora, LIMITE_EMERGENCIA.ip))
  if (fixo && !estaBloqueado(estado, agora)) await gravarBloqueioEnv(q, chave, estadoAposFalha(estado, agora, LIMITE_EMERGENCIA.usuario))
  return null
}

// Núcleo do login (testável com qualquer `q(sql, params) → rows`). Devolve o payload do JWT ou null.
// O campo do formulário continua se chamando `username`, mas aceita usuário ou e-mail.
// Dois modos que NÃO se misturam (um não trava o outro):
//   • normal: só a senha do cadastro; falha conta só no cadastro (5 erros → 15 min);
//   • `emergencia: true`: só o ADMIN_PASS, com bloqueio próprio (autenticarEmergencia).
export async function autenticar(q, { username, password, emergencia = false } = {}, { env = process.env, agora = new Date(), ip = null } = {}) {
  const login = normUser(username)
  const senha = String(password ?? '')
  if (!login || !senha) return null

  // (a) usuário do cadastro
  let cadastro = null
  try {
    ;[cadastro] = await q(SQL_USUARIO, [login])
  } catch (err) {
    // Tabela inexistente é esperado antes da migração; qualquer outra falha do banco também segue
    // (sem cadastro), para o acesso de emergência funcionar com o banco instável.
    if (!ehTabelaInexistente(err)) console.error('[api/auth] falha ao consultar usuarios:', err.message)
  }

  if (emergencia === true) return autenticarEmergencia(q, login, senha, cadastro, { env, agora, ip })

  // (b) cadastro (sem cadastro utilizável, um compare fictício iguala o tempo de resposta)
  const utilizavel = cadastroUtilizavel(cadastro, agora)
  const senhaCadastroOk = utilizavel ? await conferirSenha(senha, cadastro.senha_hash) : await compararFicticio(senha)
  if (senhaCadastroOk) {
    await q('UPDATE usuarios SET tentativas_falhas = 0, bloqueado_ate = NULL, ultimo_login = $2 WHERE id = $1', [cadastro.id, agora])
    return payloadDoCadastro(cadastro)
  }
  if (utilizavel) await registrarFalhaCadastro(q, cadastro, agora)
  return null
}

// ─── Código de passagem (login no www → endereço do cliente) ─────────────────────────────────────
const hashCodigo = (codigo) => crypto.createHash('sha256').update(String(codigo)).digest('hex')

export async function criarCodigoPassagem(q, amb, payload, { agora = new Date() } = {}) {
  const codigo = crypto.randomBytes(32).toString('base64url')
  await q("DELETE FROM login_handoff WHERE expira_em < $1::timestamptz - interval '1 day'", [agora])
  await q(
    'INSERT INTO login_handoff (codigo_hash, ambiente_id, usuario_id, payload, expira_em) VALUES ($1, $2, $3, $4, $5)',
    [hashCodigo(codigo), amb.id, payload.sub ?? null, JSON.stringify(payload), new Date(agora.getTime() + CODIGO_VALIDADE_S * 1000)],
  )
  return codigo
}

// Consome o código (uso único, atômico) SÓ se for do ambiente `sigla` e ainda válido: código de
// outro ambiente nem é gasto. Devolve { ambiente_id, payload } ou null.
export async function consumirCodigoPassagem(q, codigo, sigla, { agora = new Date() } = {}) {
  if (!codigo || !sigla) return null
  const [r] = await q(
    `UPDATE login_handoff h SET usado_em = $3
       FROM ambientes a
      WHERE a.id = h.ambiente_id AND a.sigla = $2 AND h.codigo_hash = $1
        AND h.usado_em IS NULL AND h.expira_em > $3
     RETURNING h.ambiente_id, h.payload`,
    [hashCodigo(codigo), sigla, agora],
  )
  return r || null
}

// IP de quem tenta (bloqueio por IP do acesso de emergência). Na Vercel, o 1º do x-forwarded-for.
export function ipDoReq(req) {
  const h = req?.headers || {}
  const xff = String(h['x-forwarded-for'] || '').split(',')[0].trim()
  return xff || String(h['x-real-ip'] || '').trim() || req?.socket?.remoteAddress || null
}

// Sem o login fixo de emergência (vale só no ambiente principal).
const semLoginFixo = (env) => ({ ...env, ALLOW_ENV_ADMIN: 'false', ADMIN_USER: '', ADMIN_PASS: '' })

async function entrar(req, res, body, secret) {
  const doEndereco = ambienteDoReq(req)
  const sigla = doEndereco.principal ? (normalizarSigla(body.ambiente) || doEndereco.sigla) : doEndereco.sigla
  const amb = sigla ? await buscarAmbientePorSigla(sigla) : null
  if (!ambienteAtivo(amb)) {
    await compararFicticio(String(body.password ?? '')) // mesmo tempo de resposta de uma senha errada
    return res.status(401).json({ error: ERRO_LOGIN })
  }
  // Acesso de emergência só no endereço principal e no ambiente principal; fora disso, a mesma
  // resposta de uma senha errada.
  const emergencia = body.emergencia === true
  if (emergencia && (!doEndereco.principal || amb.sigla !== AMBIENTE_PRINCIPAL)) {
    await compararFicticio(String(body.password ?? ''))
    return res.status(401).json({ error: ERRO_LOGIN })
  }
  const env = amb.sigla === AMBIENTE_PRINCIPAL ? process.env : semLoginFixo(process.env)
  const base = await rodarNoAmbiente(amb, () => autenticar(query, { ...body, emergencia }, { env, ip: ipDoReq(req) }))
  if (!base) return res.status(401).json({ error: ERRO_LOGIN })
  const payload = comAmbienteNoPayload(base, amb)

  if (amb.sigla === doEndereco.sigla) return res.json({ token: jwt.sign(payload, secret, { expiresIn: JWT_EXPIRA }) })
  const codigo = await criarCodigoPassagem(centralQuery, amb, payload)
  return res.json({ redirect: `${enderecoDoAmbiente(amb.sigla)}/entrar?c=${encodeURIComponent(codigo)}` })
}

async function trocarCodigo(req, res, body, secret) {
  const { sigla } = ambienteDoReq(req)
  const r = await consumirCodigoPassagem(centralQuery, String(body.codigo || ''), sigla)
  if (!r) return res.status(401).json({ error: ERRO_CODIGO })
  const amb = await buscarAmbientePorId(r.ambiente_id)
  if (!amb || amb.sigla !== sigla) return res.status(401).json({ error: ERRO_CODIGO })
  if (!ambienteAtivo(amb)) return res.status(403).json({ error: ERRO_AMBIENTE_INDISPONIVEL })
  const payload = typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload
  return res.json({ token: jwt.sign(comAmbienteNoPayload(payload, amb), secret, { expiresIn: JWT_EXPIRA }) })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  res.setHeader('Cache-Control', 'no-store')

  const secret = process.env.JWT_SECRET
  if (!secret) return res.status(500).json({ error: 'Auth not configured' })

  try {
    const body = (await parseBody(req)) || {}
    if (queryParam(req, 'acao') === 'trocar-codigo') return await trocarCodigo(req, res, body, secret)
    return await entrar(req, res, body, secret)
  } catch (err) {
    console.error('[api/auth]', err.message)
    return res.status(500).json({ error: 'Falha ao entrar. Tente novamente.' })
  }
}
