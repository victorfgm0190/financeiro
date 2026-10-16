import { authHeaders, clearTokenAndRedirect } from './api'

// Cadastro de usuários (Configurações › Usuários) e troca da própria senha — sempre via /api/usuarios.
async function chamar(url, { method = 'GET', body } = {}) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) {
    clearTokenAndRedirect()
    throw new Error('Sessão expirada')
  }
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `Falha (${res.status})`)
  return json
}

export const listarUsuarios = () => chamar('/api/usuarios').then(r => ({ usuarios: r.usuarios || [], perfis: r.perfis || [] }))
export const criarUsuario = (dados) => chamar('/api/usuarios', { method: 'POST', body: dados }).then(r => r.usuario)
export const editarUsuario = (dados) => chamar('/api/usuarios', { method: 'PATCH', body: dados }).then(r => r.usuario)
export const trocarMinhaSenha = (senhaAtual, novaSenha) =>
  chamar('/api/usuarios?acao=minha-senha', { method: 'POST', body: { senhaAtual, novaSenha } })
