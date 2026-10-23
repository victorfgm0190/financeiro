// Revogação de sessão (GRAFITY B5). O JWT vale 12 h e leva nível, permissões e perfis; sem esta
// conferência, desativar ou rebaixar um usuário só valeria quando o token expirasse.
//
// usuarios.token_versao sobe quando o usuário é desativado, muda de nível/permissões/perfis ou troca
// de senha (api/usuarios.js, api/_senhaTokens.js); o token leva a versão do login (`tv`). Cada
// requisição autenticada (comAmbiente) confere: usuário existe, está ativo e a versão bate.
//
// Custo: uma consulta por chave primária no banco do ambiente, com cache por instância de 30 s —
// só para o resultado POSITIVO (ativo e mesma versão). Qualquer divergência consulta de novo antes
// de recusar: um token recém-emitido (troca da própria senha) nunca é barrado por cache velho, e a
// revogação leva no máximo CACHE_MS numa instância que acabou de conferir o usuário.
//
// Fora da conferência: o login fixo de emergência (origem 'env', é a recuperação) e tokens antigos
// sem `origem` (também 'env' em usuarioDoToken). Token sem `tv` (emitido antes da coluna) = versão 0.

export const CACHE_SESSAO_MS = 30_000
const cache = new Map() // `${ambienteId}|${usuarioId}` → { ativo, tv, ate }
export const _limparCacheSessoes = () => cache.clear()

const versaoDoToken = (payload) => Number(payload?.tv) || 0

async function lerUsuario(q, id) {
  try {
    const [u] = await q('SELECT ativo, token_versao FROM usuarios WHERE id = $1', [id])
    return u ? { ativo: !!u.ativo, tv: Number(u.token_versao) || 0 } : null
  } catch (err) {
    // Coluna ainda não migrada: confere só o ativo, sem comparar versão (tv null).
    if (err?.code === '42703') {
      const [u] = await q('SELECT ativo FROM usuarios WHERE id = $1', [id])
      return u ? { ativo: !!u.ativo, tv: null } : null
    }
    // Banco sem a tabela de usuários (ambiente sem login por cadastro): nada a revogar.
    if (err?.code === '42P01') return { ativo: true, tv: null }
    throw err
  }
}

const confere = (u, payload) => !!u && u.ativo && (u.tv === null || u.tv === versaoDoToken(payload))

// true = a sessão do token continua valendo. `q` = consulta no banco do ambiente.
export async function sessaoValida(q, payload, { ambienteId = '', agora = Date.now() } = {}) {
  if ((payload?.origem ?? 'env') !== 'db' || !payload?.sub) return true
  const chave = `${ambienteId}|${payload.sub}`
  const c = cache.get(chave)
  if (c && c.ate > agora && confere(c, payload)) return true
  const u = await lerUsuario(q, payload.sub)
  if (u) cache.set(chave, { ...u, ate: agora + CACHE_SESSAO_MS })
  else cache.delete(chave)
  return confere(u, payload)
}

// SQL que invalida os tokens já emitidos do usuário (usado dentro dos UPDATEs de usuarios).
export const SQL_NOVA_VERSAO = 'token_versao = token_versao + 1'
