-- Virada de saldo assistida no Controle de Reservas (src/lib/viradaReserva.js, api/reserve-virada.js).
-- Idempotente. Não altera nenhum dado existente: só cria tabelas, colunas e índices.
--
-- reserve_viradas: uma linha por mês fechado pela virada assistida — registro que permite desfazer
--   depois de recarregar a página (os snapshots e períodos dela levam virada_id) e que guarda, no
--   `resumo`, a diferença por conta (soma das funções × saldo da conta no corte). status 'ativa' ou
--   'desfeita'. `chave` = chave de idempotência do pedido (clique duplo / reenvio).
CREATE TABLE IF NOT EXISTS reserve_viradas (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  data_inicio DATE NOT NULL,
  data_corte DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativa',
  chave TEXT,
  resumo JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_por TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  desfeita_em TIMESTAMPTZ,
  desfeita_por TEXT
);
-- Um mês só pode ter UMA virada ativa: duas abas ou dois aparelhos não duplicam.
CREATE UNIQUE INDEX IF NOT EXISTS ux_reserve_viradas_corte_ativa ON reserve_viradas (data_corte) WHERE status = 'ativa';

-- Log do recálculo de viradas por lançamento retroativo (valores antes/depois). visto_em = o
-- usuário já viu o aviso na tela de Reservas.
CREATE TABLE IF NOT EXISTS reserve_virada_recalculos (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  virada_id TEXT REFERENCES reserve_viradas(id),
  data_corte DATE,
  function_id TEXT,
  tabela TEXT,
  registro_id TEXT,
  campo TEXT NOT NULL,
  antes NUMERIC,
  depois NUMERIC,
  motivo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  visto_em TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_reserve_virada_recalculos_visto ON reserve_virada_recalculos (visto_em, created_at DESC);

-- Snapshot: Rendimentos separados do Ajuste. NULL = snapshot antigo (o ajuste dele já inclui os
-- rendimentos) — continua legível como sempre. As tabelas de reserva são criadas pelo app
-- (api/load.js) — banco que ainda não as tem recebe as colunas lá.
DO $$
BEGIN
  IF to_regclass('reserve_period_snapshots') IS NOT NULL THEN
    ALTER TABLE reserve_period_snapshots ADD COLUMN IF NOT EXISTS rendimentos NUMERIC;
    ALTER TABLE reserve_period_snapshots ADD COLUMN IF NOT EXISTS virada_id TEXT;
    -- Uma linha por função em cada virada (registros antigos, sem virada_id, ficam de fora).
    CREATE UNIQUE INDEX IF NOT EXISTS ux_reserve_snapshots_virada_funcao ON reserve_period_snapshots (virada_id, function_id) WHERE virada_id IS NOT NULL;
  END IF;
  IF to_regclass('reserve_periods') IS NOT NULL THEN
    ALTER TABLE reserve_periods ADD COLUMN IF NOT EXISTS virada_id TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_reserve_periods_virada_funcao ON reserve_periods (virada_id, function_id) WHERE virada_id IS NOT NULL;
  END IF;
  -- Configurações › "Perguntar sobre a virada ao entrar em Reservas". NULL = padrão (ligada).
  IF to_regclass('configuracoes') IS NOT NULL THEN
    ALTER TABLE configuracoes ADD COLUMN IF NOT EXISTS reserva_perguntar_virada BOOLEAN;
  END IF;
END $$;
