import process from 'node:process'
import jwt from 'jsonwebtoken'
import { query, parseBody, withTransaction } from './_db.js'
import { requireAuth, requireAdmin } from './_auth.js'
import {
  SENHA_MIN, USERNAME_RE, NIVEIS_VALIDOS, papelLegado, normUser, hashSenha, conferirSenha,
  ehTabelaInexistente, ErroHttp,
} from './_usuarios.js'
import { normalizarPermissoes } from '../src/lib/permissoes.js'
import { payloadDoCadastro, JWT_EXPIRA } from './auth.js'
import { comAmbiente, comAmbienteNoPayload } from './_ambiente.js'
import { enviarEmail, ErroEmail } from './_email.js'
import { modeloConvite, urlDefinirSenha } from './_emailSenha.js'
import { gerarTokenSenha } from './_senhaTokens.js'
import { ipDoReq } from './_plataforma.js'
import { AMBIENTE_PRINCIPAL } from '../src/lib/ambienteHost.js'
import { aposEditarUsuario } from './_agendaFeed.js'

// Cadastro de USUÁRIOS da organização do token. Só admin, sempre filtrando por req.user.orgId:
//   GET                     → lista (nunca devolve senha_hash)
//   POST { username, nome, email, senha, nivel, permissoes?, perfis_permitidos?, ativo?, trocar_senha? }
//   PATCH { id, nome?, email?, nivel?, permissoes?, perfis_permitidos?, ativo?, trocar_senha?,
//           novaSenha?, desbloquear? }
// E, para qualquer usuário do cadastro (não para o login fixo):
//   POST ?acao=minha-senha { senhaAtual, novaSenha } → troca a própria senha e devolve um token novo
//        (sem a marca "trocar senha no próximo login").
// E, só admin: POST ?acao=enviar-convite { id } → link 'convite' (48 h) por e-mail para o usuário criar
//        a senha (api/_senhaTokens.js; o link aponta para o endereço deste ambiente).
// Travas: a organização nunca fica sem um admin ativo; o admin não desativa a si mesmo.

const COLS = `u.id, u.username, u.nome, u.email, u.nivel, u.permissoes, u.perfis_permitidos, u.ativo,
  u.trocar_senha, u.tentativas_falhas, u.bloqueado_ate, u.ultimo_login, u.created_at, u.criado_por, u.updated_at`

const SQL_DA_ORG = `SELECT ${COLS} FROM usuarios u
  JOIN membros m ON m.usuario_id = u.id AND m.organizacao_id = $1`

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function texto(v, max) {
  const s = String(v ?? '').trim()
  return s ? s.slice(0, max) : null
}

function exigirNome(v) {
  const nome = texto(v, 100)
  if (!nome) throw new ErroHttp(400, 'Informe o nome')
  return nome
}

// E-mail obrigatório, guardado em minúsculo (o login por e-mail não diferencia maiúsculas).
function validarEmail(v) {
  const email = texto(v, 200)?.toLowerCase() ?? null
  if (!email) throw new ErroHttp(400, 'Informe o e-mail')
  if (!EMAIL_RE.test(email)) throw new ErroHttp(400, 'E-mail inválido')
  return email
}

// E-mail é único no sistema todo (índice uq_usuarios_email) — checado antes para a mensagem clara.
async function exigirEmailLivre(q, email, idAtual = null) {
  const [r] = await q('SELECT id FROM usuarios WHERE lower(email) = $1 AND id IS DISTINCT FROM $2', [email, idAtual])
  if (r) throw new ErroHttp(409, 'Já existe um usuário com esse e-mail')
}

function validarSenha(v) {
  if (typeof v !== 'string' || v.length < SENHA_MIN) throw new ErroHttp(400, `A senha precisa ter pelo menos ${SENHA_MIN} caracteres`)
  return v
}

function validarNivel(v) {
  if (!NIVEIS_VALIDOS.includes(v)) throw new ErroHttp(400, 'Nível inválido')
  return v
}

