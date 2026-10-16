// Ordem dos perfis (perfis.ordem): chips do topo, seletores e perfil inicial do app.

export const ordenarPerfis = (profiles) => [...(profiles || [])]
  .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || String(a.name || '').localeCompare(String(b.name || '')))

// Setas ↑↓ em Configurações: troca de posição e renumera 0..N-1.
export function moverPerfil(profiles, id, direcao) {
  const lista = ordenarPerfis(profiles)
  const i = lista.findIndex(p => p.id === id)
  const j = direcao === 'up' ? i - 1 : i + 1
  if (i < 0 || j < 0 || j >= lista.length) return profiles
  ;[lista[i], lista[j]] = [lista[j], lista[i]]
  return lista.map((p, k) => ({ ...p, ordem: k }))
}

export const proximaOrdem = (profiles) =>
  (profiles || []).reduce((m, p) => Math.max(m, Number.isFinite(p.ordem) ? p.ordem : -1), -1) + 1

// Perfil ativo ao abrir: a escolha da sessão (sessionStorage) se ainda existir; senão o 1º da
// ordem. TUDO = "Tudo" escolhido na sessão (null no app).
export const PERFIL_SESSAO_KEY = 'finup.perfilAtivo'
export const TUDO = '__tudo__'
export function perfilInicial(profiles, escolhaSessao) {
  const lista = ordenarPerfis(profiles)
  if (escolhaSessao === TUDO) return null
  if (escolhaSessao && lista.some(p => p.id === escolhaSessao)) return escolhaSessao
  return lista[0]?.id ?? null
}
