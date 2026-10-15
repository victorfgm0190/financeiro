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

// Sessão atual, lida do payload do JWT salvo (só para EXIBIR nome/papel/origem — quem autoriza é a
// API). Token novo: { sub, org, papel, username, nome, origem }; token antigo { user, role } conta
// como login fixo. Token ilegível (ex.: modo dev) → null.
export function getSessao() {
  const token = getToken()
  if (!token) return null
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
    const p = JSON.parse(new TextDecoder().decode(bytes))
    const username = p.username ?? p.user ?? null
    return {
      id: p.sub ?? null,
      username,
      nome: p.nome ?? username,
      papel: p.papel ?? p.role ?? null,
      origem: p.origem ?? 'env',
    }
  } catch {
    return null
  }
}
