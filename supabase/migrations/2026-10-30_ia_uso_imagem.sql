-- Assistente: marca no consumo (ia_uso) quando o pedido teve IMAGEM (foto/print). A imagem em si
-- nunca é gravada — só o lançamento que o usuário confirmar. Tabela criada pelo app
-- (api/_ia.js ensureIaSchema); banco que ainda não a tem recebe a coluna lá.
DO $$
BEGIN
  IF to_regclass('ia_uso') IS NOT NULL THEN
    ALTER TABLE ia_uso ADD COLUMN IF NOT EXISTS com_imagem BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;
