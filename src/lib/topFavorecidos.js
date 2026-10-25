// Ranking de favorecidos do card "Top 5 Favorecidos" do Painel. Recebe a MESMA lista de
// lançamentos dos KPIs "Receitas do Mês" / "Despesas do Mês" (lib/receitasDespesas) — aqui só se
// agrupa, sem reclassificar: a soma dos grupos + "sem favorecido" é o total do card.
import { nomeFavorecido } from './favorecidos'

// Chave de agrupamento: trim + sem diferenciar maiúsculas ("MAYARA" = "Mayara ").
export const chaveFavorecido = (payee) => nomeFavorecido(payee).toLocaleLowerCase('pt-BR')

// txs → { grupos: [{ chave, nome, total, qtd, pct, txs }] (maior → menor), semFavorecido: { total, qtd, txs }, total }.
// `nome` é a grafia mais usada do grupo; `pct` é sobre o total da lista (o do card).
export function agruparPorFavorecido(txs) {
  const porChave = new Map()
  const semFavorecido = { total: 0, qtd: 0, txs: [] }
  let total = 0
  for (const t of txs || []) {
    const valor = Number(t.amount) || 0
    total += valor
    const chave = chaveFavorecido(t.payee)
    if (!chave) {
      semFavorecido.total += valor
      semFavorecido.qtd++
      semFavorecido.txs.push(t)
      continue
    }
    let g = porChave.get(chave)
    if (!g) { g = { chave, grafias: new Map(), total: 0, qtd: 0, txs: [] }; porChave.set(chave, g) }
    const grafia = nomeFavorecido(t.payee)
    g.grafias.set(grafia, (g.grafias.get(grafia) || 0) + 1)
    g.total += valor
    g.qtd++
    g.txs.push(t)
  }
  const grupos = [...porChave.values()]
    .map(({ grafias, ...g }) => ({
      ...g,
      nome: [...grafias.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))[0][0],
      pct: total !== 0 ? (g.total / total) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR'))
  return { grupos, semFavorecido, total }
}
