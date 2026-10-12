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

// Seções da tela "Mais": grupos de 'more' (na ordem de 1ª aparição) e por fim Configurações
// ('config'). Módulos 'desktop' não aparecem no mobile. Seções vazias saem.
export function secoesMais(modules) {
  const grupos = new Map()
  for (const m of modulosPorLugar(modules, 'more')) {
    const g = m.group || 'Outros'
    if (!grupos.has(g)) grupos.set(g, [])
    grupos.get(g).push(m)
  }
  const secoes = [...grupos].map(([titulo, itens]) => ({ titulo, tipo: 'grupo', itens }))
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

// Módulo do mobile que exibe um painel do desktop (page). Módulo 'desktop' nunca conta.
export const moduloDaPagina = (modules, page) =>
  modules.find(m => m.page === page && m.place !== 'desktop') || null

export const MODULO_INICIAL = 'inicio'

// Páginas e seções de Configurações que só existem no computador (place: 'desktop').
export const paginasSoDesktop = (modules) =>
  new Set(modulosPorLugar(modules, 'desktop').map(m => m.page).filter(Boolean))
export const secoesConfigSoDesktop = (modules) =>
  new Set(modulosPorLugar(modules, 'desktop').flatMap(m => m.configSecoes || []))

// Proteção do mobile (ponto único): módulo aberto válido. Id inexistente ou de um módulo
// 'desktop' (estado antigo, scroll salvo…) → Início.
export function moduloMobile(modules, id) {
  const m = modules.find(x => x.id === id)
  return m && m.place !== 'desktop' ? m.id : MODULO_INICIAL
}

// Módulo do mobile depois de navegar para uma página do desktop (navigate vindo de um painel):
// página só do computador → Início; página com módulo → ele; senão continua no atual.
export function moduloAposNavegar(modules, page, atual) {
  if (paginasSoDesktop(modules).has(page)) return MODULO_INICIAL
  return moduloDaPagina(modules, page)?.id ?? moduloMobile(modules, atual)
}
