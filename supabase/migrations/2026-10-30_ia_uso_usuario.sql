-- Assistente: quem fez o pedido (ia_uso.usuario = id do usuário do token) para o LIMITE DIÁRIO por
-- usuário (src/lib/assistente/limiteIa.js). Linhas antigas ficam NULL (não contam para ninguém).
-- Tabela criada pelo app (api/_ia.js ensureIaSchema); banco que ainda não a tem recebe a coluna lá.
DO $$
BEGIN
  IF to_regclass('ia_uso') IS NOT NULL THEN
    ALTER TABLE ia_uso ADD COLUMN IF NOT EXISTS usuario TEXT;
    CREATE INDEX IF NOT EXISTS idx_ia_uso_usuario_dia ON ia_uso (usuario, created_at);
  END IF;
END $$;
