-- ============================================================
-- MODELOS DE IMPORTAÇÃO (planilha de banco não reconhecida → mapeamento salvo), por usuário.
-- Os modelos prontos de bancos ficam no código (src/lib/importers). Só cria; idempotente.
-- Mesmo DDL de api/import-layouts.js (que também cria a tabela se faltar).
-- ============================================================

CREATE TABLE IF NOT EXISTS import_layouts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL,
  nome TEXT NOT NULL,
  banco TEXT,
  tipo TEXT NOT NULL CHECK (tipo IN ('cartao', 'conta')),
  assinatura TEXT NOT NULL,
  mapeamento JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, tipo, assinatura)
);
