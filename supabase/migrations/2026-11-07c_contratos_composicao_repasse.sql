-- ============================================================
-- MÓDULO DE CONTRATOS — composição do repasse e saldo com a administradora (Etapas 2 e 3).
--   contratos.taxa_adm_pct / taxa_adm_base / categoria_taxa_adm_id: taxa de administração do
--     contrato. Base 'bruto' = aluguel bruto; 'bruto_menos_taxas' = aluguel bruto menos tarifas fixas
--     e parcelas de taxa única do mês. O valor de cada competência pode ser informado à mão.
--   contrato_itens.tipo_repasse: taxa da administradora cobrada no repasse —
--     'tarifa_fixa' = valor fixo (valor_previsto) por competência, de vigencia_inicio a vigencia_fim;
--     'taxa_unica'  = total (valor_previsto) em parcelas de valor livre (valores_parcelas, JSONB),
--                     a 1ª na competência vigencia_inicio e as seguintes nos meses seguintes.
--     vigencia_* são competências 'AAAA-MM'. dedutivel_ir: padrão sugerido para o relatório de IR.
--     NULL (padrão) = os itens de antes, que não entram no repasse — nada muda neles.
--   contrato_competencias: ÚNICA fonte da verdade da composição de cada competência do contrato a
--     receber por administradora (itens tipados, JSONB). A cópia no agendamento é só para exibir; o
--     saldo e o relatório de rendimentos leem daqui. status 'fechada' congela a composição.
-- Idempotente; banco sem a tabela contratos (módulo nunca instalado) não faz nada.
-- ============================================================

DO $$
BEGIN
  IF to_regclass('contratos') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE contratos ADD COLUMN IF NOT EXISTS taxa_adm_pct NUMERIC(7,4);
  ALTER TABLE contratos ADD COLUMN IF NOT EXISTS taxa_adm_base TEXT NOT NULL DEFAULT 'bruto';
  ALTER TABLE contratos ADD COLUMN IF NOT EXISTS categoria_taxa_adm_id TEXT;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contratos_taxa_adm_base_check') THEN
    ALTER TABLE contratos ADD CONSTRAINT contratos_taxa_adm_base_check CHECK (taxa_adm_base IN ('bruto', 'bruto_menos_taxas'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contratos_taxa_adm_pct_check') THEN
    ALTER TABLE contratos ADD CONSTRAINT contratos_taxa_adm_pct_check CHECK (taxa_adm_pct IS NULL OR (taxa_adm_pct >= 0 AND taxa_adm_pct <= 100));
  END IF;

  IF to_regclass('contrato_itens') IS NOT NULL THEN
    ALTER TABLE contrato_itens ADD COLUMN IF NOT EXISTS tipo_repasse TEXT;
    ALTER TABLE contrato_itens ADD COLUMN IF NOT EXISTS valores_parcelas JSONB;
    ALTER TABLE contrato_itens ADD COLUMN IF NOT EXISTS vigencia_inicio TEXT;
    ALTER TABLE contrato_itens ADD COLUMN IF NOT EXISTS vigencia_fim TEXT;
    ALTER TABLE contrato_itens ADD COLUMN IF NOT EXISTS dedutivel_ir BOOLEAN;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contrato_itens_tipo_repasse_check') THEN
      ALTER TABLE contrato_itens ADD CONSTRAINT contrato_itens_tipo_repasse_check CHECK (tipo_repasse IS NULL OR tipo_repasse IN ('tarifa_fixa', 'taxa_unica'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contrato_itens_vigencia_check') THEN
      ALTER TABLE contrato_itens ADD CONSTRAINT contrato_itens_vigencia_check CHECK (
        (vigencia_inicio IS NULL OR vigencia_inicio ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
        AND (vigencia_fim IS NULL OR vigencia_fim ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'));
    END IF;
  END IF;

  CREATE TABLE IF NOT EXISTS contrato_competencias (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    contrato_id TEXT NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
    competencia TEXT NOT NULL CHECK (competencia ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    itens JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'fechada')),
    observacao TEXT,
    repasse_lancamento_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (contrato_id, competencia)
  );
END $$;

-- R7: aplicada à mão pelo neondb_owner num banco que já tem o usuário próprio, a tabela passa a ser
-- dele (senão o /api não a lê). Pelo migrar-ambientes.js já nasce dele (SET LOCAL ROLE).
DO $$
DECLARE papel TEXT := current_database() || '_app';
BEGIN
  IF to_regclass('contrato_competencias') IS NOT NULL AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
    EXECUTE format('ALTER TABLE contrato_competencias OWNER TO %I', papel);
  END IF;
END $$;
