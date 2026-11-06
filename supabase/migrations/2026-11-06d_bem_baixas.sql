-- Parcelas pagas sem movimento em conta do Finup: histórico de abertura e baixas por terceiro, por conta
-- não controlada ou por crédito da administradora. Cada linha soma no bem; nada aqui mexe em lançamento
-- ou saldo de conta, exceto a receita de benefício opcional (lancamento_id).
CREATE TABLE IF NOT EXISTS bem_baixas (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  bem_id              TEXT NOT NULL REFERENCES contas(id) ON DELETE CASCADE,
  tipo                TEXT NOT NULL CHECK (tipo IN ('abertura', 'terceiro', 'conta_externa', 'credito')),
  data                TEXT NOT NULL,
  valor               NUMERIC(14,2) NOT NULL,
  -- Quantas parcelas esta linha quita. Crédito avulso abate valor sem quitar parcela: 0.
  quantidade_parcelas INTEGER NOT NULL DEFAULT 1,
  cota_numero         TEXT,
  parcela_id          TEXT,
  schedule_id         TEXT,
  ocorrencia          TEXT,
  favorecido          TEXT,
  categoria_id        TEXT,
  lancamento_id       TEXT,
  descricao           TEXT,
  -- O que o estorno precisa para voltar atrás.
  anterior            JSONB NOT NULL DEFAULT '{}'::jsonb,
  estornado_em        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bem_baixas_bem ON bem_baixas (bem_id, data);
CREATE UNIQUE INDEX IF NOT EXISTS uq_bem_baixas_parcela ON bem_baixas (parcela_id)
  WHERE parcela_id IS NOT NULL AND estornado_em IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_bem_baixas_ocorrencia ON bem_baixas (schedule_id, ocorrencia)
  WHERE schedule_id IS NOT NULL AND estornado_em IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_bem_baixas_abertura ON bem_baixas (bem_id, COALESCE(cota_numero, ''))
  WHERE tipo = 'abertura' AND estornado_em IS NULL;

-- Parcela do financiamento quitada sem lançamento: o motivo aparece na aba Parcelas.
ALTER TABLE financing_installments ADD COLUMN IF NOT EXISTS baixa_tipo TEXT;
