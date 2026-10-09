// Ordem de categorias e grupos de categoria — única fonte para telas e seletores.
//
// Grupos: com ordem manual salva (settings.categoryGroups + categoryGroupsOrdemManual), seguem o
// array salvo; grupos fora dele vão depois, na ordem padrão. Sem ordem salva: GROUP_ORDER e,
// fora dela, alfabética (pt-BR) — a ordem que os seletores já usavam.
// Categorias: dentro do grupo, `sortOrder` crescente; sem sortOrder vão no fim, alfabéticas.
// Categorias sem grupo ficam depois de todos os grupos.

export const GROUP_ORDER = [
  // Despesas
  'Alimentação', 'Bancos', 'Contribuicoes', 'Cuidados Pessoais', 'Doações',
  'Educação', 'Empresa', 'Escritorio Contabilidade', 'Filhos', 'Finaciamentos',
  'Fotografia', 'Impostos', 'Lazer', 'Moradia', 'Saúde',
  'Seguro', 'Seguros', 'Transporte', 'Vestuário', 'Outras Despesas',
  // Receitas
  'Remunerações', 'Rendimentos', 'Rendimentos Empresariais', 'Outras Receitas',
  // Investimentos
  'Aplicações',
]

const cmpNome = (a, b) => (a || '').localeCompare(b || '', 'pt-BR')

// Comparador de nomes de grupo na ordem PADRÃO (GROUP_ORDER, depois alfabética).
export function compararGruposPadrao(a, b) {
  const ia = GROUP_ORDER.indexOf(a), ib = GROUP_ORDER.indexOf(b)
  if (ia === -1 && ib === -1) return cmpNome(a, b)
  if (ia === -1) return 1
  if (ib === -1) return -1
  return ia - ib
}

// Ordem manual salva, ou null quando o usuário nunca reordenou (→ padrão).
export function ordemGruposSalva(settings) {
  return settings?.categoryGroupsOrdemManual && Array.isArray(settings.categoryGroups)
    ? settings.categoryGroups
    : null
}

// Ordena nomes de grupo. `ordemSalva` = array de nomes (ou null para o padrão).
export function ordenarGrupos(nomes, ordemSalva = null) {
  const pos = new Map((ordemSalva || []).map((g, i) => [g, i]))
  return [...nomes].sort((a, b) => {
    const pa = pos.has(a), pb = pos.has(b)
    if (pa && pb) return pos.get(a) - pos.get(b)
    if (pa) return -1
    if (pb) return 1
    return compararGruposPadrao(a, b)
  })
}

// Comparador de categorias DENTRO do mesmo grupo.
export function compararNoGrupo(a, b) {
  const sa = a.sortOrder, sb = b.sortOrder
  const ta = sa != null, tb = sb != null
  if (ta && tb && sa !== sb) return sa - sb
  if (ta !== tb) return ta ? -1 : 1
  return cmpNome(a.name, b.name)
}

// Lista de categorias ordenada: grupos (salva/padrão) → sortOrder → alfabética; sem grupo no fim.
export function ordenarCategorias(categories, ordemSalva = null) {
  const lista = categories || []
  const grupos = ordenarGrupos([...new Set(lista.map(c => c.group).filter(Boolean))], ordemSalva)
  const rank = new Map(grupos.map((g, i) => [g, i]))
  const semGrupo = grupos.length
  return [...lista].sort((a, b) => {
    const ra = a.group ? rank.get(a.group) : semGrupo
    const rb = b.group ? rank.get(b.group) : semGrupo
    if (ra !== rb) return ra - rb
    return compararNoGrupo(a, b)
  })
}

// Novos sortOrder de um grupo após mover `id` para `paraIndice` (índice na lista COMPLETA do
// grupo, já ordenada). Devolve Map id → sortOrder (0..n-1) para todas as categorias do grupo.
export function reordenarNoGrupo(categoriasDoGrupo, id, paraIndice) {
  const ordenadas = [...categoriasDoGrupo].sort(compararNoGrupo)
  const de = ordenadas.findIndex(c => c.id === id)
  if (de === -1) return new Map(ordenadas.map((c, i) => [c.id, i]))
  const alvo = Math.max(0, Math.min(paraIndice, ordenadas.length - 1))
  const [movida] = ordenadas.splice(de, 1)
  ordenadas.splice(alvo, 0, movida)
  return new Map(ordenadas.map((c, i) => [c.id, i]))
}

// Categoria indo para outro grupo: vai para o FIM dele. Se o grupo destino ainda não tem ordem
// manual, materializa a ordem atual (alfabética) dele antes, senão "fim" não existiria (sem
// sortOrder ela cairia na posição alfabética). Devolve Map id → sortOrder (inclui a movida).
export function ordemAoTrocarDeGrupo(categoriasDoDestino, idMovida) {
  const ordenadas = [...categoriasDoDestino].filter(c => c.id !== idMovida).sort(compararNoGrupo)
  const m = new Map(ordenadas.map((c, i) => [c.id, i]))
  m.set(idMovida, ordenadas.length)
  return m
}
