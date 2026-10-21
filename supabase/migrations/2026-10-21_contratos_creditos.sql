-- ============================================================
-- MÓDULO DE CONTRATOS — Entrega 2 (composição do boleto do condomínio e créditos do proprietário).
-- contrato_regras_itens: classifica os itens do boleto (inquilino × proprietário); contrato_id NULL
-- = regra global do ambiente. As regras globais iniciais vêm do kit básico (api/_kitBasico.js) nos
-- clientes novos e do sql/contratos_entrega2.sql nos que já existem — banco recém-criado nasce
-- sem linha nenhuma (api/provisionar.test.js). contrato_creditos: o que o proprietário deve abater
-- no aluguel — NÃO gera lançamento (P2: uma linha por pagamento; a conta fica na composição).
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS contrato_regras_itens (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  contrato_id TEXT REFERENCES contratos(id) ON DELETE CASCADE,
  padrao TEXT NOT NULL,
  tipo_match TEXT NOT NULL DEFAULT 'contem' CHECK (tipo_match IN ('comeca_com','contem')),
  responsavel TEXT NOT NULL CHECK (responsavel IN ('inquilino','proprietario')),
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contrato_regras_contrato_idx ON contrato_regras_itens (contrato_id);

CREATE TABLE IF NOT EXISTS contrato_creditos (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  contrato_id TEXT NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  origem_lancamento_id TEXT,
  origem_agendamento_id TEXT,
  itens JSONB NOT NULL DEFAULT '[]'::jsonb,
  descricao TEXT,
  valor NUMERIC(14,2) NOT NULL CHECK (valor >= 0),
  data_origem TEXT CHECK (data_origem IS NULL OR data_origem ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','compensado')),
  compensado_em_lancamento_id TEXT,
  compensado_em_agendamento_id TEXT,
  data_compensacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contrato_creditos_status_idx ON contrato_creditos (contrato_id, status);

-- R7: aplicada à mão pelo neondb_owner num banco que já tem o usuário próprio, as tabelas passam a
-- ser dele (senão o /api não as lê).
DO $$
DECLARE papel TEXT := current_database() || '_app'; t TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
    FOREACH t IN ARRAY ARRAY['contrato_regras_itens','contrato_creditos'] LOOP
      EXECUTE format('ALTER TABLE %I OWNER TO %I', t, papel);
    END LOOP;
  END IF;
END $$;
