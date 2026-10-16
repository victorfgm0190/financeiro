import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { query, parseBody } from './_db.js'
import {
  normUser, conferirSenha, compararFicticio, ehTabelaInexistente, estaBloqueado, estadoAposFalha, nivelDoPapel,
} from './_usuarios.js'
import { normalizarPermissoes, normalizarPerfis } from '../src/lib/permissoes.js'

// Login por USUÁRIO ou E-MAIL. Dois modos convivendo nesta fase de transição, na ordem:
//   a) procura o usuário (username ou e-mail, sem maiúsculas/espaços) na tabela usuarios;
//   b) CADASTRO (principal): ativo, não bloqueado e senha = senha_hash → entra (origem 'db');
//   c) LOGIN FIXO de emergência: se não entrou por (b), ALLOW_ENV_ADMIN === 'true', o login é o
//      ADMIN_USER (ou o e-mail do usuário cujo username = ADMIN_USER) e a senha = ADMIN_PASS → entra
//      (origem 'env'), MESMO com o cadastro bloqueado ou inativo: é o acesso de recuperação. Se o
//      usuário existe na tabela, o token é DELE (sub/org/nome), com papel forçado 'admin'.
//      Também cobre a tabela inexistente (migração não rodada) ou o banco fora do ar.
//   d) falhas: o cadastro só conta tentativa se a senha também não for o ADMIN_PASS (quando o login
//      fixo se aplica); o login fixo tem bloqueio próprio (login_bloqueios). Sucesso pelo login fixo
//      não mexe nas tentativas do cadastro.
//   e) a resposta de erro é sempre a mesma: não revela se o usuário existe, está inativo ou bloqueado.
// Sucesso → JWT { sub, org, nivel, papel, permissoes, perfis, trocarSenha, username, nome, origem }
// válido por 12h.

export const ERRO_LOGIN = 'Usuário ou senha inválidos'
export const JWT_EXPIRA = '12h'

// Username nunca tem "@" e e-mail sempre tem: no máximo um usuário casa com o login.
const SQL_USUARIO = `
  SELECT u.id, u.username, u.nome, u.senha_hash, u.ativo, u.tentativas_falhas, u.bloqueado_ate,
         u.nivel, u.permissoes, u.perfis_permitidos, u.trocar_senha,
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
// antigos que ainda olham papel === 'admin'.
export function payloadDoCadastro(u) {
  const nivel = u.nivel || nivelDoPapel(u.papel) || 'consulta'
  return {
    sub: u.id, org: u.organizacao_id, papel: nivel, nivel,
    permissoes: nivel === 'personalizado' ? normalizarPermissoes(u.permissoes) : {},
    perfis: normalizarPerfis(u.perfis_permitidos),
    trocarSenha: !!u.trocar_senha,
    username: u.username, nome: u.nome || u.username, origem: 'db',
  }
}

// Núcleo do login (testável com qualquer `q(sql, params) → rows`). Devolve o payload do JWT ou null.
// O campo do formulário continua se chamando `username`, mas aceita usuário ou e-mail.
export async function autenticar(q, { username, password } = {}, { env = process.env, agora = new Date() } = {}) {
  const login = normUser(username)
  const senha = String(password ?? '')
  if (!login || !senha) return null

  // (a) usuário do cadastro
  let cadastro = null
  try {
    ;[cadastro] = await q(SQL_USUARIO, [login])
  } catch (err) {
    // Tabela inexistente é esperado antes da migração; qualquer outra falha do banco também segue
    // para o login fixo (se aplicável), para o acesso de emergência funcionar com o banco instável.
    if (!ehTabelaInexistente(err)) console.error('[api/auth] falha ao consultar usuarios:', err.message)
  }

  // (b) cadastro (sem cadastro utilizável, um compare fictício iguala o tempo de resposta)
  const utilizavel = cadastroUtilizavel(cadastro, agora)
  const senhaCadastroOk = utilizavel ? await conferirSenha(senha, cadastro.senha_hash) : await compararFicticio(senha)
  if (senhaCadastroOk) {
    await q('UPDATE usuarios SET tentativas_falhas = 0, bloqueado_ate = NULL, ultimo_login = $2 WHERE id = $1', [cadastro.id, agora])
    return payloadDoCadastro(cadastro)
  }

  // (c) login fixo — REMOVER LOGIN FIXO ANTES DA COMERCIALIZAÇÃO
  const fixo = loginFixoAplicavel(env, login, cadastro)
  const senhaFixaOk = fixo && igualSeguro(senha, env.ADMIN_PASS)
  if (fixo) {
    const chave = `env:${normUser(env.ADMIN_USER)}`
    const estado = await lerBloqueioEnv(q, chave)
    if (!estaBloqueado(estado, agora)) {
      if (senhaFixaOk) {
        if (estado.tentativas_falhas || estado.bloqueado_ate) await gravarBloqueioEnv(q, chave, { tentativas_falhas: 0, bloqueado_ate: null })
        return payloadLoginFixo(q, login, cadastro, agora)
      }
      await gravarBloqueioEnv(q, chave, estadoAposFalha(estado, agora))
    }
  }

  // (d) falha no cadastro: só conta se a senha também não for a do login fixo
  if (utilizavel && !senhaFixaOk) await registrarFalhaCadastro(q, cadastro, agora)
  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  res.setHeader('Cache-Control', 'no-store')

  const secret = process.env.JWT_SECRET
  if (!secret) return res.status(500).json({ error: 'Auth not configured' })

  try {
    const body = await parseBody(req)
    const payload = await autenticar(query, body)
    if (!payload) return res.status(401).json({ error: ERRO_LOGIN })
    const token = jwt.sign(payload, secret, { expiresIn: JWT_EXPIRA })
    return res.json({ token })
  } catch (err) {
    console.error('[api/auth]', err.message)
    return res.status(500).json({ error: 'Falha ao entrar. Tente novamente.' })
  }
}
