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
