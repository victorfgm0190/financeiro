-- ============================================================
-- MÓDULO DE CONTRATOS — contrato para qualquer finalidade, meses sem cobrança e créditos a abater.
--   contratos.modalidade: + 'assinatura' e 'seguro' ('servico' = Prestação de serviço).
--   contratos.meses_sem_cobranca: competências 'AAAA-MM' sem cobrança principal (JSONB, lista).
--   contratos.credito_abatimento: onde o crédito a abater entra —
--     'mes_seguinte'     = parcela de competência posterior à do boleto (padrão dos contratos novos);
--     'proximo_pendente' = próxima parcela pendente com vencimento >= data do crédito (regra antiga).
--     Os contratos que JÁ EXISTEM ficam em 'proximo_pendente' (nada muda para eles); dá para trocar
--     no Aditivo.
--   contrato_creditos.destino_agendamento_id: parcela escolhida à mão (tem prioridade sobre a regra).
-- Idempotente: rodar de novo não muda nada.
-- ============================================================

DO $$
BEGIN
  IF to_regclass('contratos') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE contratos DROP CONSTRAINT IF EXISTS contratos_modalidade_check;
  ALTER TABLE contratos ADD CONSTRAINT contratos_modalidade_check
    CHECK (modalidade IN ('aluguel', 'servico', 'assinatura', 'seguro', 'outro'));

  ALTER TABLE contratos ADD COLUMN IF NOT EXISTS meses_sem_cobranca JSONB NOT NULL DEFAULT '[]'::jsonb;

  -- Coluna nova: as linhas existentes nascem com a regra antiga; só depois o padrão vira o novo.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = current_schema() AND table_name = 'contratos'
                   AND column_name = 'credito_abatimento') THEN
    ALTER TABLE contratos ADD COLUMN credito_abatimento TEXT NOT NULL DEFAULT 'proximo_pendente';
  END IF;
  ALTER TABLE contratos ALTER COLUMN credito_abatimento SET DEFAULT 'mes_seguinte';
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contratos_credito_abatimento_check') THEN
    ALTER TABLE contratos ADD CONSTRAINT contratos_credito_abatimento_check
      CHECK (credito_abatimento IN ('mes_seguinte', 'proximo_pendente'));
  END IF;

  IF to_regclass('contrato_creditos') IS NOT NULL THEN
    ALTER TABLE contrato_creditos ADD COLUMN IF NOT EXISTS destino_agendamento_id TEXT;
  END IF;
END $$;
