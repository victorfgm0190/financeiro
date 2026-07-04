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

// Guard para endpoints protegidos. Retorna true se autenticado; caso contrário responde
// 401 e retorna false. Uso no topo do handler: `if (!requireAuth(req, res)) return`.
export function requireAuth(req, res) {
  const payload = verifyToken(req)
  if (!payload) {
    res.status(401).json({ error: 'Unauthorized' })
    return false
  }
  return true
}
