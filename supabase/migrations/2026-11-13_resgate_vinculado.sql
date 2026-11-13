-- Resgate agendado junto com o agendamento de despesa de conta corrente com classificação gerencial
-- que gera resgate (Contas Anuais, PharmaLog, Imperium…). O agendamento do resgate aponta para o da
-- despesa nesta coluna e acompanha as ocorrências dela (src/lib/resgateVinculado.js).
-- Aditiva e idempotente: NULL = agendamento comum (todos os existentes). Não altera nenhum dado.
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS agendamento_vinculado_id TEXT;
CREATE INDEX IF NOT EXISTS agendamentos_vinculado_idx ON agendamentos (agendamento_vinculado_id)
  WHERE agendamento_vinculado_id IS NOT NULL;
