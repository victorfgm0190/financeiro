// KIT DE CATEGORIAS (PF e PJ) — a lista que um ambiente novo ganha (api/_kitBasico.js) e que a tela usa
// em "Adicionar categorias padrão que faltam". Módulo puro, compartilhado por tela e servidor. Genérico:
// nada de um cliente específico.
// Formato: [grupo, tipo, [[id, nome, cor, ícone, tipoDaCategoria?], ...]]. ids FIXOS em todo ambiente;
// `tipoDaCategoria` vale para grupo com receita e despesa juntas. Cores não se repetem dentro do grupo.

export const GRUPO_CAPITAL = 'Ganho e perda de capital'
export const CAT_GANHO_CAPITAL = ['cat_kit_ganho_capital', 'Ganho de capital', '#22c55e', '📈', 'income']
export const CAT_PERDA_CAPITAL = ['cat_kit_perda_capital', 'Perda de capital', '#ef4444', '📉', 'expense']
const GRUPO_KIT_CAPITAL = [GRUPO_CAPITAL, 'expense', [CAT_GANHO_CAPITAL, CAT_PERDA_CAPITAL]]

export const KIT_PF = [
  ['Despesas da casa', 'expense', [
    ['cat_kit_aluguel', 'Aluguel', '#8b5cf6', '🏠'],
    ['cat_kit_condominio', 'Condomínio', '#6366f1', '🏢'],
    ['cat_kit_gas', 'Gás', '#f97316', '🔥'],
    ['cat_kit_energia', 'Energia', '#eab308', '⚡'],
    ['cat_kit_agua', 'Água', '#0ea5e9', '💧'],
    ['cat_kit_internet_telefone', 'Internet e telefone', '#06b6d4', '📡'],
    ['cat_kit_manutencao_casa', 'Manutenção', '#64748b', '🔧'],
    ['cat_kit_obras', 'Obras', '#a16207', '🧱'],
    ['cat_kit_servicos', 'Serviços', '#ec4899', '🧹'],
  ]],
  ['Essenciais', 'expense', [
    ['cat_kit_mercado', 'Mercado', '#f59e0b', '🛒'],
    ['cat_kit_alimentacao', 'Alimentação', '#f97316', '🍽️'],
    ['cat_kit_transporte', 'Transporte', '#3b82f6', '🚗'],
    ['cat_kit_saude', 'Saúde', '#ef4444', '❤️'],
    ['cat_kit_educacao', 'Educação', '#84cc16', '📚'],
  ]],
  ['Carro', 'expense', [
    ['cat_kit_combustivel', 'Combustível', '#dc2626', '⛽'],
    ['cat_kit_manutencao_veicular', 'Manutenção veicular', '#64748b', '🛠️'],
    ['cat_kit_ipva_licenciamento', 'IPVA e licenciamento', '#eab308', '📄'],
  ]],
  ['Estilo de vida', 'expense', [
    ['cat_kit_lazer', 'Lazer', '#06b6d4', '🎬'],
    ['cat_kit_vestuario', 'Vestuário', '#ec4899', '👕'],
    ['cat_kit_cuidados_pessoais', 'Cuidados pessoais', '#d946ef', '💅'],
    ['cat_kit_assinaturas', 'Assinaturas e streaming', '#a855f7', '📺'],
    ['cat_kit_pets', 'Pets', '#a16207', '🐾'],
    ['cat_kit_viagens', 'Viagens', '#0284c7', '✈️'],
    ['cat_kit_presentes_doacoes', 'Presentes e doações', '#f43f5e', '🎁'],
  ]],
  ['Financeiro', 'expense', [
    ['cat_kit_impostos', 'Impostos e taxas', '#eab308', '🧾'],
    ['cat_kit_seguros', 'Seguros', '#0d9488', '🛡️'],
    ['cat_kit_tarifas_bancarias', 'Tarifas bancárias', '#64748b', '🏦'],
    ['cat_kit_juros_encargos', 'Juros e encargos', '#dc2626', '📉'],
  ]],
  ['Outros', 'expense', [
    ['cat_kit_outras_despesas', 'Outras despesas', '#6b7280', '📌'],
  ]],
  ['Receitas', 'income', [
    ['cat_kit_salario', 'Salário', '#22c55e', '💰'],
    ['cat_kit_decimo_terceiro', 'Décimo terceiro', '#84cc16', '🎄'],
    ['cat_kit_ferias', 'Férias', '#f59e0b', '🏖️'],
    ['cat_kit_vale_refeicao', 'Vale-refeição', '#f97316', '🍴'],
    ['cat_kit_pro_labore', 'Pró-labore', '#10b981', '💼'],
    ['cat_kit_rendimentos', 'Rendimentos', '#6366f1', '📈'],
    ['cat_kit_alugueis_recebidos', 'Aluguéis recebidos', '#8b5cf6', '🏘️'],
    ['cat_kit_reembolsos', 'Reembolsos', '#0ea5e9', '↩️'],
    ['cat_kit_outras_receitas', 'Outras receitas', '#14b8a6', '➕'],
  ]],
  GRUPO_KIT_CAPITAL,
]

