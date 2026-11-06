import { sqlSeedTiposDocumento, SEED_TIPOS_DOCUMENTO } from './_tiposDocumento.js'
import { KIT_PF, KIT_PJ, KIT_CATEGORIA_SISTEMA, ehClientePJ, categoriasDoKit } from '../src/lib/kitCategorias.js'

export { KIT_PF, KIT_PJ, KIT_CATEGORIA_SISTEMA, ehClientePJ }

// KIT BÁSICO de um ambiente de CLIENTE novo — a ÚNICA lista do que um banco de cliente ganha ao ser
// criado (api/_provisionar.js, passo "kit"). Nada aqui é do Victor: nada de plano de contas pessoal,
// de-para Dindin, grupos gerenciais numerados ou rodapé "Gislaine & Victor Moreira".
// Para ajustar o kit, mexa SÓ nas listas abaixo (vale para os próximos clientes; os já criados não
// mudam). Tudo é editável e apagável pelo cliente depois.

// CATEGORIAS: um kit de Pessoa Física e um de Pessoa Jurídica, escolhido pelo tipo_pessoa do
// cliente (plataforma_clientes). Grupo = categorias.category_group (texto livre); a ordem dos grupos
// vai em configuracoes.category_groups (+ ordem manual) e a das categorias em sort_order — as telas
// de categorias, os seletores e o Painel seguem essa ordem (src/lib/ordemCategorias.js).
// ids FIXOS (iguais em todo ambiente novo); os que já existiam no kit antigo mantêm id, cor e ícone.
// Formato: [grupo, tipo, [[id, nome, cor, ícone], ...]] — cores não se repetem dentro do grupo.
export const KIT_CENTROS_PF = ['Pessoal', 'Família', 'Trabalho', 'Casa']
export const KIT_CENTROS_PJ = ['Administrativo', 'Comercial', 'Operacional']

// Kit do cliente pelo tipo_pessoa (sem tipo → PF, o padrão do cadastro).
export function kitDoCliente(c) {
  const pj = ehClientePJ(c)
  const grupos = pj ? KIT_PJ : KIT_PF
  return {
    tipo: pj ? 'PJ' : 'PF',
    // [id, nome, tipo, cor, ícone, grupo, ordem no grupo]
    categorias: categoriasDoKit(grupos),
    grupos: grupos.map(([grupo]) => grupo),
    centrosDeCusto: pj ? KIT_CENTROS_PJ : KIT_CENTROS_PF,
  }
}

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

// Primeiro perfil, com os dados do cadastro: nome (empresa se PJ), pf/pj e o documento (só dígitos,
// como o app grava; vazio → sem documento). Um perfil comum: o cliente edita ou exclui.
export const KIT_PERFIL_ID = 'prf_kit_principal'
export function perfilDoCliente(c) {
  const doc = String(c?.documento || '').trim()
  return {
    id: KIT_PERFIL_ID,
    name: (rodapeDoCliente(c) || 'Perfil principal').slice(0, 100),
    type: ehClientePJ(c) ? 'pj' : 'pf',
    document: doc || null,
  }
}

// Aplica o kit no banco do cliente. `q` = transação no banco do CLIENTE. Idempotente (ids fixos e
// ON CONFLICT DO NOTHING): repetir não duplica nem desfaz o que o cliente já mudou.
export async function aplicarKitBasico(q, cliente) {
  const kit = kitDoCliente(cliente)
  // Grupos de categoria na ordem do kit (ordem manual ligada: senão as telas usariam a alfabética).
  // Cliente novo começa com o controle gerencial DESLIGADO (lib/controleGerencial.js).
  await q(
    `INSERT INTO configuracoes (id, financial_month_start_day, financial_month_mode, currency, cost_centers, rodape_titulo,
       category_groups, category_groups_ordem_manual, controle_gerencial)
     VALUES (1, $1, 'custom', 'BRL', $2::jsonb, $3, $4::jsonb, true, false) ON CONFLICT (id) DO NOTHING`,
    [KIT_DIA_INICIO_MES, JSON.stringify(kit.centrosDeCusto), rodapeDoCliente(cliente), JSON.stringify(kit.grupos)],
  )
  for (const [id, nome, tipo, cor, icone, grupo, ordem] of kit.categorias) {
    await q(`INSERT INTO categorias (id, name, type, color, icon, category_group, sort_order)
      VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING`, [id, nome, tipo, cor, icone, grupo, ordem])
  }
  {
    const [id, nome, tipo, cor, icone] = KIT_CATEGORIA_SISTEMA
    await q('INSERT INTO categorias (id, name, type, color, icon) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING',
      [id, nome, tipo, cor, icone])
  }
  // Primeiro perfil: só com a tabela vazia (repetir o passo não recria um perfil que já exista).
  const perfil = perfilDoCliente(cliente)
  await q(`INSERT INTO perfis (id, name, type, document, is_default, ordem)
    SELECT $1, $2, $3, $4, true, 0 WHERE NOT EXISTS (SELECT 1 FROM perfis)`, [perfil.id, perfil.name, perfil.type, perfil.document])
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
