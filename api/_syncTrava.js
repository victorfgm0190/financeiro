// Travas do /api/sync que não dependem do app estar certo. Um navegador com estado que não veio do
// banco (cache velho, defaultData de um perfil limpo, versão antiga do app) não consegue:
//   1. trocar uma configuração preenchida por vazio/padrão sem dizer que foi o usuário
//      (`camposAlterados`, mandado pelo syncSettings só com as chaves que mudaram);
//   2. apagar de uma vez mais de 20% de uma tabela (e pelo menos 5 linhas) sem confirmação
//      explícita (`confirmarExclusaoEmMassa`, que o app manda depois de perguntar ao usuário).
// Toda recusa vai para o log só com contadores e nomes de coluna/tabela — nunca o conteúdo.
//
// Origem: em 15/10/2026 a linha `configuracoes` voltou ao defaultData (dia 1, faturas_fechadas {},
// category_groups []) porque um navegador sem dados do banco fez full-sync ao reconectar.

// Valores que contam como "padrão" em configuracoes (os do defaultData / syncSettings).
export const PADRAO_CONFIGURACOES = {
  financial_month_start_day: 1,
  financial_month_mode: 'custom',
  currency: 'BRL',
  category_groups_ordem_manual: false,
}

const vazio = (v) =>
  v === null || v === undefined || v === '' ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && Object.keys(v).length === 0)

export const vazioOuPadrao = (coluna, v) =>
  vazio(v) || (Object.prototype.hasOwnProperty.call(PADRAO_CONFIGURACOES, coluna) && v === PADRAO_CONFIGURACOES[coluna])

// `atual`: linha gravada (ou undefined se ainda não existe). Devolve o que pode ser gravado e as
// colunas recusadas: valor preenchido no banco + vazio/padrão chegando + coluna fora de
// camposAlterados. Linha inexistente (banco novo, seed) grava tudo.
export function filtrarConfiguracoes(atual, data, camposAlterados) {
  const permitidos = new Set(Array.isArray(camposAlterados) ? camposAlterados : [])
  const gravar = {}
  const recusados = []
  for (const [coluna, valor] of Object.entries(data || {})) {
    if (atual && !permitidos.has(coluna) && vazioOuPadrao(coluna, valor) && !vazioOuPadrao(coluna, atual[coluna])) {
      recusados.push(coluna)
      continue
    }
    gravar[coluna] = valor
  }
  return { data: gravar, recusados }
}

export const LIMITE_EXCLUSAO_EM_MASSA = { fracao: 0.2, minimo: 5 }
const IDENT = /^[a-z_][a-z0-9_]*$/

// null = pode apagar; { tabela, apagar, total } = recusar (mais de 20% da tabela e >= 5 linhas
// existentes). Conta só os ids que existem de fato no banco.
export async function conferirExclusaoEmMassa(q, tabela, ids, { coluna = 'id', confirmado = false } = {}) {
  const { fracao, minimo } = LIMITE_EXCLUSAO_EM_MASSA
  if (confirmado || !Array.isArray(ids) || ids.length < minimo) return null
  if (!IDENT.test(tabela) || !IDENT.test(coluna)) return null
  const [r] = await q(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE "${coluna}" = ANY($1))::int AS apagar FROM ${tabela}`,
    [ids],
  )
  const total = r?.total ?? 0
  const apagar = r?.apagar ?? 0
  return apagar >= minimo && apagar > total * fracao ? { tabela, apagar, total } : null
}

export function logRecusa(rotulo, contadores) {
  console.warn(`[api/sync] RECUSADO ${rotulo}`, JSON.stringify(contadores))
}
