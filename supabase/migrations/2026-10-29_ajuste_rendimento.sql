-- Rendimento em conta de RESERVA rateado entre as funções (src/lib/rendimentoReserva.js): cada
-- parte é um ajuste da função ligado ao lançamento do rendimento — editar/apagar o rendimento
-- refaz/apaga o rateio. NULL = ajuste manual (como hoje). Nenhum dado existente é alterado.
-- A tabela é criada pelo app (api/load.js) — banco que ainda não a tem recebe a coluna lá.
DO $$
BEGIN
  IF to_regclass('reserve_adjustments') IS NOT NULL THEN
    ALTER TABLE reserve_adjustments ADD COLUMN IF NOT EXISTS lancamento_id TEXT;
    CREATE INDEX IF NOT EXISTS idx_reserve_adjustments_lancamento ON reserve_adjustments (lancamento_id);
  END IF;
END $$;
