-- Venda real por cota do consórcio (evento 'vender_cota' em /api/consorcio-eventos). A cota guarda o custo que
-- saiu do bem e o evento que a vendeu; sem evento, é marcação manual de cota vendida antes desta função.
-- Idempotente. Não altera nenhum dado existente: só cria colunas e aceita o novo tipo de evento.
ALTER TABLE consorcio_cotas ADD COLUMN IF NOT EXISTS vendida_custo NUMERIC(14,2);
ALTER TABLE consorcio_cotas ADD COLUMN IF NOT EXISTS vendida_evento_id TEXT;
ALTER TABLE consorcio_eventos DROP CONSTRAINT IF EXISTS consorcio_eventos_tipo_check;
ALTER TABLE consorcio_eventos ADD CONSTRAINT consorcio_eventos_tipo_check
  CHECK (tipo IN ('contemplar', 'reajuste', 'vender', 'usar_carta', 'vender_cota'));
