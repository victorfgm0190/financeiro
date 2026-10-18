import { Buffer } from 'node:buffer'
import process from 'node:process'
import crypto from 'node:crypto'
import { centralQuery, withCentralTransaction } from './_central.js'
import { ErroHttp } from './_usuarios.js'
import { TIPOS_FEED, hashIcs } from '../src/lib/agendaIcs.js'

// AGENDA NO CELULAR — feeds .ics no BANCO CENTRAL (supabase/central/2026-10-18_agenda_feeds.sql).
// Nada aqui abre o banco do ambiente: o feed é gerado pelo app do dono (src/lib/agendaFeed.js),
// gravado por /api/agenda-feed e servido por /api/agenda (pública).
//
// Token = 32 bytes aleatórios em base64url. No banco: sha256 (token_hash, o que a rota pública
// procura) + o token em AES-256-GCM (token_cifrado) com a chave AGENDA_TOKEN_KEY — para o dono
// logado ver o link de novo em qualquer aparelho. Nunca o token em texto puro.

export const ERRO_SEM_CHAVE = 'Agenda no celular indisponível: a chave AGENDA_TOKEN_KEY não está configurada no servidor'

export const hashTokenAgenda = (token) => crypto.createHash('sha256').update(String(token)).digest('hex')

// AGENDA_TOKEN_KEY: 32 bytes em base64 / base64url (44 ou 43 caracteres) ou em hex (64). Outra
// coisa → null (a tela avisa e não gera feed).
export function chaveAgenda(env = process.env) {
  const v = String(env.AGENDA_TOKEN_KEY || '').trim()
  if (!v) return null
  let buf = null
  if (/^[0-9a-fA-F]{64}$/.test(v)) buf = Buffer.from(v, 'hex')
  else if (/^[A-Za-z0-9+/_-]{43}=?$/.test(v)) buf = Buffer.from(v.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  return buf && buf.length === 32 ? buf : null
}

// 'v1.<iv>.<tag>.<cifrado>' (base64url). iv de 12 bytes novo a cada cifragem.
export function cifrarToken(token, chave) {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', chave, iv)
  const ct = Buffer.concat([c.update(String(token), 'utf8'), c.final()])
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.')
}

// null quando a chave mudou ou o valor foi adulterado (o GCM confere).
export function decifrarToken(cifrado, chave) {
  try {
    const [v, iv, tag, ct] = String(cifrado || '').split('.')
    if (v !== 'v1' || !chave) return null
    const d = crypto.createDecipheriv('aes-256-gcm', chave, Buffer.from(iv, 'base64url'))
    d.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8')
  } catch {
    return null
  }
}

export function normalizarOpcoes(body = {}) {
  const tipos = [...new Set(Array.isArray(body.tipos) ? body.tipos : [])].filter(t => TIPOS_FEED.includes(t))
  if (tipos.length === 0) throw new ErroHttp(400, 'Escolha Despesas, Receitas ou ambos')
  return { tipos: TIPOS_FEED.filter(t => tipos.includes(t)), mostrarValores: body.mostrarValores !== false }
}

const COLS = 'id, ambiente_sigla, usuario_id, token_cifrado, tipos, mostrar_valores, criado_em, ultimo_acesso_em'

export async function buscarFeedAtivo(sigla, usuarioId, q = centralQuery) {
  const [f] = await q(`SELECT ${COLS} FROM agenda_feeds WHERE ambiente_sigla = $1 AND usuario_id = $2 AND revogado_em IS NULL`, [sigla, usuarioId])
  return f || null
}

// O feed para a tela: com o token decifrado (para montar o link) e o estado do cache por tipo.
export async function feedParaTela(f, chave, q = centralQuery) {
  if (!f) return null
  const cache = await q('SELECT tipo, hash, gerado_em FROM agenda_cache WHERE feed_id = $1', [f.id])
  return {
    id: f.id,
    tipos: f.tipos,
    mostrarValores: f.mostrar_valores,
    token: decifrarToken(f.token_cifrado, chave),
    criadoEm: f.criado_em,
    ultimoAcessoEm: f.ultimo_acesso_em,
    cache: Object.fromEntries(cache.map(c => [c.tipo, { hash: c.hash, geradoEm: c.gerado_em }])),
  }
}

// Cria o feed (ou "Gerar novo link"): revoga o ativo e cria outro, juntos. O cache do antigo vai
// junto com ele (revogado nunca é servido).
export async function criarFeed(sigla, usuarioId, opcoes, chave, { agora = new Date() } = {}) {
  if (!chave) throw new ErroHttp(503, ERRO_SEM_CHAVE)
  const { tipos, mostrarValores } = normalizarOpcoes(opcoes)
  const token = crypto.randomBytes(32).toString('base64url')
  return withCentralTransaction(async (q) => {
    const antigos = await q('UPDATE agenda_feeds SET revogado_em = $3 WHERE ambiente_sigla = $1 AND usuario_id = $2 AND revogado_em IS NULL RETURNING id', [sigla, usuarioId, agora])
    if (antigos.length) await q('DELETE FROM agenda_cache WHERE feed_id = ANY($1)', [antigos.map(a => a.id)])
    const [f] = await q(
      `INSERT INTO agenda_feeds (ambiente_sigla, usuario_id, token_hash, token_cifrado, tipos, mostrar_valores, criado_em)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${COLS}`,
      [sigla, usuarioId, hashTokenAgenda(token), cifrarToken(token, chave), tipos, mostrarValores, agora],
    )
    return f
  })
}

// Muda tipos / mostrar valores do feed ativo (o link continua o mesmo). O cache inteiro sai: o
// próximo envio do app regrava com as opções novas (tipo desmarcado → a rota já responde 404).
export async function alterarOpcoes(sigla, usuarioId, opcoes) {
  const { tipos, mostrarValores } = normalizarOpcoes(opcoes)
  return withCentralTransaction(async (q) => {
    const [f] = await q(
      `UPDATE agenda_feeds SET tipos = $3, mostrar_valores = $4
        WHERE ambiente_sigla = $1 AND usuario_id = $2 AND revogado_em IS NULL RETURNING ${COLS}`,
      [sigla, usuarioId, tipos, mostrarValores],
    )
    if (!f) throw new ErroHttp(404, 'Agenda no celular ainda não foi criada')
    await q('DELETE FROM agenda_cache WHERE feed_id = $1', [f.id])
    return f
  })
}

// Grava o .ics de um tipo do feed (upsert). Hash calculado aqui, igual ao do app.
export async function gravarCache(feedId, tipo, conteudo, { agora = new Date(), q = centralQuery } = {}) {
  const hash = hashIcs(conteudo)
  await q(
    `INSERT INTO agenda_cache (feed_id, tipo, conteudo, hash, gerado_em) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (feed_id, tipo) DO UPDATE SET conteudo = EXCLUDED.conteudo, hash = EXCLUDED.hash, gerado_em = EXCLUDED.gerado_em`,
    [feedId, tipo, conteudo, hash, agora],
  )
  return { hash, geradoEm: agora }
}

// Rota pública: token + ambiente do endereço + tipo → .ics, numa consulta SÓ no central.
// null = não serve (token inexistente/revogado, ambiente errado ou inativo, tipo não escolhido,
// ainda sem conteúdo) — a rota responde 404 sem dizer qual.
export async function conteudoPublico(token, sigla, tipo, q = centralQuery) {
  if (!token || !sigla || !TIPOS_FEED.includes(tipo)) return null
  const [r] = await q(
    `SELECT f.id, c.conteudo,
            (f.ultimo_acesso_em IS NULL OR f.ultimo_acesso_em < now() - interval '1 hour') AS marcar_acesso
       FROM agenda_feeds f
       JOIN ambientes a ON a.sigla = f.ambiente_sigla AND a.status = 'ativo'
       JOIN agenda_cache c ON c.feed_id = f.id AND c.tipo = $3
      WHERE f.token_hash = $1 AND f.ambiente_sigla = $2 AND f.revogado_em IS NULL AND $3 = ANY(f.tipos)`,
    [hashTokenAgenda(token), sigla, tipo],
  )
  if (!r) return null
  if (r.marcar_acesso) await q('UPDATE agenda_feeds SET ultimo_acesso_em = now() WHERE id = $1', [r.id]).catch(() => {})
  return r.conteudo
}

// ─── Mudanças no usuário (api/usuarios.js) ──────────────────────────────────────────────────────
// Desativado → feeds revogados. Nível/permissões/perfis mudaram → cache apagado (feed vazio = 404
// até o dono abrir o app de novo e gerar com o acesso novo). `antes`/`depois`: linhas de usuarios.
// Falha aqui não desfaz a edição.
const mesmoJson = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
export async function aposEditarUsuario(sigla, antes, depois, q = centralQuery) {
  if (!sigla || !antes?.id || !depois) return null
  if (antes.ativo && !depois.ativo) {
    await q('UPDATE agenda_feeds SET revogado_em = now() WHERE ambiente_sigla = $1 AND usuario_id = $2 AND revogado_em IS NULL', [sigla, antes.id])
    return 'revogado'
  }
  if (antes.nivel !== depois.nivel || !mesmoJson(antes.permissoes, depois.permissoes) || !mesmoJson(antes.perfis_permitidos, depois.perfis_permitidos)) {
    await q(
      `DELETE FROM agenda_cache WHERE feed_id IN (
         SELECT id FROM agenda_feeds WHERE ambiente_sigla = $1 AND usuario_id = $2 AND revogado_em IS NULL)`,
      [sigla, antes.id],
    )
    return 'cache_apagado'
  }
  return null
}
