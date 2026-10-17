import { clearScrollRestoration } from '../hooks/useScrollRestoration'
import {
  pode, podeGravar, atendeRegra, regraDaRota, MODULO_DA_TABELA, podeGravarConfiguracoes, normalizarPerfis,
} from './permissoes.js'

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

// Sessão atual, lida do payload do JWT salvo. Serve para a INTERFACE (menu, botões, o que o app
// tenta gravar) — quem autoriza de verdade é a API. Token novo: { sub, org, nivel, permissoes,
// perfis, trocarSenha, username, nome, origem, amb, amb_sigla }; token antigo (sem nivel) deriva o
// nível do papel; sem amb_sigla, é do ambiente principal ('vm').
// Token ilegível (ex.: modo dev) → null.
const NIVEL_DO_PAPEL = { admin: 'admin', usuario: 'operador', leitura: 'consulta' }
export function getSessao() {
  const token = getToken()
  if (!token) return null
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
    const p = JSON.parse(new TextDecoder().decode(bytes))
    const username = p.username ?? p.user ?? null
    const papel = p.papel ?? p.role ?? null
    return {
      id: p.sub ?? null,
      username,
      nome: p.nome ?? username,
      papel,
      nivel: p.nivel ?? NIVEL_DO_PAPEL[papel] ?? null,
      permissoes: p.permissoes || {},
      perfis: normalizarPerfis(p.perfis),
      trocarSenha: !!p.trocarSenha,
      origem: p.origem ?? 'env',
      ambSigla: p.amb_sigla ?? 'vm',
    }
  } catch {
    return null
  }
}

// O app pode tentar esta gravação? Mesmas regras da API (src/lib/permissoes.js). Sem sessão legível
// deixa passar — a API decide. O /api/sync decide pela tabela (a API ainda filtra linha a linha).
export function gravacaoPermitida(path, method, body) {
  const s = getSessao()
  if (!s?.nivel) return true
  if (/^\/api\/sync\/?$/.test(String(path).split('?')[0])) {
    const tipo = body?.type
    if (tipo === 'settings') return podeGravarConfiguracoes(s)
    if (tipo === 'payees') return pode(s, 'lancamentos', 'incluir') || pode(s, 'lancamentos', 'editar')
    if (tipo === 'accounts') return podeGravar(s, 'contas')
    const mod = MODULO_DA_TABELA[body?.table]
    if (body?.table === 'configuracoes') return podeGravarConfiguracoes(s)
    return mod ? podeGravar(s, mod) : pode(s, 'configuracoes', 'editar')
  }
  return atendeRegra(s, regraDaRota(path, method))
}
