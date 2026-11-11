// Guia da Tela: acha na tela o botão de um item pelo atributo data-guia="<tela>.<chave>".
// Elemento visível de um item (o primeiro, quando a marca se repete).
export function elementoDoItem(tela, chave, doc = globalThis.document) {
  if (!doc) return null
  const seletor = `[data-guia="${String(tela).replace(/"/g, '\\"')}.${String(chave).replace(/"/g, '\\"')}"]`
  for (const el of doc.querySelectorAll(seletor)) {
    const r = el.getBoundingClientRect?.()
    if (r && r.width > 0 && r.height > 0) return el
  }
  return null
}

// Elemento visível com data-guia="<alvo>" (alvo completo, ex.: 'agendamento-form.valor').
export function elementoPorGuia(alvo, doc = globalThis.document) {
  if (!doc || !alvo) return null
  const seletor = `[data-guia="${String(alvo).replace(/"/g, '\\"')}"]`
  for (const el of doc.querySelectorAll(seletor)) {
    const r = el.getBoundingClientRect?.()
    if (r && r.width > 0 && r.height > 0) return el
  }
  return null
}

// Parte da tela em que o elemento pode ser visto: a janela recortada por cada container que rola
// (overflow diferente de "visible") acima dele. → { top, left, right, bottom } ou null (nada visível).
export function areaVisivel(el, win = globalThis.window) {
  if (!el || !win) return null
  let a = { top: 0, left: 0, right: win.innerWidth, bottom: win.innerHeight }
  for (let p = el.parentElement; p && p !== win.document.body && p !== win.document.documentElement; p = p.parentElement) {
    const cs = win.getComputedStyle(p)
    if (!/(auto|scroll|hidden|clip)/.test(`${cs.overflow} ${cs.overflowX} ${cs.overflowY}`)) continue
    const r = p.getBoundingClientRect()
    if (!(r.width > 0 && r.height > 0)) continue
    a = { top: Math.max(a.top, r.top), left: Math.max(a.left, r.left), right: Math.min(a.right, r.right), bottom: Math.min(a.bottom, r.bottom) }
  }
  return a.right > a.left && a.bottom > a.top ? a : null
}

// Faixas fixas que nada do guia pode cobrir: cabeçalhos e barras de navegação fixos/grudados.
// → [{ el, top, left, right, bottom }] (o bloco que MORA na faixa pode ter selo nela).
export function faixasFixas(win = globalThis.window) {
  if (!win) return []
  const out = []
  for (const el of win.document.querySelectorAll('header, nav, aside')) {
    if (el.closest('[data-testid="guia-tela"]')) continue
    const pos = win.getComputedStyle(el).position
    if (pos !== 'fixed' && pos !== 'sticky') continue
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) out.push({ el, top: r.top, left: r.left, right: r.right, bottom: r.bottom })
  }
  return out
}

// Botão que dá para "Abrir" pelo guia (ação do bloco). Nada que apague, saia, grave ou pague — nem
// backup (exportar/restaurar/conferir só por clique de quem usa, nunca pelo guia).
const PERIGOSO = /excluir|apagar|remover|sair|estorn|desfazer|salvar|gravar|confirmar|pagar|baixar|limpar|zerar|desligar|exportar|restaurar|backup/i
export function itemAcionavel(item, el) {
  if (!el || PERIGOSO.test(`${item?.rotulo || ''}`)) return false
  if (el.matches?.('button:disabled, [aria-disabled="true"]')) return false
  return !!el.matches?.('button, a[href], [role="button"]')
}
