import { sqlSeedTiposDocumento, SEED_TIPOS_DOCUMENTO } from './_tiposDocumento.js'

// KIT BÁSICO de um ambiente de CLIENTE novo — a ÚNICA lista do que um banco de cliente ganha ao ser
// criado (api/_provisionar.js, passo "kit"). Nada aqui é do Victor: nada de plano de contas pessoal,
// de-para Dindin, grupos gerenciais numerados ou rodapé "Gislaine & Victor Moreira".
// Para ajustar o kit, mexa SÓ nas listas abaixo (vale para os próximos clientes; os já criados não
// mudam). Tudo é editável e apagável pelo cliente depois.

// Categorias comuns. [id, nome, tipo, cor, ícone]
export const KIT_CATEGORIAS = [
  // Despesas
  ['cat_kit_alimentacao', 'Alimentação', 'expense', '#f97316', '🍽️'],
  ['cat_kit_moradia', 'Moradia', 'expense', '#8b5cf6', '🏠'],
  ['cat_kit_transporte', 'Transporte', 'expense', '#3b82f6', '🚗'],
  ['cat_kit_saude', 'Saúde', 'expense', '#ef4444', '❤️'],
  ['cat_kit_educacao', 'Educação', 'expense', '#84cc16', '📚'],
  ['cat_kit_lazer', 'Lazer', 'expense', '#06b6d4', '🎬'],
  ['cat_kit_vestuario', 'Vestuário', 'expense', '#ec4899', '👕'],
  ['cat_kit_contas_casa', 'Contas da casa', 'expense', '#0ea5e9', '💡'],
  ['cat_kit_impostos', 'Impostos e taxas', 'expense', '#eab308', '🧾'],
  ['cat_kit_outras_despesas', 'Outras despesas', 'expense', '#6b7280', '📌'],
  // Receitas
  ['cat_kit_salario', 'Salário', 'income', '#22c55e', '💰'],
  ['cat_kit_pro_labore', 'Pró-labore', 'income', '#10b981', '💼'],
  ['cat_kit_rendimentos', 'Rendimentos', 'income', '#6366f1', '📈'],
  ['cat_kit_outras_receitas', 'Outras receitas', 'income', '#14b8a6', '➕'],
  // Do SISTEMA: o app usa este id como categoria padrão dos lançamentos de reserva.
  ['cat_res_ger', 'Reservas Gerais', 'expense', '#6b7280', '🏦'],
]

// Grupos FIXOS do sistema (o código depende do "D" e do id grp_D). [id, número, nome, alias]
export const KIT_GRUPOS_GERENCIAIS = [
  ['grp_1', 1, 'Gerencial', 'G'],
  ['grp_D', 'D', 'Despesa', 'D'],
]

// Grupos de contas (os mesmos padrões do app). [id, nome, tipo, ordem, comportamento]
export const KIT_GRUPOS_CONTA = [
  ['grp_acc_1', 'Conta Corrente', 'financeiro', 0, null],
  ['grp_acc_2', 'Poupança', 'financeiro', 1, null],
  ['grp_acc_3', 'Investimentos', 'financeiro', 2, null],
  ['grp_acc_4', 'Cartão de Crédito', 'financeiro', 3, null],
  ['grp_acc_5', 'Dinheiro', 'financeiro', 4, null],
  ['grp_acc_6', 'Imóveis', 'patrimonial', 5, null],
  ['grp_acc_7', 'Veículos', 'patrimonial', 6, null],
  ['grp_acc_8', 'Principais Dívidas', 'patrimonial', 7, 'divida'],
  ['grp_acc_9', 'Empréstimos a Terceiros', 'patrimonial', 8, 'emprestimo'],
]

export const KIT_CENTROS_DE_CUSTO = ['Pessoal', 'Família', 'Trabalho', 'Casa']

// Tipos de documento: os do seed atual (api/_tiposDocumento.js).
export const KIT_TIPOS_DOCUMENTO = SEED_TIPOS_DOCUMENTO.map(([nome]) => nome)

export const KIT_DIA_INICIO_MES = 1

// Regras globais dos itens do boleto do condomínio (módulo Contratos): itens do proprietário.
// Mesma lista do sql/contratos_entrega2.sql.
export const KIT_REGRAS_ITENS = [
  ['fundo de reserva', 'comeca_com'], ['fundo trabalhista', 'comeca_com'], ['fundo de obras', 'comeca_com'],
  ['obra', 'contem'], ['chamada de capital', 'contem'], ['taxa extra', 'contem'],
]

// Rodapé da barra lateral: nome do cliente, ou da empresa se PJ.
export const rodapeDoCliente = (c) => String((c.tipo_pessoa === 'PJ' && c.empresa) || c.nome || '').trim() || null

// Aplica o kit no banco do cliente. `q` = transação no banco do CLIENTE. Idempotente (ids fixos e
// ON CONFLICT DO NOTHING): repetir não duplica nem desfaz o que o cliente já mudou.
export async function aplicarKitBasico(q, cliente) {
  await q(
    `INSERT INTO configuracoes (id, financial_month_start_day, financial_month_mode, currency, cost_centers, rodape_titulo)
     VALUES (1, $1, 'custom', 'BRL', $2::jsonb, $3) ON CONFLICT (id) DO NOTHING`,
    [KIT_DIA_INICIO_MES, JSON.stringify(KIT_CENTROS_DE_CUSTO), rodapeDoCliente(cliente)],
  )
  for (const [id, nome, tipo, cor, icone] of KIT_CATEGORIAS) {
    await q('INSERT INTO categorias (id, name, type, color, icon) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING',
      [id, nome, tipo, cor, icone])
  }
  for (const [id, numero, nome, alias] of KIT_GRUPOS_GERENCIAIS) {
    await q('INSERT INTO reservas_funcoes (id, number, name, alias, fixed) VALUES ($1, $2::jsonb, $3, $4, true) ON CONFLICT (id) DO NOTHING',
      [id, JSON.stringify(numero), nome, alias])
  }
  for (const [id, nome, tipo, ordem, comportamento] of KIT_GRUPOS_CONTA) {
    await q('INSERT INTO grupos_conta (id, name, type, "order", behavior) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING',
      [id, nome, tipo, ordem, comportamento])
  }
  const { sql, params } = sqlSeedTiposDocumento() // só com a tabela vazia
  await q(sql, params)
  for (const [padrao, tipo] of KIT_REGRAS_ITENS) {
    await q(`INSERT INTO contrato_regras_itens (contrato_id, padrao, tipo_match, responsavel, observacao)
      SELECT NULL, $1, $2, 'proprietario', 'Padrão do sistema (editável)'
       WHERE NOT EXISTS (SELECT 1 FROM contrato_regras_itens WHERE contrato_id IS NULL AND padrao = $1)`, [padrao, tipo])
  }
}
