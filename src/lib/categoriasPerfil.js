// Categorias por perfil (categorias.perfil_ids). Vazio/NULL = a categoria vale para TODOS os
// perfis. É só filtro das LISTAS DE ESCOLHA — relatórios, KPIs e saldos não passam por aqui.

// perfilId vazio ("Tudo" no topo) = sem filtro.
export function categoriaDisponivelParaPerfil(cat, perfilId) {
  if (!perfilId) return true
  const ids = cat?.perfilIds
  if (!Array.isArray(ids) || ids.length === 0) return true
  return ids.includes(perfilId)
}

// Filtra a lista mantendo SEMPRE as categorias em `manterIds` (a categoria já gravada num
// lançamento/agendamento em edição continua selecionável, mesmo sendo de outro perfil).
export function filtrarCategoriasPorPerfil(categories, perfilId, manterIds = []) {
  if (!perfilId) return categories || []
  const manter = new Set((Array.isArray(manterIds) ? manterIds : [manterIds]).filter(Boolean))
  return (categories || []).filter(c => manter.has(c.id) || categoriaDisponivelParaPerfil(c, perfilId))
}

// Ids de categoria com movimento no período [from, to] ('YYYY-MM-DD', inclusivo) na lista de
// lançamentos dada (já recortada pelo perfil exibido). Usado como `manterIds` em listas de FILTRO
// de relatório: categoria de outro perfil com lançamento no período não pode sumir do filtro.
export function categoriasComMovimento(transactions, from, to) {
  const ids = new Set()
  for (const tx of transactions || []) {
    if (!tx.categoryId || !tx.date) continue
    if (from && tx.date < from) continue
    if (to && tx.date > to) continue
    ids.add(tx.categoryId)
  }
  return [...ids]
}

// Perfil que governa a escolha de categoria: o da conta (quando ela tem perfil); senão o chip
// do topo (null = "Tudo").
export function perfilParaCategorias(accounts, accountId, activeProfileId) {
  const acc = accountId ? (accounts || []).find(a => a.id === accountId) : null
  return acc?.profileId || activeProfileId || null
}

// Rótulo compacto do seletor de perfis: "Todos" | nome do perfil | "N perfis".
export function rotuloPerfis(perfilIds, profiles) {
  const ids = Array.isArray(perfilIds) ? perfilIds : []
  if (ids.length === 0) return 'Todos'
  if (ids.length === 1) return (profiles || []).find(p => p.id === ids[0])?.name || '1 perfil'
  return `${ids.length} perfis`
}
