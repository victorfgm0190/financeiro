-- ============================================================
-- ETAPA 1 DA COMERCIALIZAÇÃO — organizações, usuários e membros
-- Idempotente: pode rodar mais de uma vez sem erro e sem duplicar nada.
-- Nesta etapa NENHUMA outra tabela ganha organizacao_id.
-- ============================================================

CREATE TABLE IF NOT EXISTS organizacoes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  nome TEXT NOT NULL,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  username TEXT UNIQUE NOT NULL CHECK (username = lower(username)),
  nome TEXT,
  email TEXT,
  senha_hash TEXT NOT NULL,
  ativo BOOLEAN DEFAULT true,
  tentativas_falhas INT DEFAULT 0,
  bloqueado_ate TIMESTAMPTZ,
  ultimo_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ
);

-- Login aceita usuário OU e-mail: e-mail único sem diferenciar maiúsculas (vários NULL permitidos).
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_email ON usuarios (lower(email));

CREATE TABLE IF NOT EXISTS membros (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  usuario_id TEXT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  organizacao_id TEXT NOT NULL REFERENCES organizacoes(id) ON DELETE CASCADE,
  papel TEXT DEFAULT 'usuario' CHECK (papel IN ('admin', 'usuario', 'leitura')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (usuario_id, organizacao_id)
);

CREATE INDEX IF NOT EXISTS idx_membros_organizacao ON membros (organizacao_id);

-- Bloqueio por tentativas do LOGIN FIXO de emergência (que não tem linha em usuarios).
-- Chave = 'env:<username tentado>'. REMOVER junto com o login fixo antes da comercialização.
CREATE TABLE IF NOT EXISTS login_bloqueios (
  chave TEXT PRIMARY KEY,
  tentativas_falhas INT NOT NULL DEFAULT 0,
  bloqueado_ate TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);
