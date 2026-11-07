-- ============================================================
-- MÓDULO DE CONTRATOS — conferência do extrato da administradora (contrato a receber por administradora).
--   contrato_competencias.conferencia: o que o extrato da competência trouxe e foi conferido —
--     { "conferido_em": "AAAA-MM-DD", "origem": "ia"|"manual", "periodo": texto|null,
--       "saldo_anterior_extrato": n|null, "saldo_anterior_finup": n|null, "total_extrato": n|null,
--       "repasse": n|null }. NULL = competência ainda não conferida (o Finup só projeta).
--   Com conferência, a composição gravada vale como está e o repasse da competência é o líquido do
--   extrato; as seguintes reprojetam a partir dela. O arquivo do extrato NÃO é guardado.
-- Idempotente; banco sem a tabela não faz nada. Vai junto com 07b, 07c, 07d e 07e.
-- ============================================================

DO $$
BEGIN
  IF to_regclass('contrato_competencias') IS NOT NULL THEN
    ALTER TABLE contrato_competencias ADD COLUMN IF NOT EXISTS conferencia JSONB;
  END IF;
END $$;
