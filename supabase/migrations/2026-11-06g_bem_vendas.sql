-- Venda simples de bem (api/bem/[id]/vender.js). Uma linha por venda: o que foi informado e, em `anterior`,
-- o que o estorno precisa para desfazer tudo. Idempotente. Não altera nenhum dado existente.
CREATE TABLE IF NOT EXISTS bem_vendas (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  bem_id TEXT NOT NULL,
  data TEXT NOT NULL,
  dados JSONB NOT NULL DEFAULT '{}'::jsonb,
  anterior JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_por TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  estornado_em TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_bem_vendas_bem ON bem_vendas (bem_id);
-- Um bem só tem uma venda valendo.
CREATE UNIQUE INDEX IF NOT EXISTS ux_bem_vendas_ativa ON bem_vendas (bem_id) WHERE estornado_em IS NULL;
