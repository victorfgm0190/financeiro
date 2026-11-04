-- ============================================================
-- MÓDULO DE CONTRATOS — composição do boleto em parcela de condomínio ABERTA.
--   contrato_creditos.status: + 'previsto' = crédito do proprietário de um boleto informado antes do
--   pagamento (origem_agendamento_id = parcela de condomínio, origem_lancamento_id NULL). Já abate no
--   aluguel de destino; vira 'aberto' quando o condomínio é pago (sem criar outro crédito).
-- Idempotente: rodar de novo não muda nada.
-- ============================================================

DO $$
BEGIN
  IF to_regclass('contrato_creditos') IS NULL THEN
    RETURN;
  END IF;
  ALTER TABLE contrato_creditos DROP CONSTRAINT IF EXISTS contrato_creditos_status_check;
  ALTER TABLE contrato_creditos ADD CONSTRAINT contrato_creditos_status_check
    CHECK (status IN ('previsto', 'aberto', 'compensado'));
END $$;
