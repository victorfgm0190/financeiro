import { withTransaction } from './_db.js'

// Helpers compartilhados pelos endpoints de Bem Imobilizado / Financiamento.
//
// Convenção de tipo de conta: o app inteiro (PatrimonioPanel, AccountsPanel, SettingsPanel)
// discrimina contas por `contas.type` ∈ {checking, savings, credit, asset, liability}. Um bem
// entra como type='asset' e a conta de dívida como type='liability' — assim aparecem no
// Patrimônio e nos filtros existentes. O marcador 'bem_imobilizado' pedido na spec vive na
// coluna nova `tipo_bem`, e é ele que as respostas destes endpoints devolvem em `tipo`.

export const TIPO_BEM = 'bem_imobilizado'
export const ACCOUNT_TYPE_BEM = 'asset'
export const ACCOUNT_TYPE_DIVIDA = 'liability'

// Qual número representa o bem no Patrimônio. 'valor_pago' é o padrão porque é o que o app
// sabe sozinho (o saldo da conta); a nota fiscal só existe quando alguém a informou.
export const METODOS_PATRIMONIO = ['nota_fiscal', 'valor_pago']
export const METODO_PATRIMONIO_PADRAO = 'valor_pago'

export const genId = (prefix) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

export const num = (v, fallback = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export const isPositiveNumber = (v) => Number.isFinite(Number(v)) && Number(v) > 0

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
export const isIsoDate = (v) => typeof v === 'string' && ISO_DATE.test(v.slice(0, 10))

export const hoje = () => new Date().toISOString().slice(0, 10)

// Soma meses a uma data ISO clampando no último dia do mês de destino: 31/01 + 1 mês → 28/02,
// nunca 03/03. Aritmética em string para não depender do fuso do runtime da Vercel.
export function addMonthsClamped(isoDate, months) {
  const [y, m, d] = String(isoDate).slice(0, 10).split('-').map(Number)
  const idx = (m - 1) + months
  const year = y + Math.floor(idx / 12)
  const month = ((idx % 12) + 12) % 12
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const day = Math.min(d, lastDay)
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// Lê o parâmetro dinâmico da rota. `req.query.id` cobre o caso normal da Vercel; o fallback pelo
// pathname mantém o endpoint funcionando em runtimes que não populam req.query (mesmo padrão de
// api/reserve-periods.js). `segmentsFromEnd` = quantos segmentos existem DEPOIS do id na URL.
export function getRouteId(req, segmentsFromEnd = 0) {
  if (req.query?.id) return req.query.id
  try {
    const parts = new URL(req.url, 'http://x').pathname.split('/').filter(Boolean)
    return parts[parts.length - 1 - segmentsFromEnd] || null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

// DDL idempotente (mesmo padrão de api/load.js).
//
// Só DOIS lugares chamam isso: api/load.js (uma vez por carregamento do app) e
// /api/bem/migrate (sob demanda). Os endpoints de bem/financiamento NÃO chamam — o cache
// `schemaReady` é por instância de função serverless, então na Vercel cada cold start
// pagava os ~38 statements de novo e travava o BemDetail, que dispara 4 requests em
// paralelo. O schema já existe no banco; se algum dia faltar, /api/bem/migrate reaplica.
//
// Roda inteiro dentro de UMA transação: sem isso, um kill no meio (timeout de função,
// queda de conexão) deixava schema parcial — tipicamente as 10 colunas de `contas`
// aplicadas e `lancamentos.bem_id` não. Esse estado é auto-perpetuante e derruba o módulo
// todo: `CREATE INDEX IF NOT EXISTS idx_lancamentos_bem_id` só checa o nome do ÍNDICE, não
// a coluna, então ele falha com "column bem_id does not exist" — dentro do próprio
// ensureBemSchema, que é o que criaria a coluna. Todo endpoint de bem passa a devolver 500
// e a migração nunca se completa sozinha. Com a transação é tudo-ou-nada.
let schemaReady = null

// `force` descarta o cache do instance quente — usado por /api/bem/migrate para reexecutar
// a migração sob demanda sem depender de um cold start.
export function ensureBemSchema({ force = false } = {}) {
  if (force) schemaReady = null
  if (!schemaReady) {
    schemaReady = runSchemaDDL().catch((err) => {
      schemaReady = null
      throw err
    })
  }
  return schemaReady
}

async function runSchemaDDL() {
  return withTransaction(runSchemaStatements)
}

// Recebe `query` da transação — mesma assinatura (sql, params) do helper do pool, então os
// statements abaixo são idênticos aos de api/load.js.
async function runSchemaStatements(query) {
  const contasCols = [
    ['valor_nota_fiscal', 'NUMERIC'],
    ['tipo_bem', 'TEXT'],
    ['descricao', 'TEXT'],
    ['foi_vendido', 'BOOLEAN DEFAULT FALSE'],
    ['data_venda', 'DATE'],
    // Valor pago informado à mão (IR, recibo) e qual dos dois números representa o bem no
    // Patrimônio. Existem para o bem ANTIGO, sem movimentação nenhuma no app: nele nem a nota
    // fiscal nem o saldo vêm de lugar algum, e sem poder digitá-los o bem entra no PL como zero.
    ['valor_pago_manual', 'NUMERIC'],
    ['patrimonio_use_method', "TEXT DEFAULT 'valor_pago'"],
    ['bem_destino_id', 'TEXT'],
    ['categoria_perda_bem_id', 'TEXT'],
    ['categoria_ganho_bem_id', 'TEXT'],
    ['categoria_prestacao_id', 'TEXT'],
    ['categoria_taxa_finan_id', 'TEXT'],
  ]
  for (const [col, type] of contasCols) {
    await query(`ALTER TABLE contas ADD COLUMN IF NOT EXISTS ${col} ${type}`)
  }

  // Vínculo do lançamento com o bem — é o que permite montar o histórico sem varrer descrições.
  await query(`ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS bem_id TEXT`)
  await query(`CREATE INDEX IF NOT EXISTS idx_lancamentos_bem_id ON lancamentos (bem_id) WHERE bem_id IS NOT NULL`)
  await query(`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS financing_installment_id TEXT`)

  await query(`
    CREATE TABLE IF NOT EXISTS financing (
      id TEXT PRIMARY KEY,
      bem_id TEXT,
      valor_principal NUMERIC NOT NULL DEFAULT 0,
      juros_totais NUMERIC NOT NULL DEFAULT 0,
      valor_total NUMERIC NOT NULL DEFAULT 0,
      num_parcelas INTEGER NOT NULL DEFAULT 0,
      valor_parcela NUMERIC NOT NULL DEFAULT 0,
      principal_por_parcela NUMERIC DEFAULT 0,
      juros_por_parcela NUMERIC DEFAULT 0,
      banco TEXT,
      status TEXT DEFAULT 'open',
      conta_divida_id TEXT,
      conta_origem_id TEXT,
      data_primeira_parcela DATE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`)
  for (const [col, type] of [
    ['bem_id', 'TEXT'], ['principal_por_parcela', 'NUMERIC DEFAULT 0'],
    ['juros_por_parcela', 'NUMERIC DEFAULT 0'], ['banco', 'TEXT'],
    ['status', "TEXT DEFAULT 'open'"], ['conta_divida_id', 'TEXT'],
    ['conta_origem_id', 'TEXT'], ['data_primeira_parcela', 'DATE'],
  ]) {
    await query(`ALTER TABLE financing ADD COLUMN IF NOT EXISTS ${col} ${type}`)
  }
  await query(`CREATE INDEX IF NOT EXISTS idx_financing_bem_id ON financing (bem_id)`)

  await query(`
    CREATE TABLE IF NOT EXISTS financing_installments (
      id TEXT PRIMARY KEY,
      financing_id TEXT NOT NULL,
      numero_parcela INTEGER NOT NULL,
      principal_provisioned NUMERIC NOT NULL DEFAULT 0,
      juros_provisioned NUMERIC NOT NULL DEFAULT 0,
      total_provisioned NUMERIC NOT NULL DEFAULT 0,
      principal_pago NUMERIC NOT NULL DEFAULT 0,
      juros_pago NUMERIC NOT NULL DEFAULT 0,
      total_pago NUMERIC NOT NULL DEFAULT 0,
      desvio_juros NUMERIC NOT NULL DEFAULT 0,
      data_vencimento DATE,
      data_pagamento DATE,
      status TEXT DEFAULT 'open',
      schedule_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`)
  for (const [col, type] of [
    ['desvio_juros', 'NUMERIC NOT NULL DEFAULT 0'], ['schedule_id', 'TEXT'],
    ['data_pagamento', 'DATE'], ['status', "TEXT DEFAULT 'open'"],
  ]) {
    await query(`ALTER TABLE financing_installments ADD COLUMN IF NOT EXISTS ${col} ${type}`)
  }
  await query(`CREATE INDEX IF NOT EXISTS idx_fin_inst_financing ON financing_installments (financing_id)`)
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_inst_numero ON financing_installments (financing_id, numero_parcela)`)

  await query(`
    CREATE TABLE IF NOT EXISTS bem_movimentacoes (
      id TEXT PRIMARY KEY,
      bem_id TEXT NOT NULL,
      tipo TEXT NOT NULL,
      data DATE,
      descricao TEXT,
      bem_origem_id TEXT,
      valor NUMERIC DEFAULT 0,
      perda_ganho NUMERIC,
      principal NUMERIC,
      juros NUMERIC,
      categoria_id TEXT,
      parcela_id TEXT,
      lancamento_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`)
  for (const [col, type] of [
    ['principal', 'NUMERIC'], ['juros', 'NUMERIC'], ['parcela_id', 'TEXT'],
    ['lancamento_id', 'TEXT'], ['bem_origem_id', 'TEXT'], ['perda_ganho', 'NUMERIC'],
    // Saldo do bem de origem ANTES do trade-in. Sem guardá-lo o estorno não tem para onde
    // devolver o saldo: o trade-in zera a conta e o valor original se perde. Movimentações
    // gravadas antes desta coluna ficam NULL — o estorno cai na nota fiscal como estimativa.
    ['saldo_origem_anterior', 'NUMERIC'],
  ]) {
    await query(`ALTER TABLE bem_movimentacoes ADD COLUMN IF NOT EXISTS ${col} ${type}`)
  }
  await query(`CREATE INDEX IF NOT EXISTS idx_bem_mov_bem_id ON bem_movimentacoes (bem_id)`)

  await normalizarColunasIdParaTexto(query)
}

// Toda coluna de id do módulo guarda id no formato do app — 'cat_1786063187890', 'acc_...',
// 'tx_bem_...' — nunca um UUID. Elas são declaradas TEXT logo acima, mas
// `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS` são no-op quando o objeto já
// existe, INCLUSIVE quando existe com o tipo errado. Num banco onde essas colunas foram
// criadas como UUID (migração aplicada à mão no console, fora do repo) o DDL inteiro passa
// sem erro e só a escrita quebra, com:
//   invalid input syntax for type uuid: "cat_1786063187890"
// — o que faz POST /api/bem/criar devolver 500 na hora de parametrizar o bem. Aqui as
// reconvertemos para TEXT. uuid→text é lossless, e o passo é idempotente: num banco já
// correto o SELECT não devolve nenhuma coluna uuid e nenhum ALTER roda.
//
// Escopo de propósito restrito às colunas que este módulo cria. `contas.id`,
// `categorias.id` e `lancamentos.id` são compartilhados com o resto do app e não são
// alterados aqui.
const COLUNAS_ID_TEXT = [
  ['contas', 'bem_destino_id'],
  ['contas', 'categoria_perda_bem_id'],
  ['contas', 'categoria_ganho_bem_id'],
  ['contas', 'categoria_prestacao_id'],
  ['contas', 'categoria_taxa_finan_id'],
  ['lancamentos', 'bem_id'],
  ['agendamentos', 'financing_installment_id'],
  ['financing', 'id'],
  ['financing', 'bem_id'],
  ['financing', 'conta_divida_id'],
  ['financing', 'conta_origem_id'],
  ['financing_installments', 'id'],
  ['financing_installments', 'financing_id'],
  ['financing_installments', 'schedule_id'],
  ['bem_movimentacoes', 'id'],
  ['bem_movimentacoes', 'bem_id'],
  ['bem_movimentacoes', 'bem_origem_id'],
  ['bem_movimentacoes', 'categoria_id'],
  ['bem_movimentacoes', 'parcela_id'],
  ['bem_movimentacoes', 'lancamento_id'],
]

async function normalizarColunasIdParaTexto(query) {
  const tabelas = [...new Set(COLUNAS_ID_TEXT.map(([t]) => t))]
  const rows = await query(
    `SELECT table_name, column_name, data_type
       FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = ANY($1)`,
    [tabelas],
  )
  const tipoDe = new Map(rows.map(r => [`${r.table_name}.${r.column_name}`, r.data_type]))

  for (const [tabela, col] of COLUNAS_ID_TEXT) {
    if (tipoDe.get(`${tabela}.${col}`) !== 'uuid') continue
    // USING é obrigatório: sem ele o Postgres recusa uuid→text por não haver cast implícito.
    await query(`ALTER TABLE ${tabela} ALTER COLUMN ${col} TYPE TEXT USING ${col}::text`)
    console.log(`[bem/schema] ${tabela}.${col}: uuid → text`)
  }
}

// ---------------------------------------------------------------------------
// Regras de negócio
// ---------------------------------------------------------------------------

// Rateio de um pagamento entre principal e juros: o principal é quitado PRIMEIRO, os juros
// recebem só a sobra. O que faltar de juros vira desvio (juros não pagos daquela parcela).
export function calcularRateio(valorPago, principalProvisioned, jurosProvisioned) {
  const pago = round2(num(valorPago))
  const principalPrev = round2(num(principalProvisioned))
  const jurosPrev = round2(num(jurosProvisioned))

  if (pago >= principalPrev) {
    const sobra = round2(pago - principalPrev)
    const jurosPago = Math.min(sobra, jurosPrev)
    return {
      principalPago: principalPrev,
      jurosPago: round2(jurosPago),
      desvioJuros: round2(jurosPrev - jurosPago),
    }
  }
  return { principalPago: pago, jurosPago: 0, desvioJuros: jurosPrev }
}

// Provisão das N parcelas. A última absorve o resíduo do arredondamento para que
// Σ principal === valor_principal e Σ juros === juros_totais exatamente (senão, em 60 parcelas,
// centavos de erro se acumulam e o financiamento nunca fecha em 'completed').
export function montarProvisao({ valorPrincipal, numParcelas, valorParcela, dataPrimeiraParcela }) {
  const valorTotal = round2(valorParcela * numParcelas)
  const jurosTotais = round2(valorTotal - valorPrincipal)
  const principalPorParcela = round2(valorPrincipal / numParcelas)
  const jurosPorParcela = round2(jurosTotais / numParcelas)

  const parcelas = []
  let principalAcum = 0
  let jurosAcum = 0
  for (let i = 1; i <= numParcelas; i++) {
    const ultima = i === numParcelas
    const principal = ultima ? round2(valorPrincipal - principalAcum) : principalPorParcela
    const juros = ultima ? round2(jurosTotais - jurosAcum) : jurosPorParcela
    principalAcum = round2(principalAcum + principal)
    jurosAcum = round2(jurosAcum + juros)
    parcelas.push({
      numero: i,
      principal_provisioned: principal,
      juros_provisioned: juros,
      total_provisioned: round2(principal + juros),
      data_vencimento: addMonthsClamped(dataPrimeiraParcela, i - 1),
    })
  }
  return { valorTotal, jurosTotais, principalPorParcela, jurosPorParcela, parcelas }
}

// ---------------------------------------------------------------------------
// Escritas reutilizáveis (recebem `q` — pool ou client de transação)
// ---------------------------------------------------------------------------

// Cria um lançamento já categorizado e vinculado ao bem.
// `account_id` fica null de propósito: o saldo das contas é movido explicitamente pelo endpoint
// que chama isto, e o loop de saldo do app ignora contas null — sem isso o valor entraria duas
// vezes (mesmo padrão das sombras de reserva/patrimônio).
export async function criarLancamentoCategorizado(q, {
  categoriaId, valor, descricao, bemId, data, tipo = 'expense', origin = 'pagamento_divida',
  grupoGerencial = null, notes = null,
}) {
  const id = genId('tx_bem')
  await q(
    `INSERT INTO lancamentos
       (id, type, account_id, amount, date, description, category_id, bem_id, origin,
        grupo_gerencial, notes, reconciled)
     VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8, $9, $10, FALSE)`,
    [id, tipo, round2(valor), data, descricao, categoriaId || null, bemId || null, origin,
      grupoGerencial, notes],
  )
  return id
}

// Cria um agendamento 'once' por parcela (o motor de agendamentos gera um por ocorrência para
// séries datadas — mesmo padrão dos agendamentos de fatura).
// `auto_register = false` é obrigatório: quem baixa a parcela é POST /api/financiamento/parcela/
// [id]/pagar, e deixar o motor registrar sozinho duplicaria o lançamento e o saldo.
export async function criarAgendamentosParcelas(q, {
  parcelas, contaOrigemId, contaDestinoId, valorParcela, descricaoBase, numParcelas,
  categoriaPrestacaoId = null,
}) {
  const ids = []
  for (const p of parcelas) {
    const id = genId('sch_fin')
    await q(
      `INSERT INTO agendamentos
         (id, description, transaction_type, account_id, to_account_id, amount, category_id,
          frequency, start_date, next_occurrence, occurrence_type, installments,
          auto_register, confirmado, tipo, financing_installment_id, registered, skipped, overrides)
       VALUES ($1, $2, 'transfer', $3, $4, $5, $6, 'once', $7, $8, 'continuous', NULL,
               FALSE, FALSE, 'financiamento_parcela', $9, '[]', '[]', '{}')`,
      // start_date é TEXT e next_occurrence é DATE: a mesma data precisa ir em dois parâmetros
      // distintos, senão o Postgres tenta deduzir um único tipo para o placeholder e falha.
      [id, `${descricaoBase} ${p.numero}/${numParcelas}`, contaOrigemId, contaDestinoId,
        round2(valorParcela), categoriaPrestacaoId, p.data_vencimento, p.data_vencimento, p.id],
    )
    ids.push(id)
  }
  return ids
}

export async function registrarMovimentacao(q, {
  bemId, tipo, data, descricao, bemOrigemId = null, valor = 0, perdaGanho = null,
  principal = null, juros = null, categoriaId = null, parcelaId = null, lancamentoId = null,
  saldoOrigemAnterior = null,
}) {
  const id = genId('mov')
  await q(
    `INSERT INTO bem_movimentacoes
       (id, bem_id, tipo, data, descricao, bem_origem_id, valor, perda_ganho, principal, juros,
        categoria_id, parcela_id, lancamento_id, saldo_origem_anterior)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [id, bemId, tipo, data, descricao, bemOrigemId, round2(valor),
      perdaGanho === null ? null : round2(perdaGanho),
      principal === null ? null : round2(principal),
      juros === null ? null : round2(juros),
      categoriaId, parcelaId, lancamentoId,
      saldoOrigemAnterior === null ? null : round2(saldoOrigemAnterior)],
  )
  return id
}

// Valida que todos os ids de categoria informados existem. Retorna os ids inválidos.
export async function categoriasInexistentes(q, ids) {
  const alvo = [...new Set(ids.filter(Boolean))]
  if (alvo.length === 0) return []
  const rows = await q(`SELECT id FROM categorias WHERE id = ANY($1)`, [alvo])
  const found = new Set(rows.map(r => r.id))
  return alvo.filter(id => !found.has(id))
}

// Payload padrão de um bem (usado por GET /api/bem/[id] e pelas respostas de criação).
export function serializarBem(conta, categoriasById = {}) {
  const cat = (id) => (id ? { id, nome: categoriasById[id]?.name ?? null } : null)
  return {
    id: conta.id,
    nome: conta.name,
    valor_nota_fiscal: num(conta.valor_nota_fiscal),
    saldo: num(conta.balance),
    tipo: conta.tipo_bem || TIPO_BEM,
    account_type: conta.type,
    descricao: conta.descricao ?? null,
    foi_vendido: !!conta.foi_vendido,
    data_venda: conta.data_venda ? String(conta.data_venda).slice(0, 10) : null,
    bem_destino_id: conta.bem_destino_id ?? null,
    // null (não preenchido) é diferente de 0 (preenchido com zero) — a UI mostra "—" no
    // primeiro caso e R$ 0,00 no segundo, então num() não serve aqui.
    valor_pago_manual: conta.valor_pago_manual == null ? null : num(conta.valor_pago_manual),
    patrimonio_use_method: METODOS_PATRIMONIO.includes(conta.patrimonio_use_method)
      ? conta.patrimonio_use_method
      : METODO_PATRIMONIO_PADRAO,
    categorias: {
      perda: cat(conta.categoria_perda_bem_id),
      ganho: cat(conta.categoria_ganho_bem_id),
      prestacao: cat(conta.categoria_prestacao_id),
      taxa_finan: cat(conta.categoria_taxa_finan_id),
    },
  }
}

// Datas saem via to_char para não sofrerem deslocamento de fuso ao virar Date no driver do pg.
// O `::date` cobre a deriva de schema descrita em normalizarColunasIdParaTexto: estas colunas
// são declaradas DATE aqui, mas numa tabela pré-existente o CREATE TABLE IF NOT EXISTS é no-op e
// o tipo real pode ser TEXT — e aí to_char(text, unknown) não existe e a query inteira quebra.
// Cast identidade quando a coluna já é DATE.
export const SELECT_PARCELAS = `
  SELECT id, financing_id, numero_parcela,
         principal_provisioned, juros_provisioned, total_provisioned,
         principal_pago, juros_pago, total_pago, desvio_juros, status, schedule_id,
         to_char(data_vencimento::date, 'YYYY-MM-DD') AS data_vencimento,
         to_char(data_pagamento::date,  'YYYY-MM-DD') AS data_pagamento
    FROM financing_installments`

export function serializarParcela(p) {
  return {
    id: p.id,
    numero: num(p.numero_parcela),
    principal_provisioned: num(p.principal_provisioned),
    juros_provisioned: num(p.juros_provisioned),
    total_provisioned: num(p.total_provisioned),
    principal_pago: num(p.principal_pago),
    juros_pago: num(p.juros_pago),
    total_pago: num(p.total_pago),
    desvio_juros: num(p.desvio_juros),
    status: p.status,
    data_vencimento: p.data_vencimento,
    data_pagamento: p.data_pagamento,
    schedule_id: p.schedule_id ?? null,
  }
}

export const fail = (res, status, error) => res.status(status).json({ success: false, error })

// 22P02 = invalid_text_representation. Dentro deste módulo isso significa, na prática, uma
// coluna de id ainda tipada como uuid recebendo um id do app ('cat_1786063187890'). Quem
// conserta é o ALTER de normalizarColunasIdParaTexto, dentro de ensureBemSchema — que os
// endpoints não chamam (custo por cold start, ver comentário do DDL). Sem esta dica o usuário
// vê só o erro cru do Postgres e não tem como saber que a saída é reaplicar a migração.
export function explicarErro(err) {
  const msg = err?.message ?? String(err)
  if (err?.code === '22P02' && /type uuid/i.test(msg)) {
    return `${msg} — uma coluna de id do módulo de bem ainda está tipada como uuid. `
      + `Rode POST /api/bem/migrate (ou recarregue o app) para reconvertê-la para TEXT.`
  }
  return msg
}
