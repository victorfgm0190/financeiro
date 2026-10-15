import { query, parseBody, withTransaction } from './_db.js'
import { requireAuth, requireAdmin } from './_auth.js'
import {
  PAPEIS, SENHA_MIN, USERNAME_RE, normUser, hashSenha, conferirSenha, ehTabelaInexistente, ErroHttp,
} from './_usuarios.js'

// Cadastro de USUÁRIOS da organização do token. Só admin, sempre filtrando por req.user.orgId:
//   GET                                   → lista (nunca devolve senha_hash)
//   POST { username, nome, email, senha, papel }  → cria usuário + vínculo na organização
//   PATCH { id, nome?, email?, papel?, ativo?, novaSenha?, desbloquear? }  → edita
// E, para qualquer usuário do cadastro (não para o login fixo):
//   POST ?acao=minha-senha { senhaAtual, novaSenha }  → troca a própria senha
// A organização nunca fica sem um admin ativo (não dá para rebaixar/desativar o último).

const COLS = `u.id, u.username, u.nome, u.email, u.ativo, u.tentativas_falhas, u.bloqueado_ate,
  u.ultimo_login, u.created_at, u.updated_at, m.papel`

const SQL_DA_ORG = `SELECT ${COLS} FROM usuarios u
  JOIN membros m ON m.usuario_id = u.id AND m.organizacao_id = $1`

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function texto(v, max) {
  const s = String(v ?? '').trim()
  return s ? s.slice(0, max) : null
}

// E-mail guardado em minúsculo (o login por e-mail não diferencia maiúsculas).
function validarEmail(v) {
  const email = texto(v, 200)?.toLowerCase() ?? null
  if (email && !EMAIL_RE.test(email)) throw new ErroHttp(400, 'E-mail inválido')
  return email
}

// E-mail é único no sistema todo (índice uq_usuarios_email) — checado antes para a mensagem clara.
async function exigirEmailLivre(q, email, idAtual = null) {
  if (!email) return
  const [r] = await q('SELECT id FROM usuarios WHERE lower(email) = $1 AND id IS DISTINCT FROM $2', [email, idAtual])
  if (r) throw new ErroHttp(409, 'Já existe um usuário com esse e-mail')
}

function validarSenha(v) {
  if (typeof v !== 'string' || v.length < SENHA_MIN) throw new ErroHttp(400, `A senha precisa ter pelo menos ${SENHA_MIN} caracteres`)
  return v
}

function validarPapel(v) {
  if (!PAPEIS.includes(v)) throw new ErroHttp(400, 'Papel inválido')
  return v
}

export async function listarUsuarios(q, orgId) {
  return q(`${SQL_DA_ORG} ORDER BY lower(coalesce(u.nome, u.username)), u.username`, [orgId])
}

async function buscarDaOrg(q, orgId, id) {
  const [u] = await q(`${SQL_DA_ORG} WHERE u.id = $2`, [orgId, id])
  return u || null
}

