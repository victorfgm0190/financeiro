// Fluxo de Caixa no celular: atalhos de horizonte e agrupamento da lista por dia. Só apresentação —
// as linhas são as mesmas que o painel já calculou (computeFluxoCaixa + montarLinhasSimuladas).

// Seletor do topo no mobile. É o mesmo `horizonte` (dias a partir de hoje) do painel, só com
// janelas maiores que os chips do desktop (HORIZONTES).
export const HORIZONTES_MOBILE = [
  { dias: 30, rotulo: 'Mês' },
  { dias: 90, rotulo: '3 meses' },
  { dias: 365, rotulo: '12 meses' },
]

// [{ date, rows }] na ordem em que as linhas chegam (já ordenadas por data), um grupo por dia.
export function agruparPorDia(rows) {
  const grupos = []
  for (const r of rows || []) {
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.date === r.date) ultimo.rows.push(r)
    else grupos.push({ date: r.date, rows: [r] })
  }
  return grupos
}
