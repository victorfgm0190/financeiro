-- Plano de venda do consórcio: previsão por cota, venda já feita da cota e a função de reserva que paga as
-- parcelas. Tudo vazio por padrão. Idempotente. Não altera nenhum dado existente.
ALTER TABLE consorcio_cotas ADD COLUMN IF NOT EXISTS plano_mes TEXT;
ALTER TABLE consorcio_cotas ADD COLUMN IF NOT EXISTS plano_valor NUMERIC(14,2);
ALTER TABLE consorcio_cotas ADD COLUMN IF NOT EXISTS vendida_em TEXT;
ALTER TABLE consorcio_cotas ADD COLUMN IF NOT EXISTS vendida_valor NUMERIC(14,2);
ALTER TABLE consorcios ADD COLUMN IF NOT EXISTS funcao_reserva_id TEXT;
