-- Assistente: dados de CONSUMO por chamada (tela "Consumo de IA" no Controle de Clientes).
--   modelo                → preço vigente por modelo (ia_precos, no central)
--   duracao_ms            → tempo de resposta da chamada à IA
--   stop_reason           → 'max_tokens' = resposta cortada
--   tokens_cache_leitura / tokens_cache_criacao → parte do tokens_entrada que veio do / foi para o
--                           cache de prompt (tokens_entrada continua sendo o TOTAL de entrada)
-- Linhas antigas: todas as chamadas desde 28/10 usaram o mesmo modelo (api/assistente.js), que é
-- gravado nelas; tempo, stop_reason e a divisão do cache ficam vazios (desconhecidos).
-- Tabela criada pelo app (api/_ia.js ensureIaSchema); banco que ainda não a tem recebe as colunas lá.
DO $$
BEGIN
  IF to_regclass('ia_uso') IS NOT NULL THEN
    ALTER TABLE ia_uso ADD COLUMN IF NOT EXISTS modelo TEXT;
    ALTER TABLE ia_uso ADD COLUMN IF NOT EXISTS duracao_ms INTEGER;
    ALTER TABLE ia_uso ADD COLUMN IF NOT EXISTS stop_reason TEXT;
    ALTER TABLE ia_uso ADD COLUMN IF NOT EXISTS tokens_cache_leitura INTEGER;
    ALTER TABLE ia_uso ADD COLUMN IF NOT EXISTS tokens_cache_criacao INTEGER;
    UPDATE ia_uso SET modelo = 'claude-haiku-5-5' WHERE modelo IS NULL;
    CREATE INDEX IF NOT EXISTS idx_ia_uso_created_at ON ia_uso (created_at);
  END IF;
END $$;
