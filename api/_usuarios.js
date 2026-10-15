import bcrypt from 'bcryptjs'

// Cadastro de usuários (ETAPA 1 da comercialização): constantes e regras compartilhadas entre o
// login (api/auth.js), a API de usuários (api/usuarios.js) e o seed (scripts/seed-admin.js).
// As tabelas vêm da migração supabase/migrations/2026-10-14_usuarios.sql (rodada à mão no Neon).

export const BCRYPT_CUSTO = 12
export const SENHA_MIN = 8
export const PAPEIS = ['admin', 'usuario', 'leitura']
export const MAX_TENTATIVAS = 5
export const BLOQUEIO_MS = 15 * 60 * 1000
export const USERNAME_RE = /^[a-z0-9._-]{3,40}$/

// Usuário sem diferenciar maiúsculas nem espaços nas pontas (VMOREIRA = vmoreira).
export const normUser = (u) => String(u ?? '').trim().toLowerCase()

export const hashSenha = (senha) => bcrypt.hash(String(senha), BCRYPT_CUSTO)
export const conferirSenha = (senha, hash) => bcrypt.compare(String(senha ?? ''), String(hash || ''))

// Hash descartável para gastar o mesmo tempo de um bcrypt.compare quando não há usuário: sem isso
// o tempo de resposta denunciaria se o username existe.
let hashFicticio
export async function compararFicticio(senha) {
  hashFicticio ??= bcrypt.hash('finup-hash-ficticio', BCRYPT_CUSTO)
  await bcrypt.compare(String(senha ?? ''), await hashFicticio)
  return false
}

// Postgres 42P01 = undefined_table (migração ainda não rodada).
export const ehTabelaInexistente = (err) => err?.code === '42P01'

// Bloqueio por tentativas — mesma regra para os dois logins. `estado` = { tentativas_falhas,
// bloqueado_ate }. Bloqueio vencido zera a contagem: a próxima falha volta a contar do 1.
export const estaBloqueado = (estado, agora) =>
  !!estado?.bloqueado_ate && new Date(estado.bloqueado_ate).getTime() > agora.getTime()

export function estadoAposFalha(estado, agora) {
  const vencido = !!estado?.bloqueado_ate && !estaBloqueado(estado, agora)
  const tentativas = (vencido ? 0 : Number(estado?.tentativas_falhas) || 0) + 1
  return {
    tentativas_falhas: tentativas,
    bloqueado_ate: tentativas >= MAX_TENTATIVAS ? new Date(agora.getTime() + BLOQUEIO_MS) : null,
  }
}

// Erro com status HTTP — os handlers devolvem { error: message } com esse status.
export class ErroHttp extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}
