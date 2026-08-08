// Casamento de lançamentos na importação e na conciliação de fatura de cartão: normalização de
// descrição, similaridade, nível de duplicata e cruzamento Itaú × sistema.
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
// e o do Itaú já convertido ("Clinica Higa-ct Lt 1/3"). Sem o padrão no final, não altera nada
// (lançamentos sem parcela ficam intactos).
export function stripParcelaSuffix(s) {
  return String(s || '').replace(/\s*\d{1,2}\/\d{1,2}\s*$/, '')
}
// Normalização de descrição PARA O MATCHING da conciliação: remove o sufixo de parcela e aplica a
// normalização de texto existente (sem acento, maiúsculas, espaços colapsados). Assim o lançamento
// do sistema (parcela colada "01/03") casa com o do Itaú ("1/3").
export function normalizeDescForMatch(desc) {
  return normText(stripParcelaSuffix(desc))
}

// Nível de duplicata, testado em ordem (primeiro match vence). Candidatos = lançamentos da
// MESMA fatura do cartão. Retorna { level, tx }: level = 'certeza' | 'provavel' | 'possivel' |
// null e tx = o lançamento do BANCO que casou (null quando não há match).
//   certeza : mesmo tipo + date_cartao igual + valor ±0,50 + descrição idêntica
//   provavel: mesmo tipo + date_cartao igual + valor ±0,50 + descrição similar (≥70%)
//   possivel: mesmo tipo + valor ±0,50 + descrição similar (≥70%), sem considerar data
//
// O TIPO faz parte do casamento. Um estorno chega como receita com o valor e a descrição da
// compra que ele estorna — sem comparar o tipo, ele casava com a própria compra original e
// virava "certeza" (nunca importável) ou "possível" (desmarcado por padrão): o estorno sumia
// sem aviso. É a mesma relação que applyEstornoInheritance usa de propósito para HERDAR a
// classificação da compra — herdar sim, deduplicar não.
export function computeDupMatch(row, candidates) {
  const none = { level: null, tx: null }
  if (!candidates || candidates.length === 0) return none
  const amt = Number(row.amount) || 0
  const rowType = row.type || 'expense'
  const rowCardDate = row._dateCartao || row.date
  const sameType = (t) => (t.type || 'expense') === rowType
  const amtClose = (t) => sameType(t) && Math.abs((Number(t.amount) || 0) - amt) <= 0.50
  const dateEq = (t) => !!rowCardDate && (t.dateCartao || t.date) === rowCardDate
  for (const t of candidates) if (amtClose(t) && dateEq(t) && normText(t.description) === normText(row.description)) return { level: 'certeza', tx: t }
  for (const t of candidates) if (amtClose(t) && dateEq(t) && descSimilarity(t.description, row.description) >= 0.7) return { level: 'provavel', tx: t }
  for (const t of candidates) if (amtClose(t) && descSimilarity(t.description, row.description) >= 0.7) return { level: 'possivel', tx: t }
  return none
}

// Cruzamento da reconciliação: casa cada item "Só no Itaú" com um "Só no sistema" (mesmo tipo
// + valor ±0,50 + descrição), 1:1 guloso. Níveis: certeza (idêntica), provável (≥0,70),
// possível (≥0,50). Pré-marca a ação em certeza/provável (Itaú→Ignorar, sistema→Manter);
// possível só recebe badge. Reusa descSimilarity/normText. Devolve cópias anotadas com
// _crossLevel. O tipo entra no casamento pelo mesmo motivo de computeDupMatch: sem ele um
// estorno casava com a compra que estorna e era pré-marcado "ignorar" — nunca importado.
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
    if (level !== 'possivel') { it.acao = 'ignorar'; best.acao = 'manter' }
  }
  return { soItau: itauOut, soSistema: sysOut }
}

