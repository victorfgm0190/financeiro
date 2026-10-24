// Casamento de lançamentos na conciliação de fatura de cartão: normalização de descrição,
// similaridade e cruzamento Itaú × sistema. O casamento da Revisão da importação mora em
// revisaoImportacao.js.
//
// Vive em lib porque é lógica pura e é onde mora a regra que mais custou acerto de fatura: o
// TIPO faz parte do casamento. Um estorno chega com o valor e a descrição da compra que ele
// estorna — sem comparar o tipo, ele casa com a própria compra e é descartado como duplicata.

// ── Conciliação inteligente (Melhoria 1) ──────────────────────────────────────
// Normaliza texto (maiúsculas, sem acentos) e mede similaridade: 1 = idêntico, 0.9 = um
// contém o outro, senão Jaccard de palavras (% de palavras em comum). Mesmo critério do
// backend (/api/transaction-history) para a busca por fornecedor.
export function normText(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim().replace(/\s+/g, ' ')
}
export function descSimilarity(a, b) {
  const x = normText(a), y = normText(b)
  if (!x || !y) return 0
  if (x === y) return 1
  if (x.includes(y) || y.includes(x)) return 0.9
  const wx = x.split(' ').filter(Boolean), wy = y.split(' ').filter(Boolean)
  const sx = new Set(wx), sy = new Set(wy)
  let inter = 0
  for (const w of sx) if (sy.has(w)) inter++
  const union = new Set([...wx, ...wy]).size
  return union ? inter / union : 0
}

// Remove o sufixo de PARCELA do final da descrição (1–2 dígitos / 1–2 dígitos, com ou sem
// espaços antes). Cobre o lado do sistema ("CLINICA HIGA-CT LT01/03", "CEU INFANTIL-CT   01/06")
// e o do Itaú já convertido ("Clinica Higa-ct Lt 1/3"). Também a forma por extenso ("Parc7",
// "Parc 07", "PARC 3/10", "Parcela 2 de 5"), para "Yelumseg Parc6" e "Yelumseg Parc7" terem a
// mesma base. Sem o padrão no final, não altera nada (lançamentos sem parcela ficam intactos).
// O "ParcN" sai antes e depois do N/Total: as parcelas geradas pela importação antiga ficaram
// "Yelumseg Parc2 11/12" (sufixo colado na descrição do mês) e precisam da mesma base "Yelumseg".
const PARC_SUFIXO_RE = /\s*\bParc(?:ela)?\.?\s*\d{1,2}(?:\s*(?:de|\/)\s*\d{1,2})?\s*$/i
export function stripParcelaSuffix(s) {
  return String(s || '')
    .replace(PARC_SUFIXO_RE, '')
    .replace(/\s*\d{1,2}\/\d{1,2}\s*$/, '')
    .replace(PARC_SUFIXO_RE, '')
}
// Normalização de descrição PARA O MATCHING da conciliação: remove o sufixo de parcela e aplica a
// normalização de texto existente (sem acento, maiúsculas, espaços colapsados). Assim o lançamento
// do sistema (parcela colada "01/03") casa com o do Itaú ("1/3").
export function normalizeDescForMatch(desc) {
  return normText(stripParcelaSuffix(desc))
}

// Cruzamento da reconciliação: casa cada item "Só no Itaú" com um "Só no sistema" (mesmo tipo
// + valor ±0,50 + descrição), 1:1 guloso. Níveis: certeza (idêntica), provável (≥0,70),
// possível (≥0,50). Pré-marca a ação em certeza/provável (Itaú→Ignorar, sistema→Manter);
// possível só recebe badge. Reusa descSimilarity/normText. Devolve cópias anotadas com
// _crossLevel. O TIPO faz parte do casamento: um estorno chega com o valor e a descrição da
// compra que estorna — sem comparar o tipo ele casava com a própria compra e era pré-marcado
// "ignorar" — nunca importado.
export function crossMatchConciliacao(soItau, soSistema) {
  const itauOut = soItau.map(i => ({ ...i }))
  const sysOut = soSistema.map(s => ({ ...s }))
  const used = new Set()
  for (const it of itauOut) {
    let best = null, bestRank = 0, bestSim = -1
    for (const s of sysOut) {
      if (used.has(s.id)) continue
      if ((s.type || 'expense') !== (it.type || 'expense')) continue
      if (Math.abs((Number(it.amount) || 0) - (Number(s.amount) || 0)) > 0.50) continue
      // Compara as descrições SEM o sufixo de parcela (sistema "01/03" vs Itaú "1/3").
      const sim = descSimilarity(stripParcelaSuffix(it.description), stripParcelaSuffix(s.description))
      const rank = normalizeDescForMatch(it.description) === normalizeDescForMatch(s.description) ? 3 : sim >= 0.7 ? 2 : sim >= 0.5 ? 1 : 0
      if (rank === 0) continue
      if (rank > bestRank || (rank === bestRank && sim > bestSim)) { best = s; bestRank = rank; bestSim = sim }
    }
    if (!best) continue
    used.add(best.id)
    const level = bestRank === 3 ? 'certeza' : bestRank === 2 ? 'provavel' : 'possivel'
    it._crossLevel = level; best._crossLevel = level
    it._crossSysId = best.id
    if (level !== 'possivel') { it.acao = 'ignorar'; best.acao = 'manter' }
  }
  return { soItau: itauOut, soSistema: sysOut }
}

// Lançamentos do sistema que bateram com uma linha do arquivo na conciliação: os casados direto
// ({ csv, sys }) e os do casamento cruzado cuja linha do arquivo ficou em "ignorar" (= é o mesmo).
// "Possível" deixa as duas em importar/manter — sem confirmação, não entra. Os marcados para
// excluir também não.
export function idsConciliacaoConferidos(matched, soItau, excluirIds = new Set()) {
  const ids = new Set((matched || []).map(m => m.sys?.id).filter(Boolean))
  for (const i of soItau || []) if (i.acao === 'ignorar' && i._crossSysId) ids.add(i._crossSysId)
  return [...ids].filter(id => !excluirIds.has(id))
}

