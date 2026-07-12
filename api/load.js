import { query } from './_db.js'
import { requireAuth } from './_auth.js'

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return
  try {
    await query(`ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS gerencial_schedule_id TEXT`)
    await query(`ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS fatura_month_year TEXT`)
    // Data original do extrato do cartão (CSV/XLS), preservada separada de `date`
    // (que o sistema corrige para o mês de referência da fatura).
    await query(`ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS date_cartao DATE`)
    await query(`ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS parent_tx_id TEXT`)
    await query(`ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS reserva_funcao_id TEXT`)
    // Conta de reserva vinculada ao lançamento ("Será pago com reserva") — par de reserva_funcao_id.
    await query(`ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS reserva_conta_id TEXT`)
    // Parcela N de M: número e total da série, preenchidos na criação (import e manual).
    await query(`ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS installment_num INTEGER`)
    await query(`ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS installment_total INTEGER`)
    // Chave única da parcela (account_id | base | num/total | centavos | serie_inicio),
    // calculada em txToRow. Índice parcial protege contra importação duplicada.
    await query(`ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS installment_key TEXT`)
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_lancamentos_installment ON lancamentos (installment_key) WHERE installment_key IS NOT NULL`)
    // Transferências entre perfis CPF/CNPJ: categoria na visão de cada perfil.
    await query(`ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS categoria_cnpj_id TEXT`)
    await query(`ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS categoria_cpf_id TEXT`)
    // Empréstimos: marca lançamentos gerados pelo espelho (proteção contra loop).
    await query(`ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS is_espelho BOOLEAN DEFAULT false`)
    // Empréstimos: id do lançamento original que gerou o espelho (cascata de deleção/estorno).
    await query(`ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS espelho_origem_id TEXT`)
    // Rastreabilidade das transferências gerenciais. card_id/fatura_ref identificam o cartão
    // e a fatura de origem; source_expense_id aponta a despesa que originou a etapa A
    // (tx_gerA_*); source_schedule_id aponta o agendamento gerencial que gerou o pagamento.
    await query(`ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS card_id TEXT`)
    await query(`ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS fatura_ref TEXT`)
    await query(`ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS source_expense_id TEXT`)
    await query(`ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS source_schedule_id TEXT`)
    // Backfill idempotente: os tx_gerA_<expenseId> existentes embutem o id da despesa origem
    // no próprio id (prefixo 'tx_gerA_' = 8 chars). Só preenche quando ainda está nulo.
    await query(`UPDATE lancamentos SET source_expense_id = SUBSTRING(id FROM 9)
                 WHERE id LIKE 'tx_gerA_%' AND source_expense_id IS NULL`)
    // Backfill card_id/fatura_ref dos tx_gerA_* legados a partir da despesa origem. card_id =
    // account_id da despesa; fatura_ref = MM/YYYY derivado de fatura_month_year (a despesa NÃO
    // tem fatura_ref própria — é coluna nova, só gravada em tx_gerA_*/pagamentos). Idêntico ao
    // valor que o motor grava. Guardado por NULL → no-op depois de preenchido.
    await query(`UPDATE lancamentos l_ger
      SET card_id = l_orig.account_id,
          fatura_ref = SUBSTRING(l_orig.fatura_month_year FROM 6 FOR 2) || '/' || SUBSTRING(l_orig.fatura_month_year FROM 1 FOR 4)
      FROM lancamentos l_orig
      WHERE l_orig.id = SUBSTRING(l_ger.id FROM 9)
        AND l_ger.id LIKE 'tx_gerA_%'
        AND l_orig.account_id IS NOT NULL
        AND l_orig.fatura_month_year ~ '^[0-9]{4}-[0-9]{2}$'
        AND (l_ger.card_id IS NULL OR l_ger.fatura_ref IS NULL)`)
    // Backfill fatura_ref das DESPESAS de cartão importadas antes do fix (fatura_ref não era
    // gravado no import, só fatura_month_year). Deriva MM/YYYY de fatura_month_year — mesma
    // convenção do resto do app. Idempotente: só toca linhas com fatura_ref NULL.
    await query(`UPDATE lancamentos
      SET fatura_ref = SUBSTRING(fatura_month_year FROM 6 FOR 2) || '/' || SUBSTRING(fatura_month_year FROM 1 FOR 4)
      WHERE fatura_ref IS NULL
        AND fatura_month_year ~ '^[0-9]{4}-[0-9]{2}$'`)
    // Rastreabilidade completa da cadeia: propaga fatura_ref da despesa de origem para os
    // lançamentos derivados que têm source_expense_id mas fatura_ref NULL. Idempotente (só NULL).
    // (1) Etapas A (tx_gerA_*) a partir da despesa de origem.
    await query(`UPDATE lancamentos ger
      SET fatura_ref = exp.fatura_ref
      FROM lancamentos exp
      WHERE ger.id LIKE 'tx_gerA_%'
        AND ger.source_expense_id = exp.id
        AND exp.fatura_ref IS NOT NULL
        AND ger.fatura_ref IS NULL`)
    // (2) Provisões/resgates (transfer) NÃO-etapa-A com source_expense_id (ex.: tx_ger_* do
    // "Executar Gerenciais", 1:1 com a parcela de origem via source_expense_id).
    await query(`UPDATE lancamentos res
      SET fatura_ref = exp.fatura_ref
      FROM lancamentos exp
      WHERE res.source_expense_id = exp.id
        AND res.id NOT LIKE 'tx_gerA_%'
        AND exp.fatura_ref IS NOT NULL
        AND res.fatura_ref IS NULL
        AND res.type = 'transfer'`)
    await query(`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS reserva_funcao_id TEXT`)
    await query(`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS fatura_ref VARCHAR(7)`)
    await query(`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS card_id TEXT`)
    await query(`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS fatura_mes_ano TEXT`)
    await query(`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS tipo TEXT`)
    // Flag visual "Confirmado / A Confirmar": marca que o valor da próxima
    // ocorrência já foi confirmado. Reseta para false ao registrar a ocorrência.
    await query(`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS confirmado BOOLEAN DEFAULT false`)
    // Provisão de Despesa: agendamento "Uma vez" que representa uma despesa futura
    // estimada (valor/data ainda não definitivos). is_provisao marca o registro como
    // provisão; provisao_efetivada vira true quando o valor/data reais são confirmados.
    await query(`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS is_provisao BOOLEAN DEFAULT false`)
    await query(`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS provisao_efetivada BOOLEAN DEFAULT false`)
    // Provisão recorrente (Contínua/Parcelada): data da última ocorrência já efetivada. A
    // próxima ocorrência a efetivar é a primeira após esta data; null = nenhuma efetivada.
    await query(`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS provisao_efetivada_until DATE`)
    // Data de vencimento atual / próxima ocorrência de referência. Quando preenchida, a
    // geração de ocorrências futuras parte daqui (re-ancoragem do dia) em vez de start_date.
    // NULL = comportamento original (calcula desde start_date).
    await query(`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS next_occurrence DATE`)
    // Chain ID: lançamento que originou o agendamento (resgate avulso "Será pago com reserva").
    // 1:1 — agregados de fatura (fsch_*) usam overrides._sourceTxIds (N:1) em vez desta coluna.
    await query(`ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS source_tx_id TEXT`)
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
    // Categoria da despesa vinculada à função (opcional): as sombras de reserva herdam
    // essa categoria. category_id é sempre TEXT (sem FK), como nas demais tabelas.
    await query(`ALTER TABLE reserve_functions ADD COLUMN IF NOT EXISTS category_id TEXT`)
    // Flag: a função representa uma despesa real (provisão) — suas movimentações podem contar
    // como despesa nos relatórios/dashboard. Default false. O SEED inicial dos valores roda
    // SÓ UMA VEZ (quando a coluna é criada); depois respeita o toggle editado pelo usuário.
    {
      const exibirCol = await query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name = 'reserve_functions' AND column_name = 'exibir_como_despesa'`
      )
      if (exibirCol.length === 0) {
        await query(`ALTER TABLE reserve_functions ADD COLUMN exibir_como_despesa BOOLEAN NOT NULL DEFAULT false`)
        await query(
          `UPDATE reserve_functions SET exibir_como_despesa = true WHERE name = ANY($1)`,
          [[
            'IPVA','Seguro Residencial','IPTU','CRC','Reserva do Mês','Seguro Carro',
            'Licenciamento','Pneus','Óleo','Academia','Brasil Sem Medo','Norton',
            'Fralda Bebê','Microsoft','Seguro de Vida','Brasil Paralelo','Gás',
            'Stela Maris','Presentes','Salão GI','Cadeira BB','Aniversário GI e Victor',
            'Consórcio','Expo Londrina','Ensaio de Natal','Parto Gislaine',
          ]]
        )
        // false é o DEFAULT; explicitar as demais é redundante, mas mantém a intenção clara.
        await query(
          `UPDATE reserve_functions SET exibir_como_despesa = false WHERE name = ANY($1)`,
          [[
            'Help','Aluguel Papai','13 Salário GI','Férias GI','Outras Rec GI',
            'Outras Rec Victor','Bolsa GI','Safra Financi','PIS GI','Rico e BB',
            'Help Itália','Help Lava','Help Not','Help ___','PHARMALOG',
          ]]
        )
      }
    }
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
    // Investimento (Poupança / Bem-Ativo): conta que acumula patrimônio com liquidez
    // condicional (consórcio, imóvel na planta, previdência). Comportamento igual à
    // reserva específica; categoria vinculada gera despesa/receita automática.
    await query(`ALTER TABLE contas ADD COLUMN IF NOT EXISTS is_investimento BOOLEAN DEFAULT false`)
    await query(`ALTER TABLE contas ADD COLUMN IF NOT EXISTS is_gerencial BOOLEAN DEFAULT false`)
    await query(`ALTER TABLE contas ADD COLUMN IF NOT EXISTS investment_category_id TEXT`)
    // Migração de dados: contas que já eram reserva passam a ter vinculo_tipo='reserva'.
    await query(`UPDATE contas SET vinculo_tipo = 'reserva' WHERE is_reserva = true AND (vinculo_tipo IS NULL OR vinculo_tipo = 'none')`)
    // Mantém is_reserva sincronizado com vinculo_tipo (compat. com código legado).
    await query(`UPDATE contas SET is_reserva = (vinculo_tipo = 'reserva') WHERE vinculo_tipo IS NOT NULL`)
    await query(`ALTER TABLE categorias ADD COLUMN IF NOT EXISTS investment_account_id TEXT`)
    // Empréstimos: categoria gera lançamento espelho e a conta vinculada (TEXT, sem FK).
    await query(`ALTER TABLE categorias ADD COLUMN IF NOT EXISTS gera_espelho BOOLEAN DEFAULT false`)
    await query(`ALTER TABLE categorias ADD COLUMN IF NOT EXISTS conta_espelho_id TEXT`)
    await query(`ALTER TABLE categorias ADD COLUMN IF NOT EXISTS default_gerencial_group TEXT`)
    await query(`ALTER TABLE configuracoes ADD COLUMN IF NOT EXISTS balance_snapshot JSONB`)
    await query(`ALTER TABLE configuracoes ADD COLUMN IF NOT EXISTS financial_month_mode TEXT DEFAULT 'custom'`)
    await query(`ALTER TABLE configuracoes ADD COLUMN IF NOT EXISTS category_groups JSONB DEFAULT '[]'`)
    await query(`ALTER TABLE configuracoes ADD COLUMN IF NOT EXISTS estorno_cartao_enabled BOOLEAN`)
    await query(`ALTER TABLE configuracoes ADD COLUMN IF NOT EXISTS estorno_cartao_category_id TEXT`)

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
    // Seed idempotente: categoria "Consórcio" (despesa) p/ contas de investimento.
    await query(`
      INSERT INTO categorias (id, name, type, color, icon, category_group)
      SELECT 'cat_consorcio', 'Consórcio', 'expense', '#a855f7', '🏠', 'Aplicações'
      WHERE NOT EXISTS (SELECT 1 FROM categorias WHERE id = 'cat_consorcio' OR name = 'Consórcio')
    `)
    // Conversão única da conta "Consórcio HS" em investimento, vinculada à categoria
    // Consórcio. Só aplica enquanto a conta nunca foi configurada como investimento
    // (não sobrescreve ajustes posteriores feitos pelo usuário).
    await query(`
      UPDATE contas
      SET is_investimento = true,
          investment_category_id = (SELECT id FROM categorias WHERE id = 'cat_consorcio' OR name = 'Consórcio' ORDER BY (id = 'cat_consorcio') DESC LIMIT 1)
      WHERE (name ILIKE '%consorcio%hs%' OR name ILIKE '%consórcio%hs%')
        AND is_investimento IS NOT TRUE
        AND investment_category_id IS NULL
    `)
    await query(`ALTER TABLE regras_classificacao ADD COLUMN IF NOT EXISTS day_of_month INTEGER`)
    await query(`ALTER TABLE regras_classificacao ADD COLUMN IF NOT EXISTS amount_approx NUMERIC`)
    await query(`ALTER TABLE regras_classificacao ADD COLUMN IF NOT EXISTS grupo_gerencial TEXT`)
    await query(`ALTER TABLE regras_classificacao ADD COLUMN IF NOT EXISTS reserva_funcao_id TEXT`)
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
