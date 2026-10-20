-- ============================================================
-- DATA DA OCORRÊNCIA no lançamento gerado por agendamento: a data-BASE da ocorrência baixada
-- (chave de registered/overrides), não a data do pagamento. Só exibição — o selo "x/N" dos
-- parcelados (src/lib/numeroParcela.js). Coluna nova, VAZIA: nenhuma linha existente é alterada.
-- Idempotente; num banco sem a tabela lancamentos (bancos de teste das migrações) não faz nada.
-- ============================================================

DO $$
BEGIN
  IF to_regclass('lancamentos') IS NOT NULL THEN
    ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS data_ocorrencia TEXT;
  END IF;
END $$;
