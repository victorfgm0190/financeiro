// Helpers de matching de descrição por fornecedor, compartilhados entre a classificação
// aprendida (AppContext.learnClassification) e as sugestões da importação (ImportPanel).

// Extrai uma keyword estável da descrição de um lançamento (fornecedor normalizado):
// remove prefixos de meio de pagamento (PAG*/COMPRA/PARC/PGTO/PIX/TED/DOC/DEB/CRE) e o sufixo
// numérico/código final, e usa as 2 primeiras palavras significativas (≥3 chars) — ex.:
// "PAG*ACADEMIA FITNESS SP" → "academia fitness"; "COMPRA POSTO IPIRANGA 123" → "posto ipiranga".
// Retorna null (min. 4 chars) quando não sobra nada útil, para o chamador cair no fallback.
export function extractLearnKeyword(description) {
  let s = (description || '').toLowerCase().trim()
  // 1. Prefixos de meio de pagamento (com '*' ou espaço após). Longos antes dos curtos.
  s = s.replace(/^(parcela|parc|compra|pgto|pgt|pag|pix|ted|doc|deb|cre)[*\s]+/i, '').trim()
  // 2. Sufixo numérico/código no final (datas, CPF, parcela "01/03", códigos).
  s = s.replace(/[\s*/-]+\d[\d./-]*$/, '').trim()
  const words = s.split(/\s+/).filter(w => w.length >= 3)
  const keyword = words.slice(0, 2).join(' ').trim()
  return keyword.length >= 4 ? keyword : null
}
