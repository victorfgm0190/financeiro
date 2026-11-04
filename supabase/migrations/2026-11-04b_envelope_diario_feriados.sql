-- ============================================================
-- ENVELOPE COM ORÇAMENTO DIÁRIO + CADASTRO DE FERIADOS (por cliente: cada banco tem o seu).
--   envelopes.tipo_orcamento: 'mensal' (como sempre: limit_amount do mês) | 'diario' (valor_dia ×
--     dias que contam no ciclo). Os envelopes que já existem ficam 'mensal', sem mudança de valor.
--   envelopes.dias_semana: lista JSONB dos dias que contam (0 = domingo … 6 = sábado).
--   envelopes.descontar_feriados: tira os feriados ativos do cadastro.
--   (envelopes.history, que já existia, guarda as versões da configuração e o orçamento de ciclos
--    encerrados — src/lib/envelopeOrcamento.js.)
--   feriados: só o que o usuário mudou/acrescentou. Os nacionais e os opcionais (Carnaval, Corpus
--     Christi) são gerados pelo app (src/lib/feriados.js); uma linha com `chave` liga/desliga um
--     deles. Sem chave = feriado do usuário: numa data (`data`) ou todo ano (`dia_mes` 'MM-DD').
-- Idempotente: rodar de novo não muda nada.
-- ============================================================

DO $$
BEGIN
  IF to_regclass('envelopes') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE envelopes ADD COLUMN IF NOT EXISTS tipo_orcamento TEXT NOT NULL DEFAULT 'mensal';
  ALTER TABLE envelopes ADD COLUMN IF NOT EXISTS valor_dia NUMERIC(14,2);
  ALTER TABLE envelopes ADD COLUMN IF NOT EXISTS dias_semana JSONB NOT NULL DEFAULT '[]'::jsonb;
  ALTER TABLE envelopes ADD COLUMN IF NOT EXISTS descontar_feriados BOOLEAN NOT NULL DEFAULT false;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'envelopes_tipo_orcamento_check') THEN
    ALTER TABLE envelopes ADD CONSTRAINT envelopes_tipo_orcamento_check CHECK (tipo_orcamento IN ('mensal', 'diario'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS feriados (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  chave TEXT UNIQUE,
  nome TEXT NOT NULL,
  abrangencia TEXT NOT NULL DEFAULT 'municipal' CHECK (abrangencia IN ('nacional', 'opcional', 'estadual', 'municipal')),
  data TEXT CHECK (data IS NULL OR data ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  dia_mes TEXT CHECK (dia_mes IS NULL OR dia_mes ~ '^[0-9]{2}-[0-9]{2}$'),
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (chave IS NOT NULL OR data IS NOT NULL OR dia_mes IS NOT NULL)
);

-- R7: aplicada à mão pelo neondb_owner num banco que já tem o usuário próprio, a tabela passa a ser
-- dele (senão o /api não a lê).
DO $$
DECLARE papel TEXT := current_database() || '_app';
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
    EXECUTE format('ALTER TABLE %I OWNER TO %I', 'feriados', papel);
  END IF;
END $$;