export async function criarUsuario(q, orgId, body = {}) {
  const username = normUser(body.username)
  if (!USERNAME_RE.test(username)) throw new ErroHttp(400, 'Usuário deve ter de 3 a 40 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado')
  const senha = validarSenha(body.senha)
  const papel = validarPapel(body.papel ?? 'usuario')
  const nome = texto(body.nome, 100)
  const email = validarEmail(body.email)
  await exigirEmailLivre(q, email)
  const senhaHash = await hashSenha(senha)
  try {
    // Usuário e vínculo numa instrução só: ou os dois entram, ou nenhum.
    const [r] = await q(
      `WITH u AS (
         INSERT INTO usuarios (username, nome, email, senha_hash, updated_at) VALUES ($1, $2, $3, $4, now()) RETURNING id
       )
       INSERT INTO membros (usuario_id, organizacao_id, papel) SELECT id, $5, $6 FROM u RETURNING usuario_id`,
      [username, nome, email, senhaHash, orgId, papel],
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
      WHERE m.organizacao_id = $1 AND m.papel = 'admin' AND u.ativo AND u.id <> $2`,
    [orgId, id],
  )
  return r?.n || 0
}

// `q` deve ser de uma transação (o handler usa withTransaction): perfil e papel mudam juntos.
export async function editarUsuario(q, orgId, body = {}) {
  if (!body.id) throw new ErroHttp(400, 'id é obrigatório')
  const alvo = await buscarDaOrg(q, orgId, String(body.id))
  if (!alvo) throw new ErroHttp(404, 'Usuário não encontrado')

  const sets = []
  const params = [alvo.id]
  const set = (col, v) => { params.push(v); sets.push(`${col} = $${params.length}`) }
  if ('nome' in body) set('nome', texto(body.nome, 100))
  if ('email' in body) {
    const email = validarEmail(body.email)
    await exigirEmailLivre(q, email, alvo.id)
    set('email', email)
  }
  if ('ativo' in body) set('ativo', body.ativo === true)
  if (body.novaSenha != null) {
    set('senha_hash', await hashSenha(validarSenha(body.novaSenha)))
  }
  if (body.desbloquear || body.novaSenha != null) {
    sets.push('tentativas_falhas = 0', 'bloqueado_ate = NULL')
  }
  const papel = 'papel' in body ? validarPapel(body.papel) : alvo.papel

  const perdeAdmin = alvo.papel === 'admin' && alvo.ativo && (papel !== 'admin' || ('ativo' in body && body.ativo !== true))
  if (perdeAdmin && (await outrosAdminsAtivos(q, orgId, alvo.id)) === 0) {
    throw new ErroHttp(409, 'A organização precisa de pelo menos um administrador ativo')
  }

  if (sets.length) {
    sets.push('updated_at = now()')
    await q(`UPDATE usuarios SET ${sets.join(', ')} WHERE id = $1`, params)
  }
  if (papel !== alvo.papel) {
    await q('UPDATE membros SET papel = $3 WHERE usuario_id = $1 AND organizacao_id = $2', [alvo.id, orgId, papel])
  }
  return buscarDaOrg(q, orgId, alvo.id)
}

export async function trocarMinhaSenha(q, user, body = {}) {
  if (user.origem !== 'db') throw new ErroHttp(403, 'Disponível só para usuários do cadastro')
  const novaSenha = validarSenha(body.novaSenha)
  const [u] = await q('SELECT senha_hash FROM usuarios WHERE id = $1 AND ativo', [user.id])
  if (!u || !(await conferirSenha(body.senhaAtual, u.senha_hash))) throw new ErroHttp(400, 'Senha atual incorreta')
  await q(
    'UPDATE usuarios SET senha_hash = $2, tentativas_falhas = 0, bloqueado_ate = NULL, updated_at = now() WHERE id = $1',
    [user.id, await hashSenha(novaSenha)],
  )
  return { ok: true }
}

function queryParam(req, nome) {
  if (req.query?.[nome]) return req.query[nome]
  try { return new URL(req.url, 'http://x').searchParams.get(nome) } catch { return null }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  const minhaSenha = queryParam(req, 'acao') === 'minha-senha'
  if (!(minhaSenha ? requireAuth(req, res) : requireAdmin(req, res))) return

  try {
    if (minhaSenha) {
      if (req.method !== 'POST') return res.status(405).end()
      return res.json(await trocarMinhaSenha(query, req.user, await parseBody(req)))
    }

    const orgId = req.user.orgId
    if (!orgId) return res.status(400).json({ error: 'Sessão sem organização. Saia e entre novamente.' })

    if (req.method === 'GET') return res.json({ usuarios: await listarUsuarios(query, orgId) })
    if (req.method === 'POST') return res.json({ ok: true, usuario: await criarUsuario(query, orgId, await parseBody(req)) })
    if (req.method === 'PATCH') {
      const body = await parseBody(req)
      const usuario = await withTransaction((q) => editarUsuario(q, orgId, body))
      return res.json({ ok: true, usuario })
    }
    return res.status(405).end()
  } catch (err) {
    if (err instanceof ErroHttp) return res.status(err.status).json({ error: err.message })
    if (err?.code === '23505') return res.status(409).json({ error: 'Já existe um usuário com esse nome de acesso ou e-mail' })
    if (ehTabelaInexistente(err)) return res.status(503).json({ error: 'Cadastro de usuários ainda não instalado (migração pendente)' })
    console.error('[api/usuarios]', err.message)
    return res.status(500).json({ error: 'Falha ao processar a solicitação' })
  }
}
