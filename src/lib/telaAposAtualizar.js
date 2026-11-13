// Depois de "Atualizar agora" a página recarrega: volta para a MESMA tela em que a pessoa estava (não
// para o Painel). O App informa a tela atual; antes de recarregar, ela é guardada na sessão do
// navegador (sessionStorage — só esta aba, some ao fechar) e lida UMA vez na abertura seguinte.
const CHAVE = 'finup_tela_apos_atualizar'
let atual = null

export function definirTelaAtual(tela) { atual = tela || null }

export function guardarTelaAtual(storage = globalThis.sessionStorage) {
  if (!atual) return
  try { storage?.setItem(CHAVE, JSON.stringify({ ...atual, em: Date.now() })) } catch { /* sem storage: abre no Painel */ }
}

// → { page, mobile } guardada há menos de 10 min (e apaga), ou null.
export function lerTelaGuardada(storage = globalThis.sessionStorage, agora = Date.now()) {
  try {
    const bruto = storage?.getItem(CHAVE)
    if (!bruto) return null
    storage.removeItem(CHAVE)
    const t = JSON.parse(bruto)
    if (!t?.page || agora - (Number(t.em) || 0) > 10 * 60 * 1000) return null
    return { page: String(t.page), mobile: t.mobile ? String(t.mobile) : null }
  } catch { return null }
}