// "todos" ou array de ids de perfis existentes.
async function validarPerfis(q, v) {
  if (v == null || v === 'todos') return 'todos'
  if (!Array.isArray(v)) throw new ErroHttp(400, 'Perfis permitidos inválidos')
  const ids = [...new Set(v.map(String))]
  if (ids.length === 0) throw new ErroHttp(400, 'Escolha ao menos um perfil (ou "todos")')
  const rows = await q('SELECT id FROM perfis WHERE id = ANY($1)', [ids])
  if (rows.length !== ids.length) throw new ErroHttp(400, 'Perfil inexistente na lista de perfis permitidos')
  return ids
}

// Linha do banco → resposta (sem senha_hash, que nem é selecionado).
const resposta = (u) => (u ? { ...u, perfis_permitidos: Array.isArray(u.perfis_permitidos) ? u.perfis_permitidos : 'todos' } : null)

export async function listarUsuarios(q, orgId) {
  return (await q(`${SQL_DA_ORG} ORDER BY lower(coalesce(u.nome, u.username)), u.username`, [orgId])).map(resposta)
}

async function buscarDaOrg(q, orgId, id) {
  const [u] = await q(`${SQL_DA_ORG} WHERE u.id = $2`, [orgId, id])
  return resposta(u || null)
}

export async function criarUsuario(q, orgId, body = {}, autor = null) {
  const username = normUser(body.username)
  if (!USERNAME_RE.test(username)) throw new ErroHttp(400, 'Usuário deve ter de 3 a 40 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado')
  const senha = validarSenha(body.senha)
  const nivel = validarNivel(body.nivel ?? 'consulta')
  const nome = exigirNome(body.nome)
  const email = validarEmail(body.email)
  await exigirEmailLivre(q, email)
  const perfis = await validarPerfis(q, body.perfis_permitidos)
  const permissoes = nivel === 'personalizado' ? normalizarPermissoes(body.permissoes) : {}
  const senhaHash = await hashSenha(senha)
  try {
    // Usuário e vínculo numa instrução só: ou os dois entram, ou nenhum.
    const [r] = await q(
      `WITH u AS (
         INSERT INTO usuarios (username, nome, email, senha_hash, nivel, permissoes, perfis_permitidos, ativo, trocar_senha, criado_por, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, now(), now()) RETURNING id
       )
       INSERT INTO membros (usuario_id, organizacao_id, papel) SELECT id, $11, $12 FROM u RETURNING usuario_id`,
      [username, nome, email, senhaHash, nivel, JSON.stringify(permissoes), JSON.stringify(perfis),
        body.ativo !== false, body.trocar_senha === true, autor, orgId, papelLegado(nivel)],
    )
    return buscarDaOrg(q, orgId, r.usuario_id)
  } catch (err) {
    if (err?.code === '23505') throw new ErroHttp(409, 'Já existe um usuário com esse nome de acesso ou e-mail')
    throw err
  }
}

// Outros admins ativos na organização além de `id`.
async function outrosAdminsAtivos(q, orgId, id) {
  const [r] = await q(
    `SELECT count(*)::int AS n FROM membros m JOIN usuarios u ON u.id = m.usuario_id
      WHERE m.organizacao_id = $1 AND u.nivel = 'admin' AND u.ativo AND u.id <> $2`,
    [orgId, id],
  )
  return r?.n || 0
}