export const KIT_PJ = [
  ['Receitas operacionais', 'income', [
    ['cat_kit_venda_produtos', 'Venda de produtos', '#22c55e', '🛍️'],
    ['cat_kit_prestacao_servicos', 'Prestação de serviços', '#10b981', '🛠️'],
  ]],
  ['Outras receitas', 'income', [
    ['cat_kit_receitas_financeiras', 'Receitas financeiras', '#6366f1', '📈'],
    ['cat_kit_outras_receitas', 'Outras receitas', '#14b8a6', '➕'],
  ]],
  ['Custos', 'expense', [
    ['cat_kit_fornecedores', 'Fornecedores', '#f97316', '📦'],
    ['cat_kit_fretes', 'Fretes', '#3b82f6', '🚚'],
  ]],
  ['Pessoal', 'expense', [
    ['cat_kit_folha_pagamento', 'Folha de pagamento', '#8b5cf6', '👥'],
    // Na PJ o pró-labore é DESPESA (na PF é receita): id próprio.
    ['cat_kit_pro_labore_pj', 'Pró-labore', '#10b981', '💼'],
    ['cat_kit_encargos_trabalhistas', 'Encargos trabalhistas', '#ef4444', '📑'],
    ['cat_kit_beneficios', 'Benefícios', '#ec4899', '🎟️'],
  ]],
  ['Impostos', 'expense', [
    ['cat_kit_impostos_vendas', 'Impostos sobre vendas (DAS/tributos)', '#eab308', '🧾'],
    ['cat_kit_taxas_licencas', 'Taxas e licenças', '#a16207', '📜'],
  ]],
  ['Despesas operacionais', 'expense', [
    ['cat_kit_aluguel', 'Aluguel', '#8b5cf6', '🏢'],
    ['cat_kit_energia_agua_internet', 'Energia, água e internet', '#0ea5e9', '💡'],
    ['cat_kit_sistemas_softwares', 'Sistemas e softwares', '#6366f1', '💻'],
    ['cat_kit_marketing', 'Marketing', '#ec4899', '📣'],
    ['cat_kit_honorarios_contabeis', 'Honorários contábeis', '#14b8a6', '🧮'],
    ['cat_kit_material_escritorio', 'Material de escritório', '#f59e0b', '📎'],
    ['cat_kit_manutencao', 'Manutenção', '#64748b', '🔧'],
  ]],
  ['Financeiro', 'expense', [
    ['cat_kit_tarifas_bancarias', 'Tarifas bancárias', '#64748b', '🏦'],
    ['cat_kit_juros_encargos', 'Juros e encargos', '#dc2626', '📉'],
  ]],
  ['Outros', 'expense', [
    ['cat_kit_outras_despesas', 'Outras despesas', '#6b7280', '📌'],
  ]],
  GRUPO_KIT_CAPITAL,
]

// Do SISTEMA, nos dois kits (sem grupo, como antes): o app usa este id como categoria padrão dos
// lançamentos de reserva. [id, nome, tipo, cor, ícone]
export const KIT_CATEGORIA_SISTEMA = ['cat_res_ger', 'Reservas Gerais', 'expense', '#6b7280', '🏦']

// Kit do cliente pelo tipo_pessoa (sem tipo → PF, o padrão do cadastro).
export const ehClientePJ = (c) => String(c?.tipo_pessoa || '').toUpperCase() === 'PJ'

// [id, nome, tipo, cor, ícone, grupo, ordem no grupo]
export const categoriasDoKit = (grupos) => grupos.flatMap(([grupo, tipo, cats]) =>
  cats.map(([id, nome, cor, icone, tipoProprio], i) => [id, nome, tipoProprio || tipo, cor, icone, grupo, i]))

// Comparação de nomes: sem acento, maiúsculas e espaços a mais ("Perda de Capital" = "perda de capital").
export const normalizarNomeCategoria = (s) => String(s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')

const paraPayload = ([id, name, type, color, icon, group]) => ({ id, name, type, color, icon, group })

// Categorias do kit (`tipo` 'PF' | 'PJ') que não existem no ambiente: nem pelo nome (normalizado) nem pelo
// id (categoria do kit que o cliente renomeou continua existindo). Formato do addCategory do app.
export function categoriasFaltantes(tipo, categorias = []) {
  const nomes = new Set(categorias.map(c => normalizarNomeCategoria(c.name)))
  const ids = new Set(categorias.map(c => c.id))
  const [sid, snome, stipo, scor, sicone] = KIT_CATEGORIA_SISTEMA
  return [...categoriasDoKit(tipo === 'PJ' ? KIT_PJ : KIT_PF), [sid, snome, stipo, scor, sicone, null, 0]]
    .filter(c => !ids.has(c[0]) && !nomes.has(normalizarNomeCategoria(c[1])))
    .map(paraPayload)
}

// Ganho/perda de capital: acha pela comparação de nomes e pelo tipo certo (receita/despesa).
const DEF_CAPITAL = { ganho: CAT_GANHO_CAPITAL, perda: CAT_PERDA_CAPITAL }
export function categoriaDeCapital(categorias = [], qual) {
  const [id, nome, , , tipo] = DEF_CAPITAL[qual]
  const alvo = normalizarNomeCategoria(nome)
  return categorias.find(c => c.id === id) || categorias.find(c => normalizarNomeCategoria(c.name) === alvo && c.type === tipo) || null
}

// O que falta criar das duas categorias de capital (formato do addCategory).
export function capitalFaltante(categorias = []) {
  return Object.entries(DEF_CAPITAL)
    .filter(([qual]) => !categoriaDeCapital(categorias, qual))
    .map(([, [id, name, color, icon, type]]) => ({ id, name, type, color, icon, group: GRUPO_CAPITAL }))
}
