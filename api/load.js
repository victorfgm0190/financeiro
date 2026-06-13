import { query } from './_db.js'

export default async function handler(req, res) {
  try {
    await query(`ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS gerencial_schedule_id TEXT`)
    await query(`ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS fatura_month_year TEXT`)
    // Data original do extrato do cartão (CSV/XLS), preservada separada de `date`
    // (que o sistema corrige para o mês de referência da fatura).
    await query(`ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS date_cartao DATE`)
    await query(`ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS parent_tx_id TEXT`)
    await query(`ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS reserva_funcao_id TEXT`)
    // Transferências entre perfis CPF/CNPJ: categoria na visão de cada perfil.
    await query(`ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS categoria_cnpj_id TEXT`)
    await query(`ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS categoria_cpf_id TEXT`)
    await query(`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS reserva_funcao_id TEXT`)
    await query(`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS fatura_ref VARCHAR(7)`)
    await query(`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS card_id TEXT`)
    await query(`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS fatura_mes_ano TEXT`)
    await query(`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS tipo TEXT`)
    // Flag visual "Confirmado / A Confirmar": marca que o valor da próxima
    // ocorrência já foi confirmado. Reseta para false ao registrar a ocorrência.
    await query(`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS confirmado BOOLEAN DEFAULT false`)
    await query(`CREATE TABLE IF NOT EXISTS reserve_functions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      account_id TEXT,
      saldo_inicial NUMERIC DEFAULT 0,
      entradas NUMERIC DEFAULT 0,
      saidas NUMERIC DEFAULT 0,
      despesa_anual NUMERIC DEFAULT 0,
      deposito_mensal NUMERIC DEFAULT 0,
      mes_vencimento TEXT,
      ordem INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now()
    )`)
    // Override manual de entradas/saídas calculadas a partir de lançamentos (Etapa 2 das Reservas).
    // NULL = usar valor calculado; número = sobrescreve o cálculo automático.
    await query(`ALTER TABLE reserve_functions ADD COLUMN IF NOT EXISTS entradas_override NUMERIC`)
    await query(`ALTER TABLE reserve_functions ADD COLUMN IF NOT EXISTS saidas_override NUMERIC`)
    // Ajuste manual por mês: { "YYYY-MM": valor } (positivo ou negativo).
    await query(`ALTER TABLE reserve_functions ADD COLUMN IF NOT EXISTS ajuste_override JSONB`)
    // Staging de importação histórica (Dindin): linhas ficam aqui para revisão antes
    // de virarem lançamentos. status: pendente | confirmado | ignorado.
    await query(`CREATE TABLE IF NOT EXISTS importacoes_pendentes (
      id TEXT PRIMARY KEY,
      origem TEXT NOT NULL DEFAULT 'DINDIN',
      data TEXT,
      descricao TEXT,
      valor NUMERIC DEFAULT 0,
      tipo TEXT,
      conta_origem_dindin TEXT,
      conta_destino_dindin TEXT,
      conta_origem_finup TEXT,
      conta_destino_finup TEXT,
      categoria_id TEXT,
      status TEXT NOT NULL DEFAULT 'pendente',
      fonte TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )`)
    await query(`ALTER TABLE importacoes_pendentes ADD COLUMN IF NOT EXISTS fonte TEXT`)
    await query(`ALTER TABLE reservas ADD COLUMN IF NOT EXISTS import_id TEXT`)
    await query(`ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS reconciled BOOLEAN DEFAULT false`)
    await query(`ALTER TABLE contas ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true`)
    await query(`ALTER TABLE grupos_conta ADD COLUMN IF NOT EXISTS anchor_account_id TEXT`)
    await query(`ALTER TABLE contas ADD COLUMN IF NOT EXISTS app_priority BOOLEAN DEFAULT FALSE`)
    await query(`ALTER TABLE contas ADD COLUMN IF NOT EXISTS initial_balance NUMERIC DEFAULT NULL`)
    await query(`ALTER TABLE contas ADD COLUMN IF NOT EXISTS projected_balance NUMERIC DEFAULT NULL`)
    await query(`ALTER TABLE contas ADD COLUMN IF NOT EXISTS conta_aplicacao BOOLEAN DEFAULT FALSE`)
    // Oculta a conta apenas nas listas/seletores no mobile (<md). Dados/saldos intactos.
    await query(`ALTER TABLE contas ADD COLUMN IF NOT EXISTS hide_on_mobile BOOLEAN DEFAULT FALSE`)
    // Índices para a Busca Global (filtro por valor).
    await query(`CREATE INDEX IF NOT EXISTS idx_lancamentos_amount ON lancamentos (amount)`)
    await query(`CREATE INDEX IF NOT EXISTS idx_agendamentos_amount ON agendamentos (amount)`)
    // Vínculo da conta: 'none' | 'reserva' | 'patrimonio'. Fonte de verdade do tipo
    // de vínculo (is_reserva/reserva_type/reserva_category_id permanecem para a Reserva).
    await query(`ALTER TABLE contas ADD COLUMN IF NOT EXISTS vinculo_tipo TEXT DEFAULT 'none'`)
    await query(`ALTER TABLE contas ADD COLUMN IF NOT EXISTS patrimonio_category_id TEXT`)
    // Migração de dados: contas que já eram reserva passam a ter vinculo_tipo='reserva'.
    await query(`UPDATE contas SET vinculo_tipo = 'reserva' WHERE is_reserva = true AND (vinculo_tipo IS NULL OR vinculo_tipo = 'none')`)
    // Mantém is_reserva sincronizado com vinculo_tipo (compat. com código legado).
    await query(`UPDATE contas SET is_reserva = (vinculo_tipo = 'reserva') WHERE vinculo_tipo IS NOT NULL`)
    await query(`ALTER TABLE categorias ADD COLUMN IF NOT EXISTS investment_account_id TEXT`)
    await query(`ALTER TABLE configuracoes ADD COLUMN IF NOT EXISTS balance_snapshot JSONB`)
    await query(`ALTER TABLE configuracoes ADD COLUMN IF NOT EXISTS financial_month_mode TEXT DEFAULT 'custom'`)
    await query(`ALTER TABLE configuracoes ADD COLUMN IF NOT EXISTS category_groups JSONB DEFAULT '[]'`)

    // Seed idempotente: categoria "Capitalização" vinculada à conta de investimento Brasilcap.
    // Só insere se houver uma conta cujo nome casa com "brasil...cap" e a categoria ainda não existir.
    await query(`
      INSERT INTO categorias (id, name, type, color, icon, category_group, investment_account_id)
      SELECT 'cat_capitalizacao', 'Capitalização', 'expense', '#22c55e', '🐷', 'Aplicações', c.id
      FROM contas c
      WHERE c.name ILIKE '%brasil%cap%'
        AND NOT EXISTS (SELECT 1 FROM categorias WHERE id = 'cat_capitalizacao' OR name = 'Capitalização')
      LIMIT 1
    `)
    await query(`ALTER TABLE regras_classificacao ADD COLUMN IF NOT EXISTS day_of_month INTEGER`)
    await query(`ALTER TABLE regras_classificacao ADD COLUMN IF NOT EXISTS amount_approx NUMERIC`)
    await query(`ALTER TABLE regras_classificacao ADD COLUMN IF NOT EXISTS grupo_gerencial TEXT`)
    await query(`CREATE TABLE IF NOT EXISTS gerencial_rules (
      id TEXT PRIMARY KEY,
      contains TEXT NOT NULL,
      is_parcelado TEXT DEFAULT 'any',
      min_amount NUMERIC,
      max_amount NUMERIC,
      grupo_gerencial_id TEXT NOT NULL,
      "order" INTEGER DEFAULT 0
    )`)
    // Rateio de lançamento: divide uma despesa/receita em várias categorias.
    // lancamento_id referencia lancamentos.id (ou um id de agendamento) — coluna TEXT
    // sem FK rígida para suportar ambos os casos.
    await query(`CREATE TABLE IF NOT EXISTS lancamento_rateios (
      id TEXT PRIMARY KEY,
      lancamento_id TEXT,
      categoria_id TEXT,
      valor NUMERIC DEFAULT 0,
      descricao TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )`)
    await query(`CREATE INDEX IF NOT EXISTS idx_rateios_lancamento ON lancamento_rateios (lancamento_id)`)
    // Detalhamento por função de reserva do agendamento de resgate_reserva.
    // Recalculado do zero por recalcularAgendamentosFatura a partir dos lançamentos.
    await query(`CREATE TABLE IF NOT EXISTS schedule_reserva_funcoes (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      schedule_id TEXT NOT NULL,
      reserva_funcao_id TEXT NOT NULL,
      valor NUMERIC(12,2) NOT NULL DEFAULT 0
    )`)
    await query(`CREATE INDEX IF NOT EXISTS idx_srf_schedule ON schedule_reserva_funcoes (schedule_id)`)
    const [accs, txs, scheds, cats, buds, rules, gers, pays, faves, cfgRows, envs, groups, perfis, imports, grules, rfns, rateios, srfs] =
      await Promise.all([
        query('SELECT * FROM contas'),
        query('SELECT * FROM lancamentos ORDER BY created_at'),
        query('SELECT * FROM agendamentos'),
        query('SELECT * FROM categorias'),
        query('SELECT * FROM orcamento'),
        query('SELECT * FROM regras_classificacao'),
        query('SELECT * FROM reservas_funcoes'),
        query('SELECT * FROM reservas'),
        query('SELECT name FROM favorecidos'),
        query('SELECT * FROM configuracoes WHERE id = 1'),
        query('SELECT * FROM envelopes'),
        query('SELECT * FROM grupos_conta ORDER BY "order"'),
        query('SELECT * FROM perfis'),
        query('SELECT * FROM card_imports ORDER BY imported_at DESC'),
        query('SELECT * FROM gerencial_rules ORDER BY "order"'),
        query('SELECT * FROM reserve_functions ORDER BY ordem, name'),
        query('SELECT * FROM lancamento_rateios'),
        query('SELECT * FROM schedule_reserva_funcoes'),
      ])

    res.json({
      accs, txs, scheds, cats, buds, rules, gers, pays, faves,
      cfg: cfgRows[0] || null,
      envs, groups, perfis, imports, grules, rfns, rateios, srfs,
    })
  } catch (err) {
    const isTableMissing =
      err.code === '42P01' ||
      (err.message || '').includes('does not exist') ||
      (err.message || '').includes('relation')
    res.status(isTableMissing ? 404 : 500).json({ error: err.message, code: err.code })
  }
}