// `q` deve ser de uma transação (o handler usa withTransaction). `quem` = req.user (trava de si mesmo).
export async function editarUsuario(q, orgId, body = {}, quem = null) {
  if (!body.id) throw new ErroHttp(400, 'id é obrigatório')
  const alvo = await buscarDaOrg(q, orgId, String(body.id))
  if (!alvo) throw new ErroHttp(404, 'Usuário não encontrado')

  const sets = []
  const params = [alvo.id]
  const set = (col, v, cast = '') => { params.push(v); sets.push(`${col} = $${params.length}${cast}`) }
  if ('nome' in body) set('nome', exigirNome(body.nome))
  if ('email' in body) {
    const email = validarEmail(body.email)
    await exigirEmailLivre(q, email, alvo.id)
    set('email', email)
  }
  if ('ativo' in body) {
    if (body.ativo !== true && quem?.id === alvo.id) throw new ErroHttp(409, 'Você não pode desativar o seu próprio usuário')
    set('ativo', body.ativo === true)
  }
  if ('trocar_senha' in body) set('trocar_senha', body.trocar_senha === true)
  if ('perfis_permitidos' in body) set('perfis_permitidos', JSON.stringify(await validarPerfis(q, body.perfis_permitidos)), '::jsonb')
  const nivel = 'nivel' in body ? validarNivel(body.nivel) : alvo.nivel
  if (nivel !== alvo.nivel) set('nivel', nivel)
  if ('permissoes' in body || nivel !== alvo.nivel) {
    set('permissoes', JSON.stringify(nivel === 'personalizado' ? normalizarPermissoes(body.permissoes ?? alvo.permissoes) : {}), '::jsonb')
  }
  if (body.novaSenha != null) set('senha_hash', await hashSenha(validarSenha(body.novaSenha)))
  if (body.desbloquear || body.novaSenha != null) sets.push('tentativas_falhas = 0', 'bloqueado_ate = NULL')

  const perdeAdmin = alvo.nivel === 'admin' && alvo.ativo && (nivel !== 'admin' || ('ativo' in body && body.ativo !== true))
  if (perdeAdmin && (await outrosAdminsAtivos(q, orgId, alvo.id)) === 0) {
    throw new ErroHttp(409, 'A organização precisa de pelo menos um administrador ativo')
  }

  if (sets.length) {
    sets.push('updated_at = now()')
    await q(`UPDATE usuarios SET ${sets.join(', ')} WHERE id = $1`, params)
  }
  if (nivel !== alvo.nivel) {
    await q('UPDATE membros SET papel = $3 WHERE usuario_id = $1 AND organizacao_id = $2', [alvo.id, orgId, papelLegado(nivel)])
  }
  return buscarDaOrg(q, orgId, alvo.id)
}

// Troca a própria senha. Devolve um token novo (sem trocarSenha) — o app troca o salvo e segue.
// `ambiente`: o da requisição — o token novo continua preso a ele.
export async function trocarMinhaSenha(q, user, body = {}, { secret = process.env.JWT_SECRET, ambiente = null } = {}) {
  if (user.origem !== 'db') throw new ErroHttp(403, 'Disponível só para usuários do cadastro')
  const novaSenha = validarSenha(body.novaSenha)
  const [u] = await q('SELECT senha_hash FROM usuarios WHERE id = $1 AND ativo', [user.id])
  if (!u || !(await conferirSenha(body.senhaAtual, u.senha_hash))) throw new ErroHttp(400, 'Senha atual incorreta')
  if (await conferirSenha(novaSenha, u.senha_hash)) throw new ErroHttp(400, 'A nova senha precisa ser diferente da atual')
  await q(
    'UPDATE usuarios SET senha_hash = $2, trocar_senha = false, tentativas_falhas = 0, bloqueado_ate = NULL, updated_at = now() WHERE id = $1',
    [user.id, await hashSenha(novaSenha)],
  )
  const [atual] = await q(
    `SELECT u.id, u.username, u.nome, u.nivel, u.permissoes, u.perfis_permitidos, u.trocar_senha, m.organizacao_id, m.papel
       FROM usuarios u LEFT JOIN LATERAL (
         SELECT organizacao_id, papel FROM membros WHERE usuario_id = u.id ORDER BY created_at, id LIMIT 1
       ) m ON true WHERE u.id = $1`, [user.id])
  const payload = atual && (ambiente ? comAmbienteNoPayload(payloadDoCadastro(atual), ambiente) : payloadDoCadastro(atual))
  const token = secret && payload ? jwt.sign(payload, secret, { expiresIn: JWT_EXPIRA }) : null
  return { ok: true, token }
}

