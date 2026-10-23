import crypto from 'node:crypto'
import { hashSenha } from './_usuarios.js'
import { SQL_NOVA_VERSAO } from './_sessao.js'

// LINKS DE SENHA (tabela senha_tokens do banco do AMBIENTE — supabase/migrations/2026-10-17_senha_tokens.sql).
//   'redefinir' ("Esqueci minha senha", 1 h) e 'convite' (admin envia, 48 h).
// Token = 32 bytes aleatórios em base64url; no banco só o sha256. Uso único, e gerar um novo invalida
// os anteriores do mesmo usuário. Todas as funções recebem `q` do banco do ambiente (rodarNoAmbiente):
// token de um ambiente nunca é achado no banco de outro.

export const VALIDADE_MS = { redefinir: 60 * 60 * 1000, convite: 48 * 60 * 60 * 1000 }
export const ERRO_LINK = 'Link expirado ou já utilizado'

export const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex')

// `q` deve ser de uma transação (invalida os anteriores e grava o novo juntos).
export async function gerarTokenSenha(q, usuarioId, tipo, { ip = null, agora = new Date() } = {}) {
  if (!VALIDADE_MS[tipo]) throw new Error(`tipo de link inválido: ${tipo}`)
  const token = crypto.randomBytes(32).toString('base64url')
  await q('UPDATE senha_tokens SET usado_em = $2 WHERE usuario_id = $1 AND usado_em IS NULL', [usuarioId, agora])
  await q(
    'INSERT INTO senha_tokens (usuario_id, token_hash, tipo, expira_em, criado_em, ip) VALUES ($1, $2, $3, $4, $5, $6)',
    [usuarioId, hashToken(token), tipo, new Date(agora.getTime() + VALIDADE_MS[tipo]), agora, ip],
  )
  return token
}

// Token ainda utilizável (não usado, não vencido, usuário ativo) → { usuario_id, nome, tipo } ou null.
export async function buscarTokenValido(q, token, { agora = new Date() } = {}) {
  if (!token) return null
  const [r] = await q(
    `SELECT t.usuario_id, t.tipo, coalesce(u.nome, u.username) AS nome
       FROM senha_tokens t JOIN usuarios u ON u.id = t.usuario_id
      WHERE t.token_hash = $1 AND t.usado_em IS NULL AND t.expira_em > $2 AND u.ativo`,
    [hashToken(token), agora],
  )
  return r || null
}

// Gasta o token (atômico: dois envios simultâneos → só um passa) e grava a senha nova: zera
// tentativas e bloqueio e tira a marca "trocar senha". `q` de uma transação. true/false.
export async function definirSenhaComToken(q, token, novaSenha, { agora = new Date() } = {}) {
  if (!token) return false
  const [t] = await q(
    `UPDATE senha_tokens t SET usado_em = $2
       FROM usuarios u
      WHERE u.id = t.usuario_id AND u.ativo AND t.token_hash = $1 AND t.usado_em IS NULL AND t.expira_em > $2
     RETURNING t.usuario_id`,
    [hashToken(token), agora],
  )
  if (!t) return false
  await q(
    `UPDATE usuarios SET senha_hash = $2, tentativas_falhas = 0, bloqueado_ate = NULL, trocar_senha = false,
            ${SQL_NOVA_VERSAO}, updated_at = now()
      WHERE id = $1`,
    [t.usuario_id, await hashSenha(novaSenha)],
  )
  await q('UPDATE senha_tokens SET usado_em = $2 WHERE usuario_id = $1 AND usado_em IS NULL', [t.usuario_id, agora])
  return true
}
