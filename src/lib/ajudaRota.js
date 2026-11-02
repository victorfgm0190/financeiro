// Rota da Central de Ajuda no hash da URL: #ajuda, #ajuda/<tela> ou #ajuda/<tela>/<item>. É o que deixa
// o "?" de cada tela, o "Ver com exemplos" do tour e as perguntas frequentes abrirem a ajuda já no
// ponto certo (e sobreviver ao recarregar). Subtelas usam ":" no id (ex.: settings:perfis).
export const AJUDA_HASH_PREFIX = '#ajuda'

export const ehHashAjuda = (hash) =>
  typeof hash === 'string' && (hash === AJUDA_HASH_PREFIX || hash.startsWith(`${AJUDA_HASH_PREFIX}/`))

export function parseAjudaHash(hash) {
  if (!ehHashAjuda(hash)) return { tela: null, chave: null }
  const [tela = null, chave = null] = hash.slice(AJUDA_HASH_PREFIX.length + 1).split('/').map(decodeURIComponent).filter(Boolean)
  return { tela, chave }
}

export const ajudaHash = (tela = null, chave = null) =>
  [AJUDA_HASH_PREFIX, tela && encodeURIComponent(tela), tela && chave && encodeURIComponent(chave)].filter(Boolean).join('/')

// id do elemento na página (âncora): ajuda-<tela>[-<chave>], com ":" trocado.
export const idAncora = (tela, chave = null) => `ajuda-${String(tela).replace(/[^a-z0-9-]/gi, '_')}${chave ? `-${String(chave).replace(/[^a-z0-9-]/gi, '_')}` : ''}`
