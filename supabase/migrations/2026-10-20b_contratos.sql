-- ============================================================
-- MÓDULO DE CONTRATOS — Entrega 1 (cadastro, parcelas, reajuste e vínculo).
-- As parcelas NÃO têm tabela própria: são agendamentos 'once' com contrato_id + contrato_papel
-- (ids ctr_<contrato>_<papel>_<AAAAMM>). Tabelas do módulo ficam FORA do /api/sync genérico
-- (rotas api/contrato*.js). Datas em TEXT 'AAAA-MM-DD', como lancamentos.date.
-- Idempotente; num banco sem agendamentos/lancamentos (bancos de teste das migrações) só cria as
-- tabelas do módulo.
-- ============================================================

CREATE TABLE IF NOT EXISTS contratos (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  perfil_id TEXT,
  tipo TEXT NOT NULL CHECK (tipo IN ('pagar','receber')),
  modalidade TEXT NOT NULL DEFAULT 'aluguel' CHECK (modalidade IN ('aluguel','servico','outro')),
  numero TEXT,
  objeto TEXT,
  favorecido TEXT,
  favorecido_condominio TEXT,
  data_inicio TEXT NOT NULL CHECK (data_inicio ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  data_fim TEXT CHECK (data_fim IS NULL OR data_fim ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  renovacao_automatica BOOLEAN NOT NULL DEFAULT false,
  aviso_previo_dias INT NOT NULL DEFAULT 30,
  valor_base NUMERIC(14,2) NOT NULL DEFAULT 0,
  periodicidade TEXT NOT NULL DEFAULT 'mensal' CHECK (periodicidade IN ('mensal','trimestral','semestral','anual','unica')),
  dia_vencimento INT CHECK (dia_vencimento BETWEEN 1 AND 31),
  dia_vencimento_condominio INT CHECK (dia_vencimento_condominio BETWEEN 1 AND 31),
  categoria_id TEXT,
  categoria_condominio_id TEXT,
  conta_id TEXT,
  centro_custo TEXT,
  tipo_documento_id TEXT,
  indice_reajuste TEXT NOT NULL DEFAULT 'IPCA' CHECK (indice_reajuste IN ('IPCA','IGPM','FIXO','NENHUM')),
  percentual_fixo NUMERIC(9,4),
  mes_base_reajuste INT CHECK (mes_base_reajuste BETWEEN 1 AND 12),
  proximo_reajuste TEXT CHECK (proximo_reajuste IS NULL OR proximo_reajuste ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  bonificacao_valor NUMERIC(14,2) NOT NULL DEFAULT 0,
  bonificacao_meses INT NOT NULL DEFAULT 0,
  tipo_imovel TEXT CHECK (tipo_imovel IN ('casa','apartamento','sala','galpao','outro')),
  tem_condominio BOOLEAN NOT NULL DEFAULT false,
  valor_condominio_previsto NUMERIC(14,2),
  link_anexo TEXT,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','encerrado','rescindido','suspenso')),
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contratos_perfil_status_idx ON contratos (perfil_id, status);

CREATE TABLE IF NOT EXISTS contrato_itens (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  contrato_id TEXT NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  grupo TEXT NOT NULL DEFAULT 'outro' CHECK (grupo IN ('condominio','iptu','seguro','outro')),
  responsavel TEXT NOT NULL DEFAULT 'inquilino' CHECK (responsavel IN ('inquilino','proprietario')),
  valor_previsto NUMERIC(14,2),
  categoria_id TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX IF NOT EXISTS contrato_itens_contrato_idx ON contrato_itens (contrato_id);

CREATE TABLE IF NOT EXISTS contrato_eventos (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  contrato_id TEXT NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('criacao','reajuste','confirmacao_valor','aditivo','renovacao',
    'rescisao','suspensao','vinculo','desvinculo','edicao_parcela')),
  data_evento TEXT NOT NULL CHECK (data_evento ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  indice TEXT,
  percentual NUMERIC(9,4),
  valor_anterior NUMERIC(14,2),
  valor_novo NUMERIC(14,2),
  detalhes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contrato_eventos_contrato_idx ON contrato_eventos (contrato_id, data_evento);

CREATE TABLE IF NOT EXISTS indices_cache (
  indice TEXT NOT NULL CHECK (indice IN ('IPCA','IGPM')),
  competencia TEXT NOT NULL CHECK (competencia ~ '^[0-9]{4}-[0-9]{2}$'),
  valor_mensal NUMERIC(9,4) NOT NULL,
  acumulado_12m NUMERIC(9,4),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (indice, competencia)
);

-- Sem FK em agendamentos/lancamentos: o sync por diferença pode gravar a parcela antes da ficha.
DO $$
BEGIN
  IF to_regclass('agendamentos') IS NOT NULL THEN
    ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS contrato_id TEXT;
    ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS contrato_papel TEXT
      CHECK (contrato_papel IN ('aluguel','condominio','iptu','seguro','multa'));
    ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS valor_status TEXT DEFAULT 'confirmado'
      CHECK (valor_status IN ('confirmado','projetado'));
    ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS composicao JSONB;
    CREATE INDEX IF NOT EXISTS agendamentos_contrato_idx ON agendamentos (contrato_id) WHERE contrato_id IS NOT NULL;
  END IF;
  IF to_regclass('lancamentos') IS NOT NULL THEN
    ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS contrato_id TEXT;
    ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS composicao JSONB;
    CREATE INDEX IF NOT EXISTS lancamentos_contrato_idx ON lancamentos (contrato_id) WHERE contrato_id IS NOT NULL;
  END IF;
END $$;

-- R7: aplicada à mão pelo neondb_owner num banco que já tem o usuário próprio, as tabelas novas
-- passam a ser dele (senão o /api não as lê). Pelo provisionamento já nascem dele.
DO $$
DECLARE papel TEXT := current_database() || '_app'; t TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
    FOREACH t IN ARRAY ARRAY['contratos','contrato_itens','contrato_eventos','indices_cache'] LOOP
      EXECUTE format('ALTER TABLE %I OWNER TO %I', t, papel);
    END LOOP;
  END IF;
END $$;
