import jwt from 'jsonwebtoken'

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

// Payload do JWT → req.user. Token novo: { sub, org, papel, username, nome, origem }. Token antigo
// (login de antes do cadastro: { user, role }) continua aceito até expirar — conta como login fixo.
export function usuarioDoToken(p) {
  const username = p.username ?? p.user ?? null
  return {
    id: p.sub ?? (username ? `env:${username}` : null),
    orgId: p.org ?? null,
    papel: p.papel ?? p.role ?? null,
    username,
    nome: p.nome ?? username,
    origem: p.origem ?? 'env',
  }
}

// Guard para endpoints protegidos. Retorna true se autenticado (e preenche req.user); caso
// contrário responde 401 e retorna false. Uso no topo do handler: `if (!requireAuth(req, res)) return`.
export function requireAuth(req, res) {
  const payload = verifyToken(req)
  if (!payload) {
    res.status(401).json({ error: 'Unauthorized' })
    return false
  }
  req.user = usuarioDoToken(payload)
  return true
}

// Guard de administrador: 401 sem sessão, 403 com sessão de papel diferente de 'admin'.
export function requireAdmin(req, res) {
  if (!requireAuth(req, res)) return false
  if (req.user.papel !== 'admin') {
    res.status(403).json({ error: 'Acesso restrito a administradores' })
    return false
  }
  return true
}
