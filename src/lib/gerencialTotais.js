// Totais por grupo gerencial de uma fatura. Lógica pura, separada do componente de exibição
// (components/shared/GerencialTotalizer.jsx) para ser testável sem DOM — mesma convenção dos
// demais módulos de src/lib.
//
// Regras:
//   • Despesas (type 'expense') com grupo somam no grupo.
//   • Estornos (type 'income') NÃO entram nos grupos: viram um total à parte, exibido em linha
//     separada e abatido do total da fatura.
//   • Pagamentos de fatura (type 'credit_payment') são ignorados.
//   • Previstos (ocorrências PENDENTES de agendamentos que caem nesta fatura) somam no grupo e
//     são devolvidos também em separado, para o total poder mostrar a quebra realizado/previsto.
//   • Sem grupo → não entra em token nenhum, nem lançamento nem previsto.

const round2 = n => Math.round(n * 100) / 100

// Ordem de exibição: G primeiro, numerados em ordem, D por último.
export function sortKey(g) {
  if (g.number === 1) return -1
  if (g.number === 'D') return 1e9
  return typeof g.number === 'number' ? g.number : 1e8
}

// txs: lançamentos JÁ filtrados para a fatura (despesas + estornos).
// previstos: [{ grupoGerencial, amount }] — ocorrências pendentes já filtradas para a fatura.
//   Quem as calcula é o dono da fatura (tem cartão, período e getNextOccurrences); aqui só se
//   soma. getNextOccurrences exclui ocorrências registradas/puladas, então uma parcela já
//   efetivada entra pelo lado dos lançamentos e nunca pelos previstos — sem dupla contagem.
export function totaisGerenciais({ txs = [], previstos = [], gerencialGroups = [] }) {
  const totals = new Map()
  const previstoPorGrupo = new Map()
  let estornos = 0

  for (const tx of txs) {
    if (tx.type === 'income') {
      estornos = round2(estornos + Math.abs(Number(tx.amount) || 0))
      continue
    }
    if (tx.type !== 'expense' || !tx.grupoGerencial) continue
    totals.set(tx.grupoGerencial, round2((totals.get(tx.grupoGerencial) || 0) + (Number(tx.amount) || 0)))
  }

  for (const p of previstos) {
    if (!p.grupoGerencial) continue
    const v = Number(p.amount) || 0
    if (!v) continue
    previstoPorGrupo.set(p.grupoGerencial, round2((previstoPorGrupo.get(p.grupoGerencial) || 0) + v))
    totals.set(p.grupoGerencial, round2((totals.get(p.grupoGerencial) || 0) + v))
  }

  const items = [...totals.entries()]
    .map(([gid, total]) => {
      const g = gerencialGroups.find(x => x.id === gid)
      return g ? { g, total, previsto: previstoPorGrupo.get(gid) || 0 } : null
    })
    .filter(Boolean)
    .sort((a, b) => sortKey(a.g) - sortKey(b.g))

  return { items, estornos, temPrevisto: items.some(i => i.previsto > 0) }
}
