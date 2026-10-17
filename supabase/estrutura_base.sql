-- ============================================================
-- ESTRUTURA BASE dos bancos de ambiente — GERADO, não editar à mão.
-- Gerado por scripts/gerar-estrutura-base.js em 2026-10-17T23:32:00.294Z a partir do
-- database "neondb" (commit 4ea63a6). Só estrutura: nenhum comando de dados, nenhuma linha copiada.
-- 43 tabelas · 41 índices · 2 sequences. Fora: plataforma_*, _migracoes.
-- Aplicada uma vez, numa transação, no banco novo do cliente; depois vêm as migrações.
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS account_mapping_id_seq AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;
CREATE SEQUENCE IF NOT EXISTS atalhos_usuario_id_seq AS integer INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1;

CREATE TABLE IF NOT EXISTS account_mapping (
  id integer DEFAULT nextval('account_mapping_id_seq'::regclass) NOT NULL,
  user_id text,
  grupo text,
  nome_finup text,
  nome_dindin text,
  nao_criar boolean DEFAULT false,
  ignorar_transferencias boolean DEFAULT false,
  vincular_cnpj boolean DEFAULT false,
  rendimento_permitido boolean DEFAULT false,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT account_mapping_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS agendamentos (
  id text NOT NULL,
  description text NOT NULL,
  transaction_type text NOT NULL,
  account_id text,
  to_account_id text,
  amount numeric NOT NULL,
  category_id text,
  payee text,
  cost_center text,
  account_type text,
  frequency text NOT NULL,
  start_date text NOT NULL,
  occurrence_type text DEFAULT 'continuous'::text,
  installments integer,
  registered jsonb DEFAULT '[]'::jsonb,
  skipped jsonb DEFAULT '[]'::jsonb,
  remind_days_before integer DEFAULT 3,
  auto_register boolean DEFAULT true,
  overrides jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  grupo_gerencial text,
  reserva_expense_category_id text,
  reserva_funcao_id text,
  fatura_ref character varying(7),
  card_id text,
  fatura_mes_ano text,
  tipo text,
  confirmado boolean DEFAULT false,
  is_provisao boolean DEFAULT false,
  provisao_efetivada boolean DEFAULT false,
  provisao_efetivada_until date,
  next_occurrence date,
  source_tx_id text,
  source_expense_ids jsonb DEFAULT '[]'::jsonb,
  financing_installment_id text,
  principal_value numeric,
  juros_value numeric,
  tipo_componente text,
  registered_meta jsonb DEFAULT '{}'::jsonb NOT NULL,
  tipo_documento_id text,
  categoria_cnpj_id text,
  categoria_cpf_id text,
  CONSTRAINT agendamentos_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS atalhos_usuario (
  id integer DEFAULT nextval('atalhos_usuario_id_seq'::regclass) NOT NULL,
  user_id text NOT NULL,
  acao_id text NOT NULL,
  combinacao text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT atalhos_usuario_pkey PRIMARY KEY (id),
  CONSTRAINT atalhos_usuario_user_id_acao_id_key UNIQUE (user_id, acao_id)
);

CREATE TABLE IF NOT EXISTS bem_movimentacoes (
  id text DEFAULT (gen_random_uuid())::text NOT NULL,
  bem_origem_id text,
  bem_destino_id text,
  valor_nota_fiscal numeric(12,2),
  valor_venda numeric(12,2),
  ganho_perda numeric(12,2),
  tipo_movimentacao text,
  observacoes text,
  data_movimentacao date,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  principal numeric,
  juros numeric,
  parcela_id text,
  lancamento_id text,
  perda_ganho numeric,
  bem_id text,
  tipo text,
  data text,
  descricao text,
  valor_negociado numeric,
  categoria_id text,
  conta_id text,
  valor numeric,
  valor_bem_antigo numeric,
  transferencia_id text,
  bem_novo_id text,
  saldo_origem_anterior numeric,
  CONSTRAINT bem_movimentacoes_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS card_imports (
  id text NOT NULL,
  imported_at timestamp with time zone DEFAULT now() NOT NULL,
  count integer DEFAULT 0 NOT NULL,
  mes_ano text DEFAULT ''::text NOT NULL,
  filename text DEFAULT ''::text NOT NULL,
  account_id text DEFAULT ''::text NOT NULL,
  tx_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
  schedule_baixas jsonb DEFAULT '[]'::jsonb NOT NULL,
  CONSTRAINT card_imports_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS cartoes (
  id text NOT NULL,
  credit_limit numeric DEFAULT 0,
  credit_debt numeric DEFAULT 0,
  closing_day integer,
  due_day integer,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT cartoes_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS categorias (
  id text NOT NULL,
  name text NOT NULL,
  type text NOT NULL,
  color text,
  icon text,
  created_at timestamp with time zone DEFAULT now(),
  category_group text,
  investment_account_id text,
  gera_espelho boolean DEFAULT false,
  conta_espelho_id text,
  default_gerencial_group text,
  perfil_ids text[],
  sort_order integer,
  CONSTRAINT categorias_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS configuracoes (
  id integer DEFAULT 1 NOT NULL,
  financial_month_start_day integer DEFAULT 1,
  currency text DEFAULT 'BRL'::text,
  cost_centers jsonb DEFAULT '["Pessoal", "Família", "Trabalho", "Casa"]'::jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  recurring_match_exceptions jsonb DEFAULT '[]'::jsonb,
  balance_snapshot jsonb,
  financial_month_mode text DEFAULT 'custom'::text,
  category_groups jsonb DEFAULT '[]'::jsonb,
  estorno_cartao_enabled boolean,
  estorno_cartao_category_id text,
  faturas_fechadas jsonb DEFAULT '{}'::jsonb,
  category_groups_ordem_manual boolean DEFAULT false,
  mobile_home_cards jsonb,
  CONSTRAINT configuracoes_id_check CHECK ((id = 1)),
  CONSTRAINT configuracoes_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS contas (
  id text NOT NULL,
  name text NOT NULL,
  apelido text,
  type text NOT NULL,
  bank text,
  balance numeric DEFAULT 0,
  credit_limit numeric,
  credit_debt numeric DEFAULT 0,
  credit_month_bill numeric DEFAULT 0,
  closing_day integer,
  due_day integer,
  is_main boolean DEFAULT false,
  fluxo_caixa_principal boolean DEFAULT false,
  conta_corrente_principal boolean DEFAULT false,
  grupo_gerencial text,
  created_at timestamp with time zone DEFAULT now(),
  account_group_id text,
  "order" integer DEFAULT 0,
  debt_plan jsonb,
  profile_id text,
  acquisition_value numeric,
  acquisition_date text,
  value_history jsonb DEFAULT '[]'::jsonb,
  is_reserva boolean DEFAULT false,
  reserva_type text,
  reserva_category_id text,
  app_priority boolean DEFAULT false,
  initial_balance numeric,
  projected_balance numeric,
  conta_aplicacao boolean DEFAULT false,
  active boolean DEFAULT true,
  hide_on_mobile boolean DEFAULT false,
  vinculo_tipo text DEFAULT 'none'::text,
  patrimonio_category_id text,
  is_investimento boolean DEFAULT false,
  investment_category_id text,
  is_gerencial boolean DEFAULT false,
  payment_account_id text,
  rendimento_categoria_id text,
  rendimento_modo text DEFAULT 'conta'::text,
  tipo text DEFAULT 'corrente'::text,
  valor_nota_fiscal numeric(12,2),
  foi_vendido boolean DEFAULT false,
  data_venda date,
  bem_destino_id text,
  categoria_perda_bem_id text,
  categoria_ganho_bem_id text,
  categoria_prestacao_id text,
  categoria_taxa_finan_id text,
  tipo_bem text,
  descricao text,
  valor_pago_manual numeric,
  patrimonio_use_method text DEFAULT 'valor_pago'::text,
  CONSTRAINT ck_conta_central_com_perfil CHECK (((NOT COALESCE(conta_corrente_principal, false)) OR (profile_id IS NOT NULL))),
  CONSTRAINT contas_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS envelopes (
  id text NOT NULL,
  name text NOT NULL,
  limit_amount numeric DEFAULT 0 NOT NULL,
  due_day integer DEFAULT 1 NOT NULL,
  category_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
  account_id text,
  history jsonb DEFAULT '[]'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT envelopes_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS favorecido_alias (
  id text DEFAULT (gen_random_uuid())::text NOT NULL,
  padrao text NOT NULL,
  favorecido text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT favorecido_alias_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS favorecidos (
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT favorecidos_pkey PRIMARY KEY (name)
);

CREATE TABLE IF NOT EXISTS financing (
  id text DEFAULT (gen_random_uuid())::text NOT NULL,
  bem_id text NOT NULL,
  conta_divida_id text,
  valor_principal numeric(12,2) NOT NULL,
  juros_totais numeric(12,2) NOT NULL,
  valor_total numeric(12,2) NOT NULL,
  num_parcelas integer NOT NULL,
  valor_parcela numeric(12,2) NOT NULL,
  principal_por_parcela numeric(12,2) NOT NULL,
  juros_por_parcela numeric(12,2) NOT NULL,
  banco text NOT NULL,
  status text DEFAULT 'open'::text,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  conta_origem_id text,
  data_primeira_parcela date,
  banco_favorecido_id text,
  CONSTRAINT financing_status_check CHECK ((status = ANY (ARRAY['open'::text, 'partial'::text, 'completed'::text]))),
  CONSTRAINT financing_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS financing_installments (
  id text DEFAULT (gen_random_uuid())::text NOT NULL,
  financing_id text NOT NULL,
  numero_parcela integer NOT NULL,
  principal_provisioned numeric(12,2) NOT NULL,
  juros_provisioned numeric(12,2) NOT NULL,
  total_provisioned numeric(12,2) NOT NULL,
  principal_pago numeric(12,2) DEFAULT 0,
  juros_pago numeric(12,2) DEFAULT 0,
  total_pago numeric(12,2) DEFAULT 0,
  desvio_juros numeric(12,2) DEFAULT 0,
  data_vencimento date NOT NULL,
  data_pagamento timestamp without time zone,
  status text DEFAULT 'open'::text,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  schedule_id text,
  saldo_restante numeric,
  CONSTRAINT ck_numero_parcela CHECK ((numero_parcela > 0)),
  CONSTRAINT financing_installments_status_check CHECK ((status = ANY (ARRAY['open'::text, 'partial'::text, 'paid'::text]))),
  CONSTRAINT financing_installments_pkey PRIMARY KEY (id),
  CONSTRAINT uq_parcela_numero UNIQUE (financing_id, numero_parcela)
);

CREATE TABLE IF NOT EXISTS fluxo_consultas (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  nome text NOT NULL,
  modo text NOT NULL,
  account_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
  group_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
  perfil_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
  incluir_agendamentos boolean DEFAULT true NOT NULL,
  incluir_lancamentos_futuros boolean DEFAULT true NOT NULL,
  incluir_envelopes boolean DEFAULT true NOT NULL,
  ocultar_reserva boolean DEFAULT false NOT NULL,
  ocultar_patrimonio boolean DEFAULT false NOT NULL,
  horizonte_padrao integer DEFAULT 30 NOT NULL,
  padrao boolean DEFAULT false NOT NULL,
  ordem integer,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT fluxo_consultas_modo_check CHECK ((modo = ANY (ARRAY['conta'::text, 'grupo'::text, 'principais'::text]))),
  CONSTRAINT fluxo_consultas_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS fluxo_datas_provisorias (
  id text DEFAULT (gen_random_uuid())::text NOT NULL,
  schedule_id text NOT NULL,
  data_original text NOT NULL,
  data_provisoria text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT fluxo_datas_provisorias_pkey PRIMARY KEY (id),
  CONSTRAINT fluxo_datas_provisorias_schedule_id_data_original_key UNIQUE (schedule_id, data_original)
);

CREATE TABLE IF NOT EXISTS fluxo_provisorios (
  id text DEFAULT (gen_random_uuid())::text NOT NULL,
  date text NOT NULL,
  description text NOT NULL,
  amount numeric DEFAULT 0 NOT NULL,
  type text NOT NULL,
  account_id text,
  category_id text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT fluxo_provisorios_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS gerencial_rules (
  id text NOT NULL,
  contains text NOT NULL,
  is_parcelado text DEFAULT 'any'::text,
  min_amount numeric,
  max_amount numeric,
  grupo_gerencial_id text NOT NULL,
  "order" integer DEFAULT 0,
  CONSTRAINT gerencial_rules_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS grupos_conta (
  id text NOT NULL,
  name text NOT NULL,
  type text DEFAULT 'financeiro'::text NOT NULL,
  "order" integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  behavior text,
  inibido boolean DEFAULT false,
  anchor_account_id text,
  CONSTRAINT grupos_conta_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS historico_alteracoes (
  id text DEFAULT (gen_random_uuid())::text NOT NULL,
  entidade text NOT NULL,
  entidade_id text NOT NULL,
  ocorrencia_data text,
  serie_key text,
  lote_id text NOT NULL,
  escopo text NOT NULL,
  campo text NOT NULL,
  valor_anterior jsonb,
  valor_novo jsonb,
  motivo text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  origem text,
  CONSTRAINT historico_alteracoes_entidade_check CHECK ((entidade = ANY (ARRAY['agendamento'::text, 'lancamento'::text]))),
  CONSTRAINT historico_alteracoes_escopo_check CHECK ((escopo = ANY (ARRAY['parcela'::text, 'proximas'::text, 'serie'::text]))),
  CONSTRAINT historico_alteracoes_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS importacoes_pendentes (
  id text NOT NULL,
  origem text DEFAULT 'DINDIN'::text NOT NULL,
  data text,
  descricao text,
  valor numeric DEFAULT 0,
  tipo text,
  conta_origem_dindin text,
  conta_destino_dindin text,
  conta_origem_finup text,
  conta_destino_finup text,
  categoria_id text,
  status text DEFAULT 'pendente'::text NOT NULL,
  fonte text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT importacoes_pendentes_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS lancamento_rateios (
  id text NOT NULL,
  lancamento_id text,
  categoria_id text,
  valor numeric DEFAULT 0,
  descricao text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT lancamento_rateios_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS lancamentos (
  id text NOT NULL,
  type text NOT NULL,
  account_id text,
  to_account_id text,
  from_account_id text,
  amount numeric NOT NULL,
  date text NOT NULL,
  description text,
  category_id text,
  payee text,
  cost_center text,
  notes text,
  grupo_gerencial text,
  account_type text,
  schedule_id text,
  reconciled boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  reserva_auto boolean DEFAULT false,
  origin text DEFAULT 'manual'::text,
  gerencial_schedule_id text,
  fatura_month_year text,
  parent_tx_id text,
  reserva_funcao_id text,
  categoria_cnpj_id text,
  categoria_cpf_id text,
  date_cartao date,
  installment_num integer,
  installment_total integer,
  installment_key text,
  is_espelho boolean DEFAULT false,
  espelho_origem_id text,
  reserva_conta_id text,
  card_id text,
  fatura_ref text,
  source_expense_id text,
  source_schedule_id text,
  serie_id text,
  bem_id text,
  installment_occurrence integer,
  tipo_documento_id text,
  CONSTRAINT lancamentos_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS login_bloqueios (
  chave text NOT NULL,
  tentativas_falhas integer DEFAULT 0 NOT NULL,
  bloqueado_ate timestamp with time zone,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT login_bloqueios_pkey PRIMARY KEY (chave)
);

CREATE TABLE IF NOT EXISTS marcos_saldo_gerencial (
  id text DEFAULT (gen_random_uuid())::text NOT NULL,
  conta_id text NOT NULL,
  data text NOT NULL,
  saldo numeric NOT NULL,
  diferenca_aceita numeric,
  motivo text NOT NULL,
  criado_por text,
  criado_em timestamp with time zone DEFAULT now(),
  CONSTRAINT marcos_saldo_gerencial_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS membros (
  id text DEFAULT (gen_random_uuid())::text NOT NULL,
  usuario_id text NOT NULL,
  organizacao_id text NOT NULL,
  papel text DEFAULT 'usuario'::text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT membros_papel_check CHECK ((papel = ANY (ARRAY['admin'::text, 'usuario'::text, 'leitura'::text]))),
  CONSTRAINT membros_pkey PRIMARY KEY (id),
  CONSTRAINT membros_usuario_id_organizacao_id_key UNIQUE (usuario_id, organizacao_id)
);

CREATE TABLE IF NOT EXISTS orcamento (
  id text NOT NULL,
  category_id text,
  amount numeric DEFAULT 0 NOT NULL,
  period text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT orcamento_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS organizacoes (
  id text DEFAULT (gen_random_uuid())::text NOT NULL,
  nome text NOT NULL,
  ativo boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT organizacoes_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS pendencias_integridade (
  id text DEFAULT (gen_random_uuid())::text NOT NULL,
  regra text NOT NULL,
  severidade text NOT NULL,
  origem_id text NOT NULL,
  conta_id text,
  fatura_ref text,
  descricao text,
  esperado jsonb,
  encontrado jsonb,
  status text DEFAULT 'pendente'::text NOT NULL,
  detectada_em timestamp with time zone DEFAULT now(),
  verificada_em timestamp with time zone DEFAULT now(),
  resolvida_em timestamp with time zone,
  resolvida_por text,
  CONSTRAINT pendencias_integridade_severidade_check CHECK ((severidade = ANY (ARRAY['auto'::text, 'aprovar'::text]))),
  CONSTRAINT pendencias_integridade_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'resolvida'::text, 'ignorada'::text]))),
  CONSTRAINT pendencias_integridade_pkey PRIMARY KEY (id),
  CONSTRAINT pendencias_integridade_regra_origem_id_key UNIQUE (regra, origem_id)
);

CREATE TABLE IF NOT EXISTS perfis (
  id text NOT NULL,
  name text NOT NULL,
  type text DEFAULT 'pf'::text NOT NULL,
  document text,
  color text DEFAULT '#6366f1'::text,
  is_default boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  ordem integer DEFAULT 0,
  CONSTRAINT perfis_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS regras_classificacao (
  id text NOT NULL,
  contains text NOT NULL,
  category_id text,
  payee text,
  created_at timestamp with time zone DEFAULT now(),
  day_of_month integer,
  amount_approx numeric,
  grupo_gerencial text,
  reserva_funcao_id text,
  CONSTRAINT regras_classificacao_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS reservas (
  id text NOT NULL,
  cartao_id text,
  mes_ano text,
  grupo_gerencial_id text,
  origin text,
  description text,
  amount numeric DEFAULT 0,
  due_date text,
  status text DEFAULT 'pending'::text,
  paid_at timestamp with time zone,
  bill_start text,
  bill_end text,
  created_at timestamp with time zone DEFAULT now(),
  installment_number integer,
  total_installments integer,
  import_id text,
  CONSTRAINT reservas_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS reservas_funcoes (
  id text NOT NULL,
  number jsonb NOT NULL,
  name text NOT NULL,
  alias text,
  fixed boolean DEFAULT false,
  default_account_id text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT reservas_funcoes_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS reservas_movimentos (
  id text NOT NULL,
  reserva_id text,
  lancamento_id text,
  type text DEFAULT 'payment'::text,
  amount numeric DEFAULT 0,
  date text,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT reservas_movimentos_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS reserve_adjustments (
  id text NOT NULL,
  function_id text NOT NULL,
  data date NOT NULL,
  valor numeric NOT NULL,
  observacao text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT reserve_adjustments_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS reserve_daily_ledger (
  function_id text NOT NULL,
  snapshot_date date NOT NULL,
  account_id text,
  periodo_id text,
  entrada_dia numeric(14,2) DEFAULT 0 NOT NULL,
  saida_dia numeric(14,2) DEFAULT 0 NOT NULL,
  ajuste_dia numeric(14,2) DEFAULT 0 NOT NULL,
  saldo_acumulado numeric(14,2) DEFAULT 0 NOT NULL,
  saldo_atualizado numeric(14,2) DEFAULT 0 NOT NULL,
  saldo_real_conta numeric(14,2),
  fator_rateio numeric(12,8),
  divergencia numeric(14,2),
  divergencia_pct numeric(9,4),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT reserve_daily_ledger_pkey PRIMARY KEY (function_id, snapshot_date)
);

CREATE TABLE IF NOT EXISTS reserve_functions (
  id text NOT NULL,
  name text NOT NULL,
  account_id text,
  saldo_inicial numeric DEFAULT 0,
  entradas numeric DEFAULT 0,
  saidas numeric DEFAULT 0,
  despesa_anual numeric DEFAULT 0,
  deposito_mensal numeric DEFAULT 0,
  mes_vencimento text,
  ordem integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  entradas_override numeric,
  saidas_override numeric,
  ajuste_override jsonb,
  exibir_como_despesa boolean DEFAULT false NOT NULL,
  category_id text,
  CONSTRAINT reserve_functions_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS reserve_period_snapshots (
  id text NOT NULL,
  periodo_id text NOT NULL,
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  function_id text NOT NULL,
  function_name text NOT NULL,
  saldo_inicial numeric DEFAULT 0 NOT NULL,
  entradas numeric DEFAULT 0 NOT NULL,
  saidas numeric DEFAULT 0 NOT NULL,
  ajuste numeric DEFAULT 0 NOT NULL,
  saldo numeric DEFAULT 0 NOT NULL,
  saldo_atualizado numeric DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT reserve_period_snapshots_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS reserve_periods (
  id text NOT NULL,
  function_id text NOT NULL,
  data_inicio date NOT NULL,
  saldo_inicial numeric DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT reserve_periods_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS schedule_reserva_funcoes (
  id text DEFAULT (gen_random_uuid())::text NOT NULL,
  schedule_id text NOT NULL,
  reserva_funcao_id text,
  valor numeric(12,2) DEFAULT 0 NOT NULL,
  source_ids jsonb DEFAULT '[]'::jsonb,
  fatura_ref text,
  source_lancamento_id text,
  CONSTRAINT schedule_reserva_funcoes_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS senha_tokens (
  id text DEFAULT (gen_random_uuid())::text NOT NULL,
  usuario_id text NOT NULL,
  token_hash text NOT NULL,
  tipo text NOT NULL,
  expira_em timestamp with time zone NOT NULL,
  usado_em timestamp with time zone,
  criado_em timestamp with time zone DEFAULT now(),
  ip text,
  CONSTRAINT senha_tokens_tipo_check CHECK ((tipo = ANY (ARRAY['redefinir'::text, 'convite'::text]))),
  CONSTRAINT senha_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT senha_tokens_token_hash_key UNIQUE (token_hash)
);

CREATE TABLE IF NOT EXISTS tipos_documento (
  id text DEFAULT (gen_random_uuid())::text NOT NULL,
  nome text NOT NULL,
  sigla text NOT NULL,
  natureza text DEFAULT 'ambos'::text NOT NULL,
  cor text,
  ordem integer DEFAULT 0 NOT NULL,
  ativo boolean DEFAULT true NOT NULL,
  sistema boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT tipos_documento_natureza_check CHECK ((natureza = ANY (ARRAY['pagar'::text, 'receber'::text, 'ambos'::text]))),
  CONSTRAINT tipos_documento_sigla_check CHECK (((char_length(sigla) >= 1) AND (char_length(sigla) <= 4))),
  CONSTRAINT tipos_documento_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS usuarios (
  id text DEFAULT (gen_random_uuid())::text NOT NULL,
  username text NOT NULL,
  nome text NOT NULL,
  email text NOT NULL,
  senha_hash text NOT NULL,
  ativo boolean DEFAULT true,
  tentativas_falhas integer DEFAULT 0,
  bloqueado_ate timestamp with time zone,
  ultimo_login timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  nivel text DEFAULT 'consulta'::text NOT NULL,
  permissoes jsonb DEFAULT '{}'::jsonb,
  perfis_permitidos jsonb DEFAULT '"todos"'::jsonb,
  trocar_senha boolean DEFAULT false,
  criado_por text,
  CONSTRAINT usuarios_nivel_check CHECK ((nivel = ANY (ARRAY['admin'::text, 'operador'::text, 'consulta'::text, 'personalizado'::text]))),
  CONSTRAINT usuarios_username_check CHECK ((username = lower(username))),
  CONSTRAINT usuarios_pkey PRIMARY KEY (id),
  CONSTRAINT usuarios_username_key UNIQUE (username)
);

ALTER SEQUENCE account_mapping_id_seq OWNED BY account_mapping.id;
ALTER SEQUENCE atalhos_usuario_id_seq OWNED BY atalhos_usuario.id;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cartoes_id_fkey' AND conrelid = 'cartoes'::regclass) THEN
    ALTER TABLE cartoes ADD CONSTRAINT cartoes_id_fkey FOREIGN KEY (id) REFERENCES contas(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservas_movimentos_reserva_id_fkey' AND conrelid = 'reservas_movimentos'::regclass) THEN
    ALTER TABLE reservas_movimentos ADD CONSTRAINT reservas_movimentos_reserva_id_fkey FOREIGN KEY (reserva_id) REFERENCES reservas(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_financing_bem_id' AND conrelid = 'financing'::regclass) THEN
    ALTER TABLE financing ADD CONSTRAINT fk_financing_bem_id FOREIGN KEY (bem_id) REFERENCES contas(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_financing_conta_divida_id' AND conrelid = 'financing'::regclass) THEN
    ALTER TABLE financing ADD CONSTRAINT fk_financing_conta_divida_id FOREIGN KEY (conta_divida_id) REFERENCES contas(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_financing_installments_financing_id' AND conrelid = 'financing_installments'::regclass) THEN
    ALTER TABLE financing_installments ADD CONSTRAINT fk_financing_installments_financing_id FOREIGN KEY (financing_id) REFERENCES financing(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bem_movimentacoes_destino' AND conrelid = 'bem_movimentacoes'::regclass) THEN
    ALTER TABLE bem_movimentacoes ADD CONSTRAINT fk_bem_movimentacoes_destino FOREIGN KEY (bem_destino_id) REFERENCES contas(id) ON DELETE SET NULL;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bem_movimentacoes_origem' AND conrelid = 'bem_movimentacoes'::regclass) THEN
    ALTER TABLE bem_movimentacoes ADD CONSTRAINT fk_bem_movimentacoes_origem FOREIGN KEY (bem_origem_id) REFERENCES contas(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'membros_organizacao_id_fkey' AND conrelid = 'membros'::regclass) THEN
    ALTER TABLE membros ADD CONSTRAINT membros_organizacao_id_fkey FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'membros_usuario_id_fkey' AND conrelid = 'membros'::regclass) THEN
    ALTER TABLE membros ADD CONSTRAINT membros_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE;
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'senha_tokens_usuario_id_fkey' AND conrelid = 'senha_tokens'::regclass) THEN
    ALTER TABLE senha_tokens ADD CONSTRAINT senha_tokens_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_agendamentos_amount ON public.agendamentos USING btree (amount);
CREATE INDEX IF NOT EXISTS idx_agendamentos_tipo_documento ON public.agendamentos USING btree (tipo_documento_id);
CREATE INDEX IF NOT EXISTS idx_bem_mov_bem_id ON public.bem_movimentacoes USING btree (bem_id);
CREATE INDEX IF NOT EXISTS idx_bem_movimentacoes_bem_destino_id ON public.bem_movimentacoes USING btree (bem_destino_id);
CREATE INDEX IF NOT EXISTS idx_bem_movimentacoes_bem_origem_id ON public.bem_movimentacoes USING btree (bem_origem_id);
CREATE INDEX IF NOT EXISTS idx_bem_movimentacoes_data_movimentacao ON public.bem_movimentacoes USING btree (data_movimentacao);
CREATE INDEX IF NOT EXISTS idx_fin_inst_financing ON public.financing_installments USING btree (financing_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_financing_bem_active ON public.financing USING btree (bem_id) WHERE (status = ANY (ARRAY['open'::text, 'partial'::text]));
CREATE INDEX IF NOT EXISTS idx_financing_bem_id ON public.financing USING btree (bem_id);
CREATE INDEX IF NOT EXISTS idx_financing_created_at ON public.financing USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_financing_installments_data_vencimento ON public.financing_installments USING btree (data_vencimento);
CREATE INDEX IF NOT EXISTS idx_financing_installments_financing_id ON public.financing_installments USING btree (financing_id);
CREATE INDEX IF NOT EXISTS idx_financing_installments_status ON public.financing_installments USING btree (status);
CREATE INDEX IF NOT EXISTS idx_financing_status ON public.financing USING btree (status);
CREATE INDEX IF NOT EXISTS idx_fluxo_provisorios_account ON public.fluxo_provisorios USING btree (account_id);
CREATE INDEX IF NOT EXISTS idx_fluxo_provisorios_date ON public.fluxo_provisorios USING btree (date);
CREATE INDEX IF NOT EXISTS idx_historico_entidade ON public.historico_alteracoes USING btree (entidade, entidade_id);
CREATE INDEX IF NOT EXISTS idx_historico_lote ON public.historico_alteracoes USING btree (lote_id);
CREATE INDEX IF NOT EXISTS idx_historico_serie ON public.historico_alteracoes USING btree (serie_key);
CREATE INDEX IF NOT EXISTS idx_lancamentos_amount ON public.lancamentos USING btree (amount);
CREATE INDEX IF NOT EXISTS idx_lancamentos_bem_id ON public.lancamentos USING btree (bem_id) WHERE (bem_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_lancamentos_serie_id ON public.lancamentos USING btree (serie_id) WHERE (serie_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_lancamentos_tipo_documento ON public.lancamentos USING btree (tipo_documento_id);
CREATE INDEX IF NOT EXISTS idx_marcos_saldo_gerencial_conta ON public.marcos_saldo_gerencial USING btree (conta_id, data);
CREATE INDEX IF NOT EXISTS idx_membros_organizacao ON public.membros USING btree (organizacao_id);
CREATE INDEX IF NOT EXISTS idx_pendencias_integridade_status ON public.pendencias_integridade USING btree (status);
CREATE INDEX IF NOT EXISTS idx_rateios_lancamento ON public.lancamento_rateios USING btree (lancamento_id);
CREATE INDEX IF NOT EXISTS idx_reserve_adjustments_function ON public.reserve_adjustments USING btree (function_id);
CREATE INDEX IF NOT EXISTS idx_reserve_ledger_account ON public.reserve_daily_ledger USING btree (account_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_reserve_ledger_date ON public.reserve_daily_ledger USING btree (snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_reserve_periods_function ON public.reserve_periods USING btree (function_id);
CREATE INDEX IF NOT EXISTS idx_reserve_snapshots_data ON public.reserve_period_snapshots USING btree (data_fim DESC);
CREATE INDEX IF NOT EXISTS idx_reserve_snapshots_function ON public.reserve_period_snapshots USING btree (function_id);
CREATE INDEX IF NOT EXISTS idx_senha_tokens_usuario ON public.senha_tokens USING btree (usuario_id) WHERE (usado_em IS NULL);
CREATE INDEX IF NOT EXISTS idx_srf_schedule ON public.schedule_reserva_funcoes USING btree (schedule_id);
CREATE INDEX IF NOT EXISTS idx_srf_source_lancamento ON public.schedule_reserva_funcoes USING btree (source_lancamento_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_contas_central_por_perfil ON public.contas USING btree (profile_id) WHERE conta_corrente_principal;
CREATE UNIQUE INDEX IF NOT EXISTS uq_contas_favorita_por_perfil ON public.contas USING btree (COALESCE(profile_id, ''::text)) WHERE is_main;
CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_inst_numero ON public.financing_installments USING btree (financing_id, numero_parcela);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lancamentos_installment ON public.lancamentos USING btree (installment_key) WHERE (installment_key IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_email ON public.usuarios USING btree (lower(email));
