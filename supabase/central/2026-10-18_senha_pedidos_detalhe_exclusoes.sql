-- ============================================================
-- BANCO CENTRAL — (1) detalhes dos pedidos de "Esqueci minha senha", para o quadro "Tentativas de
-- senha" do Controle de Clientes; (2) auditoria das exclusões de clientes. Idempotente.
-- ============================================================

-- 1) Cada pedido grava, na linha do IP (chave 'ip:<ip>'), o ambiente, o login digitado e o resultado:
--    enviado | nao_encontrado | bloqueado_ip | bloqueado_usuario | falha_envio.
--    A linha do usuário (chave 'usr:<ambiente>:<usuario>') leva os mesmos dados.
ALTER TABLE senha_pedidos ADD COLUMN IF NOT EXISTS ambiente_id TEXT;
ALTER TABLE senha_pedidos ADD COLUMN IF NOT EXISTS login TEXT;
ALTER TABLE senha_pedidos ADD COLUMN IF NOT EXISTS resultado TEXT;
CREATE INDEX IF NOT EXISTS idx_senha_pedidos_ambiente ON senha_pedidos (ambiente_id, criado_em);

-- 2) Auditoria: quem excluiu qual cliente e quando. Sem senha, sem token.
CREATE TABLE IF NOT EXISTS plataforma_exclusoes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  cliente_id TEXT NOT NULL,
  sigla TEXT,
  nome TEXT NOT NULL,
  email TEXT,
  database_name TEXT,
  autor TEXT,
  detalhe TEXT,
  excluido_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
