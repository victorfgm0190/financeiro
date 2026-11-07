-- ============================================================
-- MÓDULO DE CONTRATOS — contrato A RECEBER por administradora (modo repasse), Etapa 1.
--   modo_repasse: o aluguel é recebido por um intermediário (administradora), que repassa o líquido.
--     Só vale com tipo = 'receber'. Nesse modo `favorecido` = a administradora (quem de fato paga o
--     repasse) e o inquilino fica só como informação (contraparte_nome / contraparte_documento).
--     false (padrão) = tudo como antes: nenhum contrato existente muda.
--   bem_id: bem do Patrimônio (contas.id) ligado ao contrato — opcional, sem FK (o bem pode ser
--     excluído sem travar o contrato).
--   dia_repasse: dia em que a administradora repassa; repasse_meses_depois: quantos meses depois da
--     competência do aluguel o repasse acontece (1 = mês seguinte).
--   valor_primeiro_mes: aluguel do 1º mês informado à mão (NULL = proporcional calculado).
--   saldo_inicial_adm / saldo_inicial_competencia: saldo com a administradora antes da competência
--     informada ('AAAA-MM') — para começar o contrato no meio da história.
-- Idempotente; banco sem a tabela (módulo nunca instalado) não faz nada.
-- ============================================================

DO $$
BEGIN
  IF to_regclass('contratos') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE contratos ADD COLUMN IF NOT EXISTS modo_repasse BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE contratos ADD COLUMN IF NOT EXISTS contraparte_nome TEXT;
  ALTER TABLE contratos ADD COLUMN IF NOT EXISTS contraparte_documento TEXT;
  ALTER TABLE contratos ADD COLUMN IF NOT EXISTS bem_id TEXT;
  ALTER TABLE contratos ADD COLUMN IF NOT EXISTS dia_repasse INT;
  ALTER TABLE contratos ADD COLUMN IF NOT EXISTS repasse_meses_depois INT NOT NULL DEFAULT 1;
  ALTER TABLE contratos ADD COLUMN IF NOT EXISTS valor_primeiro_mes NUMERIC(14,2);
  ALTER TABLE contratos ADD COLUMN IF NOT EXISTS saldo_inicial_adm NUMERIC(14,2);
  ALTER TABLE contratos ADD COLUMN IF NOT EXISTS saldo_inicial_competencia TEXT;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contratos_modo_repasse_check') THEN
    ALTER TABLE contratos ADD CONSTRAINT contratos_modo_repasse_check CHECK (NOT modo_repasse OR tipo = 'receber');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contratos_dia_repasse_check') THEN
    ALTER TABLE contratos ADD CONSTRAINT contratos_dia_repasse_check CHECK (dia_repasse IS NULL OR dia_repasse BETWEEN 1 AND 31);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contratos_repasse_meses_check') THEN
    ALTER TABLE contratos ADD CONSTRAINT contratos_repasse_meses_check CHECK (repasse_meses_depois BETWEEN 0 AND 3);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contratos_saldo_inicial_comp_check') THEN
    ALTER TABLE contratos ADD CONSTRAINT contratos_saldo_inicial_comp_check
      CHECK (saldo_inicial_competencia IS NULL OR saldo_inicial_competencia ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
  END IF;
END $$;
