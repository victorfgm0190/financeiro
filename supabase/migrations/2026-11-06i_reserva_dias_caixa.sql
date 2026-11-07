-- Aviso de caixa da reserva: quantos dias à frente a projeção olha. Vazio = padrão (60).
-- Idempotente. Não altera nenhum dado existente.
ALTER TABLE configuracoes ADD COLUMN IF NOT EXISTS reserva_dias_caixa INTEGER;
