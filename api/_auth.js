import jwt from 'jsonwebtoken'
import { regraDaRota, atendeRegra, normalizarPerfis } from '../src/lib/permissoes.js'
import { nivelDoPapel } from './_usuarios.js'

// Extrai e valida o Bearer token do header Authorization. Retorna o payload decodificado
// ou null (token ausente/inválido/expirado, ou JWT_SECRET não configurado no ambiente).
export function verifyToken(req) {
  const secret = process.env.JWT_SECRET
  if (!secret) return null
  const header = req.headers?.authorization || req.headers?.Authorization || ''
  const m = /^Bearer\s+(.+)$/i.exec(header)
  if (!m) return null
  try {
    return jwt.verify(m[1], secret)
  } catch {
    return null
  }
}

// Payload do JWT → req.user. Token novo: { sub, org, nivel, permissoes, perfis, username, nome,
// origem }. Token antigo (sem nivel: { sub, org, papel } ou { user, role }) vale até expirar, com o
// nível derivado do papel.
export function usuarioDoToken(p) {
  const username = p.username ?? p.user ?? null
  const papel = p.papel ?? p.role ?? null
  return {
    id: p.sub ?? (username ? `env:${username}` : null),
    orgId: p.org ?? null,
    nivel: p.nivel ?? nivelDoPapel(papel),
    papel,
    permissoes: p.permissoes || {},
    perfis: normalizarPerfis(p.perfis),
    username,
    nome: p.nome ?? username,
    origem: p.origem ?? 'env',
  }
}

// Caminho da rota (/api/... sem query) a partir do req.
function rotaDoReq(req) {
  try { return new URL(req.url || '', 'http://x').pathname } catch { return String(req.url || '') }
}

// Guard para endpoints protegidos (middleware de TODAS as rotas que gravam): token válido (senão
// 401) e permissão do módulo/ação que a rota + método exigem (src/lib/permissoes.js regraDaRota —
// senão 403). Preenche req.user. Uso no topo do handler: `if (!requireAuth(req, res)) return`.
// O /api/sync decide pela tabela, dentro do handler (autorizarSync).
export function requireAuth(req, res) {
  const payload = verifyToken(req)
  if (!payload) {
    res.status(401).json({ error: 'Unauthorized' })
    return false
  }
  req.user = usuarioDoToken(payload)
  const regra = regraDaRota(rotaDoReq(req), req.method)
  if (!atendeRegra(req.user, regra)) {
    res.status(403).json({ error: 'Sem permissão para esta operação', modulo: regra.modulo, acao: regra.acao })
    return false
  }
  return true
}

// Guard de administrador: 401 sem sessão, 403 com sessão de papel diferente de 'admin'.
export function requireAdmin(req, res) {
  if (!requireAuth(req, res)) return false
  if (req.user.nivel !== 'admin') {
    res.status(403).json({ error: 'Acesso restrito a administradores' })
    return false
  }
  return true
}
