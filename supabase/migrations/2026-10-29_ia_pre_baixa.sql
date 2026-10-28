-- ASSISTENTE IA (etapa 1.1): pré-lançamento também pode ser uma BAIXA de agendamento (prévia do
-- Registrar Agendamento fechada sem confirmar). Só o CHECK do tipo muda; nenhum dado é alterado.
ALTER TABLE ia_pre_lancamentos DROP CONSTRAINT IF EXISTS ia_pre_lancamentos_tipo_check;
ALTER TABLE ia_pre_lancamentos ADD CONSTRAINT ia_pre_lancamentos_tipo_check
  CHECK (tipo IN ('lancamento', 'agendamento', 'baixa'));
