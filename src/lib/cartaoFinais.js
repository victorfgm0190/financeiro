// Finais do cartão (contas.cartao_finais: ['4541', '1234'] — titular e adicionais) e o vínculo
// cartão → subconta gerencial, que o motor faz pelo NOME "Ger. <apelido>" (AppContext). PURO.
// Imports com .js (usado também pelo backend do Assistente).

// "4541, 1234 / 9999" → { finais: ['4541','1234','9999'], invalidos: [] }. Sem repetição.
export function lerFinais(texto) {
  const partes = String(texto || '').split(/[^0-9]+/).filter(Boolean)
  const finais = []
  const invalidos = []
  for (const p of partes) {
    if (!/^\d{4}$/.test(p)) invalidos.push(p)
    else if (!finais.includes(p)) finais.push(p)
  }
  return { finais, invalidos }
}

export const finaisDoCartao = (c) => (Array.isArray(c?.cartaoFinais) ? c.cartaoFinais
  : Array.isArray(c?.cartao_finais) ? c.cartao_finais : []).map(String)

// "final 4541", "final: 4541", "cartão final 4541" → '4541' (ou null).
export function finalCitado(texto) {
  const m = String(texto || '').match(/final\D{0,3}(\d{4})\b/i)
  return m ? m[1] : null
}

// Cartões (ativos) que têm esse final.
export const cartoesComFinal = (contas, final) =>
  (contas || []).filter(c => c.type === 'credit' && c.active !== false && finaisDoCartao(c).includes(final))

// Chave do vínculo do motor: o apelido do cartão, ou os 6 primeiros caracteres do nome.
export const chaveSubconta = (card) => card?.apelido || card?.name?.slice(0, 6) || 'CC'
export const subcontaDoCartao = (contas, card) =>
  card?.type === 'credit' ? (contas || []).find(a => a.name === `Ger. ${chaveSubconta(card)}`) || null : null

// Subconta gerencial (marcação; o nome "Ger." é só reforço).
export const ehSubcontaGerencialApp = (a) =>
  !!a && a.type !== 'credit' && (a.type === 'gerencial' || !!a.isGerencial || /^Ger\. /.test(a.name || ''))
