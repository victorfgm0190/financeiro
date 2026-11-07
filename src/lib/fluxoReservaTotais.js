// Rodapé TOTAL GERAL do Fluxo Futuro: soma só o que as linhas já calcularam (`projections` do FluxoTab),
// para o total bater com as linhas exibidas. `investidoDe(f)` é o mesmo valor da coluna Total Investido.
const round2 = (n) => Math.round(n * 100) / 100
const semMenosZero = (n) => round2(n) || 0

// Funções de reserva no filtro de perfil do topo (Resumo e Fluxo Futuro). A função pertence ao perfil da conta reserva
// vinculada; conta sem perfil (ou com perfil que não existe mais, mesma regra do selo
// perfilDaConta) é "Sem vínculo" e aparece em todos os perfis. Sem perfil ativo ("Tudo"): todas.
export function funcoesReservaNoPerfil(funcoes, contas, perfis, perfilAtivoId) {
  const contaPorId = new Map((contas || []).map(a => [a.id, a]))
  const perfilIds = new Set((perfis || []).map(p => p.id))
  const semVinculo = new Set()
  const lista = []
  for (const f of funcoes) {
    const perfilId = contaPorId.get(f.accountId)?.profileId
    const vinculada = !!perfilId && perfilIds.has(perfilId)
    if (!vinculada) semVinculo.add(f.id)
    if (!perfilAtivoId || !vinculada || perfilId === perfilAtivoId) lista.push(f)
  }
  return { funcoes: lista, semVinculo }
}

// Linhas por função (razão diário, fechamentos) no filtro de perfil: só as das funções visíveis
// (`funcoesVisiveis` = funcoesReservaNoPerfil(...).funcoes). Em "Tudo" volta tudo, inclusive linhas de
// função que não existe mais; dentro de um perfil, função excluída não aparece (não tem conta nem
// perfil). As linhas não são alteradas: o filtro só decide quais aparecem.
export function linhasDasFuncoesNoPerfil(linhas, funcoesVisiveis, perfilAtivoId) {
  if (!perfilAtivoId) return linhas || []
  const ids = new Set((funcoesVisiveis || []).map(f => f.id))
  return (linhas || []).filter(l => ids.has(l.function_id))
}

export function totaisFluxoFuturo(projections, investidoDe) {
  const meses = projections[0]?.monthly.length || 0
  const investido = projections.reduce((s, p) => s + (Number(investidoDe(p.f)) || 0), 0)
  const monthly = Array.from({ length: meses }, (_, i) => {
    const soma = (campo) => semMenosZero(projections.reduce((s, p) => s + (Number(p.monthly[i]?.[campo]) || 0), 0))
    return { dep: soma('dep'), res: soma('res'), prov: soma('prov'), saldo: soma('saldo') }
  })
  return { investido: semMenosZero(investido), monthly }
}
