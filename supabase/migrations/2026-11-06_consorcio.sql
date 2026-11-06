-- Tipo de bem Consórcio: cadastro, cotas e eventos com estorno. O bem continua sendo uma conta
-- (contas.tipo_bem = 'consorcio'); nada aqui usa financing antes da contemplação.
-- E a marcação explícita de receita ligada a um bem (pago por terceiro ou devolução).

ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS bem_papel TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lancamentos_bem_papel_check') THEN
    ALTER TABLE lancamentos ADD CONSTRAINT lancamentos_bem_papel_check
      CHECK (bem_papel IS NULL OR bem_papel IN ('terceiro', 'devolucao'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS consorcios (
  bem_id          TEXT PRIMARY KEY REFERENCES contas(id) ON DELETE CASCADE,
  administradora  TEXT,
  grupo           TEXT,
  data_adesao     TEXT,
  indice_reajuste TEXT,
  conta_origem_id TEXT,
  situacao        TEXT NOT NULL DEFAULT 'ativa'
                  CHECK (situacao IN ('ativa', 'contemplada', 'vendida', 'quitada')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS consorcio_cotas (
  id                        TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  bem_id                    TEXT NOT NULL REFERENCES consorcios(bem_id) ON DELETE CASCADE,
  numero                    TEXT NOT NULL,
  valor_carta               NUMERIC(14,2) NOT NULL DEFAULT 0,
  prazo_meses               INTEGER,
  percentual_parcela        NUMERIC(5,2) NOT NULL DEFAULT 100,
  valor_parcela_cheia       NUMERIC(14,2) NOT NULL DEFAULT 0,
  saldo_devedor_informado   NUMERIC(14,2),
  saldo_devedor_data        TEXT,
  parcelas_pagas_informadas INTEGER,
  valor_pago_informado      NUMERIC(14,2),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_consorcio_cotas_bem ON consorcio_cotas (bem_id);

CREATE TABLE IF NOT EXISTS consorcio_eventos (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  bem_id       TEXT NOT NULL REFERENCES consorcios(bem_id) ON DELETE CASCADE,
  tipo         TEXT NOT NULL CHECK (tipo IN ('contemplar', 'reajuste', 'vender', 'usar_carta')),
  data         TEXT NOT NULL,
  dados        JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- O que o estorno precisa para voltar atrás: agendamentos, saldo, situação, lançamentos criados.
  anterior     JSONB NOT NULL DEFAULT '{}'::jsonb,
  estornado_em TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_consorcio_eventos_bem ON consorcio_eventos (bem_id, created_at);
