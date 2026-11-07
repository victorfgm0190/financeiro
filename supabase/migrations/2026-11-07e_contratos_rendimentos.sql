-- ============================================================
-- MÓDULO DE CONTRATOS — relatório de rendimentos do contrato a receber por administradora (Etapa 5).
--   contratos.informes_adm: conferência com o informe de rendimentos da administradora, por ano —
--     { "<AAAA>": { "rendimentos": n|null, "deducoes": n|null } }. Vazio = nada informado.
--   contrato_competencias.data_pagamento_inquilino: dia em que o inquilino pagou a competência à
--     administradora (AAAA-MM-DD, opcional). Sem ela, o relatório usa competência + dia_vencimento.
-- Idempotente; banco sem as tabelas não faz nada. Vai junto com 07b, 07c e 07d.
-- ============================================================

DO $$
BEGIN
  IF to_regclass('contratos') IS NOT NULL THEN
    ALTER TABLE contratos ADD COLUMN IF NOT EXISTS informes_adm JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;

  IF to_regclass('contrato_competencias') IS NOT NULL THEN
    ALTER TABLE contrato_competencias ADD COLUMN IF NOT EXISTS data_pagamento_inquilino TEXT;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contrato_competencias_data_pag_check') THEN
      ALTER TABLE contrato_competencias ADD CONSTRAINT contrato_competencias_data_pag_check
        CHECK (data_pagamento_inquilino IS NULL OR data_pagamento_inquilino ~ '^\d{4}-\d{2}-\d{2}$');
    END IF;
  END IF;
END $$;
