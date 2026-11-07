// Rodapé TOTAL GERAL do Fluxo Futuro: soma só o que as linhas já calcularam (`projections` do FluxoTab),
// para o total bater com as linhas exibidas. `investidoDe(f)` é o mesmo valor da coluna Total Investido.
const round2 = (n) => Math.round(n * 100) / 100
const semMenosZero = (n) => round2(n) || 0

export function totaisFluxoFuturo(projections, investidoDe) {
  const meses = projections[0]?.monthly.length || 0
  const investido = projections.reduce((s, p) => s + (Number(investidoDe(p.f)) || 0), 0)
  const monthly = Array.from({ length: meses }, (_, i) => {
    const soma = (campo) => semMenosZero(projections.reduce((s, p) => s + (Number(p.monthly[i]?.[campo]) || 0), 0))
    return { dep: soma('dep'), res: soma('res'), prov: soma('prov'), saldo: soma('saldo') }
  })
  return { investido: semMenosZero(investido), monthly }
}
