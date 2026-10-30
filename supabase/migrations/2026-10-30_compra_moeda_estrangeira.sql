-- ============================================================
-- COMPRA EM MOEDA ESTRANGEIRA (SMS/foto de cartão em US$) — src/lib/cambio.js.
--   lancamentos: moeda ('USD'; NULL = real), valor_original (na moeda), cotacao (PTAX venda usada) e
--     data_cotacao (dia da PTAX: recua no fim de semana),
--     spread (fração: 0.025 = 2,5%; na compra confirmada pela fatura, o REAL), estimado (valor em R$
--     ainda não conferido com a fatura) e compra_iof_id (IOF estimado → a compra dele).
--   contas (cartão): spread_cambio (padrão sem histórico; NULL = 2,5%) e iof_linha_separada
--     (o banco lança o IOF em linha própria; NULL = sim).
--   configuracoes: iof_compra_internacional (alíquota em fração; NULL = 3,5%).
-- Colunas novas, VAZIAS: nenhuma linha existente é alterada. Ambiente sem elas: o sync as descarta
-- (api/_db.js COLUNAS_OPCIONAIS). Idempotente; banco sem as tabelas não faz nada.
-- ============================================================

DO $$
BEGIN
  IF to_regclass('lancamentos') IS NOT NULL THEN
    ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS moeda TEXT;
    ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS valor_original NUMERIC;
    ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS cotacao NUMERIC;
    ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS data_cotacao TEXT;
    ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS spread NUMERIC;
    ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS estimado BOOLEAN;
    ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS compra_iof_id TEXT;
  END IF;
  IF to_regclass('contas') IS NOT NULL THEN
    ALTER TABLE contas ADD COLUMN IF NOT EXISTS spread_cambio NUMERIC;
    ALTER TABLE contas ADD COLUMN IF NOT EXISTS iof_linha_separada BOOLEAN;
  END IF;
  IF to_regclass('configuracoes') IS NOT NULL THEN
    ALTER TABLE configuracoes ADD COLUMN IF NOT EXISTS iof_compra_internacional NUMERIC;
  END IF;
END $$;