// Convite: link 'convite' (48 h) para o e-mail do usuário da organização. `q` de uma transação; o
// e-mail sai depois do commit (enviarConvite). Devolve { usuario, token }.
export async function prepararConvite(q, orgId, body = {}, { ip = null, agora = new Date() } = {}) {
  if (!body.id) throw new ErroHttp(400, 'id é obrigatório')
  const u = await buscarDaOrg(q, orgId, String(body.id))
  if (!u) throw new ErroHttp(404, 'Usuário não encontrado')
  if (!u.ativo) throw new ErroHttp(409, 'Usuário inativo: ative antes de enviar o link')
  if (!String(u.email || '').trim()) throw new ErroHttp(409, 'Usuário sem e-mail cadastrado')
  return { usuario: u, token: await gerarTokenSenha(q, u.id, 'convite', { ip, agora }) }
}

export async function enviarConvite(transacao, orgId, body, { ambiente, ip, enviar = enviarEmail } = {}) {
  const { usuario, token } = await transacao((q) => prepararConvite(q, orgId, body, { ip }))
  const sigla = ambiente?.sigla || AMBIENTE_PRINCIPAL
  const { assunto, html, texto } = modeloConvite({
    nome: usuario.nome || usuario.username, username: usuario.username, sigla, url: urlDefinirSenha(sigla, token),
  })
  await enviar({ para: usuario.email, assunto, html, texto })
  return { ok: true, email: usuario.email }
}

function queryParam(req, nome) {
  if (req.query?.[nome]) return req.query[nome]
  try { return new URL(req.url, 'http://x').searchParams.get(nome) } catch { return null }
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  const minhaSenha = queryParam(req, 'acao') === 'minha-senha'
  if (!(minhaSenha ? requireAuth(req, res) : requireAdmin(req, res))) return

  try {
    if (minhaSenha) {
      if (req.method !== 'POST') return res.status(405).end()
      return res.json(await trocarMinhaSenha(query, req.user, await parseBody(req), { ambiente: req.ambiente }))
    }

    const orgId = req.user.orgId
    if (!orgId) return res.status(400).json({ error: 'Sessão sem organização. Saia e entre novamente.' })

    if (req.method === 'GET') {
      const [usuarios, perfis] = await Promise.all([
        listarUsuarios(query, orgId),
        query('SELECT id, name FROM perfis ORDER BY ordem NULLS LAST, created_at').catch(() => []),
      ])
      return res.json({ usuarios, perfis })
    }
    if (queryParam(req, 'acao') === 'enviar-convite') {
      if (req.method !== 'POST') return res.status(405).end()
      return res.json(await enviarConvite(withTransaction, orgId, await parseBody(req), { ambiente: req.ambiente, ip: ipDoReq(req) }))
    }
    const autor = req.user.username || req.user.id
    if (req.method === 'POST') return res.json({ ok: true, usuario: await criarUsuario(query, orgId, await parseBody(req), autor) })
    if (req.method === 'PATCH') {
      const body = await parseBody(req)
      const antes = body.id ? await buscarDaOrg(query, orgId, String(body.id)) : null
      const usuario = await withTransaction((q) => editarUsuario(q, orgId, body, req.user))
      // Agenda no celular (central): desativado → feed revogado; acesso mudou → feed esvaziado.
      await aposEditarUsuario(req.ambiente?.sigla, antes, usuario)
        .catch((err) => console.warn('[api/usuarios] agenda no celular:', err.message))
      return res.json({ ok: true, usuario })
    }
    return res.status(405).end()
  } catch (err) {
    if (err instanceof ErroHttp) return res.status(err.status).json({ error: err.message })
    if (err instanceof ErroEmail) return res.status(err.status).json({ error: `Link gerado, mas o e-mail não saiu: ${err.message}` })
    if (err?.code === '23505') return res.status(409).json({ error: 'Já existe um usuário com esse nome de acesso ou e-mail' })
    if (ehTabelaInexistente(err)) return res.status(503).json({ error: 'Cadastro de usuários ainda não instalado (migração pendente)' })
    console.error('[api/usuarios]', err.message)
    return res.status(500).json({ error: 'Falha ao processar a solicitação' })
  }
}

export default comAmbiente(handler)
