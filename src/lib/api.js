import { clearScrollRestoration } from '../hooks/useScrollRestoration'

// Chave do JWT no localStorage (compartilhada com Login/PrivateRoute/logout).
export const AUTH_TOKEN_KEY = 'auth_token'

export function getToken() {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY)
  } catch {
    return null
  }
}

// Header Authorization: Bearer <token> a partir do token salvo. Retorna {} quando não há
// token — espalhe em qualquer fetch autenticado: `{ ...authHeaders() }`.
export function authHeaders() {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// Remove o token e volta à tela de login. Chamado no logout e quando a API responde 401
// (token expirado/inválido) — evita o app ficar preso num estado sem sessão.
export function clearTokenAndRedirect() {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY)
  } catch { /* ignore */ }
  clearScrollRestoration()
  if (typeof window !== 'undefined') window.location.reload()
}
