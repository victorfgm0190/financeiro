-- Recorrência com parcelamento em cada ocorrência: em quantas parcelas mensais cada ocorrência se divide.
-- Com valor maior que 1, agendamentos.amount passa a ser o TOTAL da ocorrência.
-- 1 = sem parcelamento (todos os agendamentos atuais). Idempotente. Não altera nenhum dado existente.
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS parcelas_por_ocorrencia INTEGER NOT NULL DEFAULT 1;
