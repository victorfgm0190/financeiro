-- ============================================================
-- BANCO CENTRAL DA PLATAFORMA (finup_central) — ambientes e código de passagem do login
-- Idempotente: pode rodar mais de uma vez sem erro e sem duplicar nada.
-- Aplicar com: node scripts/migrar-central.js   (ver docs/ambientes.md)
--
-- As tabelas plataforma_* (pedidos e Controle de Clientes) também moram aqui; o DDL delas é o
-- DDL_PLATAFORMA de api/_plataforma.js, que o migrar-central.js e a própria API aplicam.
-- ============================================================

-- Um ambiente = um cliente = um database no MESMO projeto Neon. A URL é montada a partir da
-- CENTRAL_DATABASE_URL trocando o nome do database: NUNCA guardar URL nem senha aqui.
CREATE TABLE IF NOT EXISTS ambientes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  sigla TEXT NOT NULL UNIQUE CHECK (sigla = lower(sigla) AND sigla ~ '^[a-z0-9]+$'),
  nome TEXT NOT NULL,
  database_name TEXT NOT NULL UNIQUE CHECK (database_name ~ '^[a-z0-9_]{1,63}$'),
  status TEXT NOT NULL DEFAULT 'provisionando'
    CHECK (status IN ('ativo', 'suspenso', 'cancelado', 'provisionando')),
  cliente_id TEXT,
  -- Quantas migrações de supabase/migrations (em ordem de nome) já valem neste database.
  schema_versao INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ambientes_cliente ON ambientes (cliente_id);

-- Código de passagem: login no www com o ambiente de um cliente → código de uso único (60 s) que
-- <sigla>.finup.app.br/entrar troca pelo token. Só o HASH (sha256) do código fica gravado.
CREATE TABLE IF NOT EXISTS login_handoff (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  codigo_hash TEXT NOT NULL UNIQUE,
  ambiente_id TEXT NOT NULL REFERENCES ambientes(id) ON DELETE CASCADE,
  usuario_id TEXT,
  payload JSONB NOT NULL,
  expira_em TIMESTAMPTZ NOT NULL,
  usado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_handoff_expira ON login_handoff (expira_em);

-- Ambiente do Victor: o banco de sempre (neondb), com as 2 migrações atuais já aplicadas
-- (2026-10-14_usuarios.sql e 2026-10-17_niveis_acesso.sql).
INSERT INTO ambientes (sigla, nome, database_name, status, schema_versao)
VALUES ('vm', 'Victor Moreira', 'neondb', 'ativo', 2)
ON CONFLICT (sigla) DO NOTHING;
