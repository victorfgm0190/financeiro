-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- PREÇOS DA IA (US$ por milhão de tokens) por modelo, com data de vigência — tela "Consumo de IA"
-- (Clientes Finup). Nada de preço no código: o administrador cadastra pela página de preços da
-- Anthropic. Campo vazio = preço não cadastrado (a tela mostra só os tokens). Aplicar com:
--   node --env-file=.env.local scripts/migrar-central.js
-- ════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ia_precos (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  modelo TEXT NOT NULL,
  vigencia DATE NOT NULL,
  entrada NUMERIC(12, 4),
  saida NUMERIC(12, 4),
  cache_leitura NUMERIC(12, 4),
  cache_criacao NUMERIC(12, 4),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (modelo, vigencia)
);
