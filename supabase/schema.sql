-- ============================================================
-- Financeiro App — Schema Supabase
-- Execute no Supabase Dashboard → SQL Editor
-- ============================================================

-- Configurações gerais do app (linha única)
CREATE TABLE IF NOT EXISTS configuracoes (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  financial_month_start_day INTEGER DEFAULT 1,
  currency TEXT DEFAULT 'BRL',
  cost_centers JSONB DEFAULT '["Pessoal","Família","Trabalho","Casa"]',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE configuracoes DISABLE ROW LEVEL SECURITY;
INSERT INTO configuracoes (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE configuracoes ADD COLUMN IF NOT EXISTS recurring_match_exceptions JSONB DEFAULT '[]';

-- Categorias de transações
CREATE TABLE IF NOT EXISTS categorias (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  color TEXT,
  icon TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE categorias DISABLE ROW LEVEL SECURITY;

-- Favorecidos / Payees
CREATE TABLE IF NOT EXISTS favorecidos (
  name TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE favorecidos DISABLE ROW LEVEL SECURITY;

-- Regras de classificação automática
CREATE TABLE IF NOT EXISTS regras_classificacao (
  id TEXT PRIMARY KEY,
  contains TEXT NOT NULL,
  category_id TEXT,
  payee TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE regras_classificacao DISABLE ROW LEVEL SECURITY;

-- Grupos Gerenciais (Reservas — Funções)
CREATE TABLE IF NOT EXISTS reservas_funcoes (
  id TEXT PRIMARY KEY,
  number JSONB NOT NULL,
  name TEXT NOT NULL,
  alias TEXT,
  fixed BOOLEAN DEFAULT FALSE,
  default_account_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE reservas_funcoes DISABLE ROW LEVEL SECURITY;

-- Contas bancárias (todas, inclusive cartões de crédito)
CREATE TABLE IF NOT EXISTS contas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  apelido TEXT,
  type TEXT NOT NULL,
  bank TEXT,
  balance NUMERIC DEFAULT 0,
  credit_limit NUMERIC,
  credit_debt NUMERIC DEFAULT 0,
  credit_month_bill NUMERIC DEFAULT 0,
  closing_day INTEGER,
  due_day INTEGER,
  is_main BOOLEAN DEFAULT FALSE,
  fluxo_caixa_principal BOOLEAN DEFAULT FALSE,
  conta_corrente_principal BOOLEAN DEFAULT FALSE,
  grupo_gerencial TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE contas DISABLE ROW LEVEL SECURITY;

-- Cartões de crédito (tabela auxiliar — estende contas)
CREATE TABLE IF NOT EXISTS cartoes (
  id TEXT PRIMARY KEY REFERENCES contas(id) ON DELETE CASCADE,
  credit_limit NUMERIC DEFAULT 0,
  credit_debt NUMERIC DEFAULT 0,
  closing_day INTEGER,
  due_day INTEGER,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE cartoes DISABLE ROW LEVEL SECURITY;

-- Lançamentos / Transações
CREATE TABLE IF NOT EXISTS lancamentos (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  account_id TEXT,
  to_account_id TEXT,
  from_account_id TEXT,
  amount NUMERIC NOT NULL,
  date TEXT NOT NULL,
  description TEXT,
  category_id TEXT,
  payee TEXT,
  cost_center TEXT,
  notes TEXT,
  grupo_gerencial TEXT,
  account_type TEXT,
  schedule_id TEXT,
  reconciled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE lancamentos DISABLE ROW LEVEL SECURITY;

-- Agendamentos / Recorrências
CREATE TABLE IF NOT EXISTS agendamentos (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  transaction_type TEXT NOT NULL,
  account_id TEXT,
  to_account_id TEXT,
  amount NUMERIC NOT NULL,
  category_id TEXT,
  payee TEXT,
  cost_center TEXT,
  account_type TEXT,
  frequency TEXT NOT NULL,
  start_date TEXT NOT NULL,
  occurrence_type TEXT DEFAULT 'continuous',
  installments INTEGER,
  registered JSONB DEFAULT '[]',
  skipped JSONB DEFAULT '[]',
  remind_days_before INTEGER DEFAULT 3,
  auto_register BOOLEAN DEFAULT TRUE,
  overrides JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE agendamentos DISABLE ROW LEVEL SECURITY;

-- Migração: adiciona colunas novas caso a tabela já exista
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS remind_days_before INTEGER DEFAULT 3;
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS auto_register BOOLEAN DEFAULT TRUE;
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS overrides JSONB DEFAULT '{}';
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS grupo_gerencial TEXT;
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS category_group TEXT;

-- Plano de contas completo (subcategorias agrupadas)
INSERT INTO categorias (id, name, type, color, icon, category_group) VALUES
  ('cat_ali_sup','Supermercado','expense','#f97316','🏪','Alimentação'),
  ('cat_ali_ref','Refeições Fora','expense','#f97316','🍽️','Alimentação'),
  ('cat_ali_pad','Padaria','expense','#f97316','🥐','Alimentação'),
  ('cat_ali_del','Delivery','expense','#f97316','📦','Alimentação'),
  ('cat_tra_com','Combustível','expense','#3b82f6','⛽','Transporte'),
  ('cat_tra_est','Estacionamento','expense','#3b82f6','🅿️','Transporte'),
  ('cat_tra_ped','Pedágio','expense','#3b82f6','🛣️','Transporte'),
  ('cat_tra_pub','Transporte Público','expense','#3b82f6','🚌','Transporte'),
  ('cat_tra_man','Manutenção Veículo','expense','#3b82f6','🔧','Transporte'),
  ('cat_mor_alg','Aluguel','expense','#8b5cf6','🏠','Moradia'),
  ('cat_mor_cdn','Condomínio','expense','#8b5cf6','🏢','Moradia'),
  ('cat_mor_ipt','IPTU','expense','#8b5cf6','📋','Moradia'),
  ('cat_mor_agu','Água','expense','#8b5cf6','💧','Moradia'),
  ('cat_mor_luz','Luz','expense','#8b5cf6','⚡','Moradia'),
  ('cat_mor_gas','Gás','expense','#8b5cf6','🔥','Moradia'),
  ('cat_mor_int','Internet','expense','#8b5cf6','📡','Moradia'),
  ('cat_mor_tel','Telefone','expense','#8b5cf6','📱','Moradia'),
  ('cat_sau_far','Farmácia','expense','#ef4444','💊','Saúde'),
  ('cat_sau_med','Consulta Médica','expense','#ef4444','🩺','Saúde'),
  ('cat_sau_pls','Plano de Saúde','expense','#ef4444','🏥','Saúde'),
  ('cat_sau_exa','Exames','expense','#ef4444','🔬','Saúde'),
  ('cat_sau_aca','Academia','expense','#ef4444','💪','Saúde'),
  ('cat_edu_esc','Escola','expense','#84cc16','🏫','Educação'),
  ('cat_edu_fac','Faculdade','expense','#84cc16','🎓','Educação'),
  ('cat_edu_cur','Curso','expense','#84cc16','📝','Educação'),
  ('cat_edu_liv','Livros','expense','#84cc16','📚','Educação'),
  ('cat_laz_str','Streaming','expense','#06b6d4','📺','Lazer'),
  ('cat_laz_cin','Cinema','expense','#06b6d4','🎬','Lazer'),
  ('cat_laz_via','Viagem','expense','#06b6d4','✈️','Lazer'),
  ('cat_laz_res','Restaurante','expense','#06b6d4','🍴','Lazer'),
  ('cat_laz_ass','Assinaturas','expense','#06b6d4','🔖','Lazer'),
  ('cat_ves_rou','Roupas','expense','#ec4899','👗','Vestuário'),
  ('cat_ves_cal','Calçados','expense','#ec4899','👟','Vestuário'),
  ('cat_ves_ace','Acessórios','expense','#ec4899','💍','Vestuário'),
  ('cat_imp_ipv','IPVA','expense','#6b7280','🚘','Impostos'),
  ('cat_imp_ir','IR','expense','#6b7280','📊','Impostos'),
  ('cat_imp_tax','Taxas','expense','#6b7280','💸','Impostos'),
  ('cat_seg_aut','Seguro Auto','expense','#14b8a6','🛡️','Seguros'),
  ('cat_seg_vid','Seguro Vida','expense','#14b8a6','💙','Seguros'),
  ('cat_seg_res','Seguro Residencial','expense','#14b8a6','🏡','Seguros'),
  ('cat_ban_tar','Tarifas','expense','#f59e0b','💳','Bancos'),
  ('cat_ban_jur','Juros','expense','#f59e0b','💸','Bancos'),
  ('cat_ban_fin','Financiamento','expense','#f59e0b','🏦','Bancos'),
  ('cat_out_pre','Presentes','expense','#78716c','🎁','Outras Despesas'),
  ('cat_out_doa','Doações','expense','#78716c','🤝','Outras Despesas'),
  ('cat_out_div','Despesas Diversas','expense','#78716c','📌','Outras Despesas'),
  ('cat_rem_sal','Salário','income','#22c55e','💰','Remunerações'),
  ('cat_rem_fer','Férias','income','#22c55e','🌴','Remunerações'),
  ('cat_rem_13','13º Salário','income','#22c55e','🎄','Remunerações'),
  ('cat_rem_bon','Bônus','income','#22c55e','🎯','Remunerações'),
  ('cat_rem_com','Comissão','income','#22c55e','💼','Remunerações'),
  ('cat_ren_jur','Juros Recebidos','income','#10b981','💹','Rendimentos'),
  ('cat_ren_div','Dividendos','income','#10b981','📈','Rendimentos'),
  ('cat_ren_alg','Aluguel Recebido','income','#10b981','🏘️','Rendimentos'),
  ('cat_ore_rei','Reembolsos','income','#6366f1','💵','Outras Receitas'),
  ('cat_ore_ven','Vendas','income','#6366f1','🏷️','Outras Receitas'),
  ('cat_ore_fgt','FGTS','income','#6366f1','🏛️','Outras Receitas'),
  ('cat_ore_pis','PIS / PASEP','income','#6366f1','📋','Outras Receitas')
ON CONFLICT (id) DO NOTHING;

-- Orçamentos
CREATE TABLE IF NOT EXISTS orcamento (
  id TEXT PRIMARY KEY,
  category_id TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  period TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE orcamento DISABLE ROW LEVEL SECURITY;

-- Reservas / Contas a Pagar Gerencial
CREATE TABLE IF NOT EXISTS reservas (
  id TEXT PRIMARY KEY,
  cartao_id TEXT,
  mes_ano TEXT,
  grupo_gerencial_id TEXT,
  origin TEXT,
  description TEXT,
  amount NUMERIC DEFAULT 0,
  due_date TEXT,
  status TEXT DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  bill_start TEXT,
  bill_end TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE reservas DISABLE ROW LEVEL SECURITY;

-- Grupos de Contas (agrupadores visuais)
CREATE TABLE IF NOT EXISTS grupos_conta (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'financeiro',
  "order" INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE grupos_conta DISABLE ROW LEVEL SECURITY;

-- Colunas de grupo e ordem nas contas (migração)
ALTER TABLE contas ADD COLUMN IF NOT EXISTS account_group_id TEXT;
ALTER TABLE contas ADD COLUMN IF NOT EXISTS "order" INTEGER DEFAULT 0;
ALTER TABLE contas ADD COLUMN IF NOT EXISTS debt_plan JSONB;

-- Comportamento especial de grupos de contas (dívida / empréstimo)
ALTER TABLE grupos_conta ADD COLUMN IF NOT EXISTS behavior TEXT;

-- Metadados de parcelas em reservas (migração)
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS installment_number INTEGER;
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS total_installments INTEGER;

-- Envelopes de Controle Mensal
CREATE TABLE IF NOT EXISTS envelopes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  limit_amount NUMERIC NOT NULL DEFAULT 0,
  due_day INTEGER NOT NULL DEFAULT 1,
  category_ids JSONB NOT NULL DEFAULT '[]',
  account_id TEXT,
  history JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE envelopes DISABLE ROW LEVEL SECURITY;

-- Movimentos de Reservas (pagamentos/resgates vinculados)
CREATE TABLE IF NOT EXISTS reservas_movimentos (
  id TEXT PRIMARY KEY,
  reserva_id TEXT REFERENCES reservas(id) ON DELETE CASCADE,
  lancamento_id TEXT,
  type TEXT DEFAULT 'payment',
  amount NUMERIC DEFAULT 0,
  date TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE reservas_movimentos DISABLE ROW LEVEL SECURITY;

-- Perfis CPF / CNPJ
CREATE TABLE IF NOT EXISTS perfis (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'pf',
  document TEXT,
  color TEXT DEFAULT '#6366f1',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE perfis DISABLE ROW LEVEL SECURITY;

-- Vínculo de conta com perfil
ALTER TABLE contas ADD COLUMN IF NOT EXISTS profile_id TEXT;

-- Campos patrimoniais de contas
ALTER TABLE contas ADD COLUMN IF NOT EXISTS acquisition_value NUMERIC;
ALTER TABLE contas ADD COLUMN IF NOT EXISTS acquisition_date TEXT;
ALTER TABLE contas ADD COLUMN IF NOT EXISTS value_history JSONB DEFAULT '[]';

-- Campos de Reserva nas contas
ALTER TABLE contas ADD COLUMN IF NOT EXISTS is_reserva BOOLEAN DEFAULT FALSE;
ALTER TABLE contas ADD COLUMN IF NOT EXISTS reserva_type TEXT;
ALTER TABLE contas ADD COLUMN IF NOT EXISTS reserva_category_id TEXT;

-- Categoria: Reservas Gerais
INSERT INTO categorias (id, name, type, color, icon) VALUES
  ('cat_res_ger', 'Reservas Gerais', 'expense', '#6b7280', '🏦')
ON CONFLICT (id) DO NOTHING;

-- Flag para lançamentos automáticos de reserva (não exibidos no extrato normal)
ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS reserva_auto BOOLEAN DEFAULT FALSE;

-- Categoria de despesa para transferências agendadas a reservas (tipo geral)
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS reserva_expense_category_id TEXT;

-- Campo de ocorrências puladas (adicionado junto com a funcionalidade de Pular)
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS skipped JSONB DEFAULT '[]';
