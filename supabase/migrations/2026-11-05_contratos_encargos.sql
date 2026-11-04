-- ============================================================
-- ENCARGOS E DESCONTOS NA PARCELA PRINCIPAL DO CONTRATO (aluguel) — reaproveita contrato_itens.
--   na_parcela: o item entra no valor de cada parcela enquanto estiver ativo ("Seguro 3/36 +49,06").
--     false (padrão) = "Itens previstos" de antes, só registro — nada muda neles.
--   sinal: 'encargo' (+) ou 'desconto' (−); o valor (valor_previsto) fica sempre positivo.
--   parcelas_total: quantas parcelas o item dura.
--   parcela_inicio: em qual parcela DO CONTRATO o item está na 1ª dele (pode ser 0 ou negativa
--     quando o item começou antes da 1ª parcela registrada — contrato já em andamento).
-- Encargos não sofrem reajuste (o reajuste é só do valor contratual). Nenhuma linha existente muda.
-- Idempotente; banco sem a tabela (módulo de Contratos nunca instalado) não faz nada.
-- ============================================================

DO $$
BEGIN
  IF to_regclass('contrato_itens') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE contrato_itens ADD COLUMN IF NOT EXISTS na_parcela BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE contrato_itens ADD COLUMN IF NOT EXISTS sinal TEXT;
  ALTER TABLE contrato_itens ADD COLUMN IF NOT EXISTS parcelas_total INT;
  ALTER TABLE contrato_itens ADD COLUMN IF NOT EXISTS parcela_inicio INT;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contrato_itens_sinal_check') THEN
    ALTER TABLE contrato_itens ADD CONSTRAINT contrato_itens_sinal_check CHECK (sinal IS NULL OR sinal IN ('encargo', 'desconto'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contrato_itens_parcelas_total_check') THEN
    ALTER TABLE contrato_itens ADD CONSTRAINT contrato_itens_parcelas_total_check CHECK (parcelas_total IS NULL OR parcelas_total > 0);
  END IF;
END $$;
