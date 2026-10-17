-- ============================================================
-- BANCO CENTRAL — limite de pedidos de "Esqueci minha senha" (3 por hora por IP e por usuário).
-- chave = 'ip:<ip>' ou 'usr:<ambiente_id>:<usuario_id>'. Linhas com mais de 1 dia são apagadas
-- pelo próprio pedido (api/senha.js). Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS senha_pedidos (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  chave TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_senha_pedidos_chave ON senha_pedidos (chave, criado_em);
