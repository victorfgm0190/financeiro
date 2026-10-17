-- ============================================================
-- LINKS DE SENHA ("Esqueci minha senha" e convite) — banco de CADA ambiente.
-- Grava só o hash sha256 do token (o token em si só existe no e-mail). Uso único; gerar um novo
-- invalida os anteriores do mesmo usuário (api/_senhaTokens.js). Aplicada pelo
-- scripts/migrar-ambientes.js. Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS senha_tokens (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  token_hash TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL CHECK (tipo IN ('redefinir', 'convite')),
  expira_em TIMESTAMPTZ NOT NULL,
  usado_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ DEFAULT now(),
  ip TEXT
);

CREATE INDEX IF NOT EXISTS idx_senha_tokens_usuario ON senha_tokens (usuario_id) WHERE usado_em IS NULL;
