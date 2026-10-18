-- ============================================================
-- IMPORTAÇÃO PADRÃO DE LANÇAMENTOS (um arquivo por conta: .xlsx gerado pelo Finup, .csv ou OFX).
-- Só CRIA tabelas e colunas: nenhuma linha existente é alterada. Idempotente.
-- Aplicada em todos os ambientes pelo scripts/migrar-ambientes.js.
-- ============================================================

-- Um registro por lote importado. status: em_andamento (gravando ou página fechada no meio) |
-- concluida | desfeita. ofx_banco/ofx_conta: identificação do extrato OFX (aviso "este extrato
-- parece ser da conta X" quando o mesmo extrato aparece em outra conta do Finup).
CREATE TABLE IF NOT EXISTS importacoes_lancamentos (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  conta_id TEXT NOT NULL,
  formato TEXT NOT NULL CHECK (formato IN ('xlsx', 'csv', 'ofx')),
  arquivo TEXT,
  qtd INTEGER NOT NULL DEFAULT 0,
  total_entradas NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_saidas NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento', 'concluida', 'desfeita')),
  ofx_banco TEXT,
  ofx_conta TEXT,
  criado_por TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  concluida_em TIMESTAMPTZ,
  desfeita_em TIMESTAMPTZ,
  desfeita_por TEXT
);
CREATE INDEX IF NOT EXISTS idx_importacoes_lancamentos_conta ON importacoes_lancamentos (conta_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_importacoes_lancamentos_ofx ON importacoes_lancamentos (ofx_banco, ofx_conta) WHERE ofx_conta IS NOT NULL;

-- De-para de categoria da importação: texto de origem (normalizado: minúsculo, sem acento, espaços
-- simples) → categoria do ambiente. Editável em Configurações › Cadastros.
CREATE TABLE IF NOT EXISTS importacao_depara (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  nome_origem TEXT NOT NULL UNIQUE,
  nome_exibicao TEXT,
  categoria_id TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lançamentos: lote de importação e FITID do OFX (vazios em tudo o que já existe).
ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS importacao_id TEXT;
ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS fitid TEXT;
CREATE INDEX IF NOT EXISTS idx_lancamentos_importacao ON lancamentos (importacao_id) WHERE importacao_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lancamentos_fitid ON lancamentos (account_id, fitid) WHERE fitid IS NOT NULL;
