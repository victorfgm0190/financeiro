// Derivações puras do registro de módulos (barra, "+", "Mais", cards do Início). Sem React.

export const MAX_TABS = 4

export const modulosPorLugar = (modules, place) => modules.filter(m => m.place === place)

// Abas da barra inferior: no máximo MAX_TABS, na ordem do registro.
export const abas = (modules) => modulosPorLugar(modules, 'tab').slice(0, MAX_TABS)

// Ações do "+": primárias (grid 2x2) e o resto (lista).
export function acoes(modules) {
  const todas = modulosPorLugar(modules, 'action')
  return { primarias: todas.filter(m => m.primary), outras: todas.filter(m => !m.primary) }
}

// Seções da tela "Mais": grupos de 'more' (na ordem de 1ª aparição), depois "Melhor no
// computador" ('desktop') e por fim Configurações ('config'). Seções vazias saem.
export function secoesMais(modules) {
  const grupos = new Map()
  for (const m of modulosPorLugar(modules, 'more')) {
    const g = m.group || 'Outros'
    if (!grupos.has(g)) grupos.set(g, [])
    grupos.get(g).push(m)
  }
  const secoes = [...grupos].map(([titulo, itens]) => ({ titulo, tipo: 'grupo', itens }))
  secoes.push({ titulo: 'Melhor no computador', tipo: 'desktop', itens: modulosPorLugar(modules, 'desktop') })
  secoes.push({ titulo: 'Configurações', tipo: 'config', itens: modulosPorLugar(modules, 'config') })
  return secoes.filter(s => s.itens.length > 0)
}

// Cards do Início: preferência salva [{ id, on }] (ordem + liga/desliga) aplicada aos módulos com
// card: true. Sem preferência → todos ligados na ordem do registro. Card novo (fora da
// preferência) entra ligado no fim; id da preferência que não é mais card é ignorado.
export function resolverCards(modules, pref) {
  const cards = modules.filter(m => m.card)
  const porId = new Map(cards.map(m => [m.id, m]))
  const out = []
  const vistos = new Set()
  for (const p of Array.isArray(pref) ? pref : []) {
    const m = p && porId.get(p.id)
    if (!m || vistos.has(p.id)) continue
    vistos.add(p.id)
    out.push({ modulo: m, on: p.on !== false })
  }
  for (const m of cards) if (!vistos.has(m.id)) out.push({ modulo: m, on: true })
  return out
}

// Lista resolvida → formato salvo em settings.mobileHomeCards (coluna configuracoes.mobile_home_cards).
export const prefDosCards = (lista) => lista.map(c => ({ id: c.modulo.id, on: !!c.on }))

// Módulo que exibe um painel do desktop (page) — usado quando um painel navega por id de página.
export const moduloDaPagina = (modules, page) => modules.find(m => m.page === page) || null
