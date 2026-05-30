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
ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS origin TEXT DEFAULT 'manual';

-- Categoria de despesa para transferências agendadas a reservas (tipo geral)
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS reserva_expense_category_id TEXT;

-- Campo de ocorrências puladas (adicionado junto com a funcionalidade de Pular)
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS skipped JSONB DEFAULT '[]';

-- Plano de contas completo v2 (novas categorias — ON CONFLICT DO NOTHING preserva existentes)
INSERT INTO categorias (id, name, type, color, icon, category_group) VALUES
  -- Alimentação
  ('cat_ali_acu','Açougue','expense','#0ea5e9','🥩','Alimentação'),
  ('cat_ali_fei','Feira','expense','#0ea5e9','🛒','Alimentação'),
  -- Bancos
  ('cat_ban_anu','Anuidade do Cartão','expense','#f97316','💳','Bancos'),
  ('cat_ban_emf','Empréstimos/Financiamentos','expense','#f97316','🏦','Bancos'),
  ('cat_ban_jum','Juros/Multas','expense','#f97316','💸','Bancos'),
  ('cat_ban_mac','Manutenção da Conta','expense','#f97316','💳','Bancos'),
  ('cat_ban_rti','Rendimento(-) TESOURO IPCA','expense','#f97316','📉','Bancos'),
  ('cat_ban_tcb','Taxa de custódia da BM&F Bovespa','expense','#f97316','💹','Bancos'),
  -- Contribuicoes
  ('cat_con_mov','Movimentos','expense','#ef4444','🔄','Contribuicoes'),
  -- Cuidados Pessoais
  ('cat_cup_aca','Academia','expense','#eab308','💪','Cuidados Pessoais'),
  ('cat_cup_cos','Cosmeticos','expense','#eab308','💄','Cuidados Pessoais'),
  ('cat_cup_dro','Drogaria','expense','#eab308','💊','Cuidados Pessoais'),
  ('cat_cup_pre','Presentes','expense','#eab308','🎁','Cuidados Pessoais'),
  ('cat_cup_sal','Salão','expense','#eab308','✂️','Cuidados Pessoais'),
  ('cat_cup_ves','Vestuário','expense','#eab308','👗','Cuidados Pessoais'),
  -- Doações
  ('cat_doa_igr','Igreja','expense','#22c55e','⛪','Doações'),
  ('cat_doa_ins','Instituições de Caridade','expense','#22c55e','🤝','Doações'),
  ('cat_doa_par','Particulares','expense','#22c55e','👥','Doações'),
  -- Educação
  ('cat_edu_col','Colégio','expense','#0ea5e9','🏫','Educação'),
  ('cat_edu_mat','Material de Estudo','expense','#0ea5e9','📖','Educação'),
  -- Empresa
  ('cat_emp_ass','Assinaturas','expense','#f97316','📋','Empresa'),
  ('cat_emp_est','Estoques','expense','#f97316','📦','Empresa'),
  -- Escritorio Contabilidade
  ('cat_esc_hon','Honorarios Emerson/Piratininga','expense','#ef4444','👨‍💼','Escritorio Contabilidade'),
  ('cat_esc_mda','Multas Darf','expense','#ef4444','📝','Escritorio Contabilidade'),
  ('cat_esc_sof','Software','expense','#ef4444','💻','Escritorio Contabilidade'),
  ('cat_esc_tax','Taxas','expense','#ef4444','💸','Escritorio Contabilidade'),
  -- Filhos
  ('cat_fil_abe','Acessorios Bebe','expense','#eab308','👶','Filhos'),
  ('cat_fil_ani','Aniversario','expense','#eab308','🎂','Filhos'),
  ('cat_fil_chb','Cha de Bebe','expense','#eab308','🍼','Filhos'),
  ('cat_fil_cdi','Cursos Diversos','expense','#eab308','📚','Filhos'),
  ('cat_fil_fra','Fralda','expense','#eab308','👶','Filhos'),
  ('cat_fil_lan','Lanche','expense','#eab308','🍎','Filhos'),
  ('cat_fil_mes','Material Escolar','expense','#eab308','📐','Filhos'),
  ('cat_fil_men','Mensalidade Escolar','expense','#eab308','🏫','Filhos'),
  ('cat_fil_msa','Mesada','expense','#eab308','💰','Filhos'),
  ('cat_fil_tes','Transporte Escolar','expense','#eab308','🚌','Filhos'),
  ('cat_fil_uni','Uniforme','expense','#eab308','👕','Filhos'),
  ('cat_fil_vac','Vacinas','expense','#eab308','💉','Filhos'),
  ('cat_fil_ves','Vestuário Filho','expense','#eab308','👕','Filhos'),
  -- Finaciamentos
  ('cat_finc_cap','CAPITAL','expense','#22c55e','🏢','Finaciamentos'),
  -- Impostos
  ('cat_imp_dsm','DASMEI','expense','#0ea5e9','📋','Impostos'),
  ('cat_imp_imb','IMPOSTO BOLSA','expense','#0ea5e9','📈','Impostos'),
  ('cat_imp_iof','IOF','expense','#0ea5e9','💸','Impostos'),
  ('cat_imp_ipt','IPTU','expense','#0ea5e9','🏠','Impostos'),
  ('cat_imp_ira','IRPF Ajuste','expense','#0ea5e9','📊','Impostos'),
  ('cat_imp_irr','IRRF','expense','#0ea5e9','💰','Impostos'),
  ('cat_imp_iri','IRRF IPCA','expense','#0ea5e9','💹','Impostos'),
  ('cat_imp_itc','ITCMD','expense','#0ea5e9','📋','Impostos'),
  ('cat_imp_ins','Inss','expense','#0ea5e9','🏛️','Impostos'),
  ('cat_imp_lic','Licenciamento dpvat','expense','#0ea5e9','🚗','Impostos'),
  ('cat_imp_pas','Passaporte','expense','#0ea5e9','🛂','Impostos'),
  ('cat_imp_cnh','Renovacao CNH','expense','#0ea5e9','🪪','Impostos'),
  ('cat_imp_sna','SIMPLES NACIONAL','expense','#0ea5e9','📋','Impostos'),
  ('cat_imp_tts','Taxa Semestral Tesouro selic','expense','#0ea5e9','📈','Impostos'),
  -- Lazer
  ('cat_laz_ace','Acessórios Esportivos','expense','#f97316','🏃','Lazer'),
  ('cat_laz_arm','Armarinhos/linhas','expense','#f97316','🧵','Lazer'),
  ('cat_laz_clu','Clube','expense','#f97316','🏊','Lazer'),
  ('cat_laz_cam','Confraternizacao Amigos','expense','#f97316','🍻','Lazer'),
  ('cat_laz_cfe','Confraternizacao Ferias','expense','#f97316','🏖️','Lazer'),
  ('cat_laz_ele','Eletrônicos','expense','#f97316','📱','Lazer'),
  ('cat_laz_lsw','Licenca Software','expense','#f97316','💻','Lazer'),
  ('cat_laz_liv','Livros/Revistas','expense','#f97316','📚','Lazer'),
  ('cat_laz_loc','Locadora de Filmes/Games','expense','#f97316','🎮','Lazer'),
  ('cat_laz_pas','Passeios','expense','#f97316','🌳','Lazer'),
  ('cat_laz_ssa','Streaming/assinaturas','expense','#f97316','📺','Lazer'),
  ('cat_laz_vgm','Viagens','expense','#f97316','✈️','Lazer'),
  -- Moradia
  ('cat_mor_edt','Eletrodomésticos','expense','#ef4444','🧊','Moradia'),
  ('cat_mor_lav','Lavanderia','expense','#ef4444','👔','Moradia'),
  ('cat_mor_mob','Mobiliário','expense','#ef4444','🛋️','Moradia'),
  ('cat_mor_obr','Obra/Manutenção','expense','#ef4444','🔧','Moradia'),
  ('cat_mor_pim','Prestação do Imóvel','expense','#ef4444','🏠','Moradia'),
  ('cat_mor_ser','Serviços Domésticos','expense','#ef4444','🧹','Moradia'),
  ('cat_mor_tce','Telefone Celular','expense','#ef4444','📱','Moradia'),
  ('cat_mor_tfi','Telefone Fixo','expense','#ef4444','☎️','Moradia'),
  ('cat_mor_tvs','Tv por Assinatura','expense','#ef4444','📺','Moradia'),
  -- Saúde
  ('cat_sau_con','Consultas','expense','#0ea5e9','🩺','Saúde'),
  ('cat_sau_den','Dentista','expense','#0ea5e9','🦷','Saúde'),
  ('cat_sau_hos','Hospital','expense','#0ea5e9','🏥','Saúde'),
  ('cat_sau_rem','Remédios','expense','#0ea5e9','💊','Saúde'),
  ('cat_sau_tra','Tratamentos','expense','#0ea5e9','⚕️','Saúde'),
  ('cat_sau_tgi','Tratamentos Gi','expense','#0ea5e9','⚕️','Saúde'),
  -- Seguro (novo grupo, distinto de "Seguros")
  ('cat_sgr_sau','Seguro Saúde','expense','#f97316','❤️','Seguro'),
  ('cat_sgr_cas','Seguro da Casa','expense','#f97316','🏡','Seguro'),
  ('cat_sgr_vda','Seguro de Vida','expense','#f97316','💙','Seguro'),
  ('cat_sgr_aut','Seguro do Automóvel','expense','#f97316','🚗','Seguro'),
  -- Transporte
  ('cat_tra_des','Despachante','expense','#ef4444','📋','Transporte'),
  ('cat_tra_frs','Franquia Seguro','expense','#ef4444','🛡️','Transporte'),
  ('cat_tra_lav','Lavajato','expense','#ef4444','🚿','Transporte'),
  ('cat_tra_loc','Locacao Veiculo','expense','#ef4444','🚗','Transporte'),
  ('cat_tra_mre','Manutenção/Revisão','expense','#ef4444','🔧','Transporte'),
  ('cat_tra_met','Metrô','expense','#ef4444','🚇','Transporte'),
  ('cat_tra_mul','Multas','expense','#ef4444','🚨','Transporte'),
  ('cat_tra_pre','Prestação do Automóvel','expense','#ef4444','🚗','Transporte'),
  ('cat_tra_tax','Táxi','expense','#ef4444','🚕','Transporte'),
  ('cat_tra_oni','Ônibus','expense','#ef4444','🚌','Transporte'),
  -- Fotografia
  ('cat_fot_fot','Fotógrafo','expense','#8b5cf6','📷','Fotografia'),
  ('cat_fot_equ','Equipamentos Fotografia','expense','#8b5cf6','📸','Fotografia'),
  ('cat_fot_ace','Acessórios Fotografia','expense','#8b5cf6','🔭','Fotografia'),
  ('cat_fot_rev','Revelação/Impressão','expense','#8b5cf6','🖨️','Fotografia'),
  ('cat_fot_edi','Edição/Software Foto','expense','#8b5cf6','💻','Fotografia'),
  -- Remunerações
  ('cat_rem_alg','Aluguel','income','#f97316','🏘️','Remunerações'),
  ('cat_rem_dlc','Distribuicao de Lucros','income','#f97316','💼','Remunerações'),
  ('cat_rem_hoc','Honorarios Contabeis','income','#f97316','📋','Remunerações'),
  ('cat_rem_pen','Pensão','income','#f97316','👴','Remunerações'),
  ('cat_rem_pre','Presentes Recebidos','income','#f97316','🎁','Remunerações'),
  ('cat_rem_rpo','Receitas Pontua','income','#f97316','⭐','Remunerações'),
  ('cat_rem_rsm','Receitas Social Midia','income','#f97316','📱','Remunerações'),
  ('cat_rem_sgi','Salário GI','income','#f97316','💰','Remunerações'),
  ('cat_rem_tex','Trabalhos Extras','income','#f97316','🔨','Remunerações'),
  ('cat_rem_tgi','Trabalhos Extras GI','income','#f97316','🔨','Remunerações'),
  ('cat_rem_val','Vale Alimentacao','income','#f97316','🍽️','Remunerações'),
  -- Rendimentos
  ('cat_ren_jin','Juros Investimentos','income','#ef4444','💹','Rendimentos'),
  ('cat_ren_jii','Juros Investimentos IPCA','income','#ef4444','💹','Rendimentos'),
  ('cat_ren_jpo','Juros Poupança','income','#ef4444','🏦','Rendimentos'),
  ('cat_ren_jpp','Juros Previdência Privada','income','#ef4444','🛡️','Rendimentos'),
  ('cat_ren_jrs','Juros Rendimento Salario','income','#ef4444','💵','Rendimentos'),
  ('cat_ren_jtp','Juros sob TITULO PUBLICO','income','#ef4444','📜','Rendimentos'),
  ('cat_ren_jca','Juros sob capital','income','#ef4444','💵','Rendimentos'),
  -- Rendimentos Empresariais
  ('cat_ren_emp','Comissão Sobre Vendas','income','#eab308','💼','Rendimentos Empresariais'),
  -- Outras Receitas
  ('cat_ore_aju','ACAO JUSTICA','income','#0ea5e9','⚖️','Outras Receitas'),
  ('cat_ore_agi','Agio em Acoes','income','#0ea5e9','📈','Outras Receitas'),
  ('cat_ore_ajm','Ajuste - imobilizado','income','#0ea5e9','🔄','Outras Receitas'),
  ('cat_ore_anr','Aniversario Reembolso','income','#0ea5e9','🎂','Outras Receitas'),
  ('cat_ore_dns','Desconto Nubank - antecipacao','income','#0ea5e9','💜','Outras Receitas'),
  ('cat_ore_doa','Doacao','income','#0ea5e9','🤲','Outras Receitas'),
  ('cat_ore_emr','Empréstimos Recebidos','income','#0ea5e9','💲','Outras Receitas'),
  ('cat_ore_eta','Estorno de Anuidade','income','#0ea5e9','↩️','Outras Receitas'),
  ('cat_ore_mel','Meliuz','income','#0ea5e9','💰','Outras Receitas'),
  ('cat_ore_rir','Restituicao IR','income','#0ea5e9','🏦','Outras Receitas'),
  ('cat_ore_vab','Valorização de Bens','income','#0ea5e9','📊','Outras Receitas'),
  ('cat_ore_vdb','Venda de Bens','income','#0ea5e9','🏷️','Outras Receitas'),
  -- Aplicações (Investimentos)
  ('cat_apl_aco','Ações','expense','#22c55e','📈','Aplicações'),
  ('cat_apl_cso','Cotas em Sociedade','expense','#22c55e','🤝','Aplicações'),
  ('cat_apl_fdi','Fundos de Investimento','expense','#22c55e','💼','Aplicações'),
  ('cat_apl_ppv','Previdência Privada','expense','#22c55e','🛡️','Aplicações'),
  ('cat_apl_ted','Tesouro Direto','expense','#22c55e','🏛️','Aplicações')
ON CONFLICT (id) DO NOTHING;
