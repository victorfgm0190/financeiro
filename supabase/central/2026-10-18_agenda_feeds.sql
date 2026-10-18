-- ============================================================
-- BANCO CENTRAL — "Agenda no celular": feed .ics por usuário (Google Agenda / iPhone). A rota
-- pública /api/agenda lê SÓ daqui: nunca abre o banco do ambiente. Idempotente.
-- ============================================================

-- Um feed por usuário de um ambiente. token = 32 bytes aleatórios (base64url):
--   token_hash  — sha256 do token; é o que a rota pública procura;
--   token_cifrado — o token em AES-256-GCM (chave AGENDA_TOKEN_KEY, fora do banco), para o dono
--                   logado ver o link de novo em outro aparelho. Nunca o token em texto puro.
-- "Gerar novo link" revoga o ativo (revogado_em) e cria outro: um ativo por (ambiente, usuário).
CREATE TABLE IF NOT EXISTS agenda_feeds (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  ambiente_sigla TEXT NOT NULL,
  usuario_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_cifrado TEXT NOT NULL,
  tipos TEXT[] NOT NULL DEFAULT ARRAY['despesa', 'receita'],
  mostrar_valores BOOLEAN NOT NULL DEFAULT true,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  revogado_em TIMESTAMPTZ,
  ultimo_acesso_em TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_agenda_feeds_ativo ON agenda_feeds (ambiente_sigla, usuario_id) WHERE revogado_em IS NULL;

-- O .ics pronto, por feed e tipo ('despesa' | 'receita'), gerado pelo app do dono.
-- hash = do conteúdo sem as linhas DTSTAMP (o app não reenvia o que não mudou).
CREATE TABLE IF NOT EXISTS agenda_cache (
  feed_id TEXT NOT NULL REFERENCES agenda_feeds(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('despesa', 'receita')),
  conteudo TEXT NOT NULL,
  hash TEXT NOT NULL,
  gerado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (feed_id, tipo)
);
