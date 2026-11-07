-- ============================================================
-- MÓDULO DE CONTRATOS — benfeitoria no custo do bem e reajuste do contrato a receber por administradora.
--   bem_baixas.tipo: + 'benfeitoria' — benfeitoria/reparo feito pelo inquilino e abatido do repasse,
--     com "somar ao custo do bem" marcado e bem ligado ao contrato. Sem lançamento de caixa (o dinheiro
--     já está no repasse): soma no bem como as demais baixas sem movimento em conta.
--   bem_baixas.origem_ref: de onde a linha veio — 'ctr:<contrato>:<AAAA-MM>:<chave do item>'. Índice
--     único (linhas não estornadas): o mesmo item nunca gera dois movimentos.
--   contratos.bases_confirmadas: { "<ciclo>": aluguel confirmado } do reajuste no modo repasse (o
--     contrato a pagar continua guardando a confirmação nas parcelas). Vazio = tudo como antes.
-- Idempotente; banco sem as tabelas não faz nada.
-- ============================================================

DO $$
BEGIN
  IF to_regclass('bem_baixas') IS NOT NULL THEN
    ALTER TABLE bem_baixas DROP CONSTRAINT IF EXISTS bem_baixas_tipo_check;
    ALTER TABLE bem_baixas ADD CONSTRAINT bem_baixas_tipo_check
      CHECK (tipo IN ('abertura', 'terceiro', 'conta_externa', 'credito', 'benfeitoria'));
    ALTER TABLE bem_baixas ADD COLUMN IF NOT EXISTS origem_ref TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_bem_baixas_origem_ref ON bem_baixas (origem_ref)
      WHERE origem_ref IS NOT NULL AND estornado_em IS NULL;
  END IF;

  IF to_regclass('contratos') IS NOT NULL THEN
    ALTER TABLE contratos ADD COLUMN IF NOT EXISTS bases_confirmadas JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;
