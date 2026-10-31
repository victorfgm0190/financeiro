-- Pendências de 31/10/2026 (aprovadas pelo usuário):
--   1. historico_alteracoes: quem alterou (usuario_id/usuario_nome do login, autor usuario|assistente|sistema).
--      Linhas antigas ficam NULL (a tela mostra "—").
--   6. lancamento_rateios.grupo_gerencial: grupo gerencial por linha do rateio (NULL = o do lançamento).
--   7. numero_contrato em agendamentos e lancamentos (antes ia na descrição/observação).
--   8. ia_apelidos: tipos 'acao_despesa' e 'recorrencia' (preferências aprendidas do Assistente).
-- Tabelas criadas pelo app (historico_alteracoes, ia_apelidos, lancamento_rateios) podem não existir
-- ainda num banco novo: cada passo só roda se a tabela existe (o app cria já com o formato novo).
DO $$
BEGIN
  IF to_regclass('historico_alteracoes') IS NOT NULL THEN
    ALTER TABLE historico_alteracoes ADD COLUMN IF NOT EXISTS usuario_id TEXT;
    ALTER TABLE historico_alteracoes ADD COLUMN IF NOT EXISTS usuario_nome TEXT;
    ALTER TABLE historico_alteracoes ADD COLUMN IF NOT EXISTS autor TEXT;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'historico_alteracoes_autor_check') THEN
      ALTER TABLE historico_alteracoes ADD CONSTRAINT historico_alteracoes_autor_check
        CHECK (autor IS NULL OR autor IN ('usuario', 'assistente', 'sistema'));
    END IF;
  END IF;

  IF to_regclass('lancamento_rateios') IS NOT NULL THEN
    ALTER TABLE lancamento_rateios ADD COLUMN IF NOT EXISTS grupo_gerencial TEXT;
  END IF;

  ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS numero_contrato TEXT;
  ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS numero_contrato TEXT;

  IF to_regclass('ia_apelidos') IS NOT NULL THEN
    -- Nenhum tipo fora da lista nova (senão a constraint falharia): para tudo e desfaz.
    IF EXISTS (SELECT 1 FROM ia_apelidos WHERE tipo NOT IN ('categoria', 'conta', 'favorecido', 'descricao_fatura', 'acao_despesa', 'recorrencia')) THEN
      RAISE EXCEPTION 'ia_apelidos tem tipo fora da lista nova — migração interrompida';
    END IF;
    ALTER TABLE ia_apelidos DROP CONSTRAINT IF EXISTS ia_apelidos_tipo_check;
    ALTER TABLE ia_apelidos ADD CONSTRAINT ia_apelidos_tipo_check
      CHECK (tipo IN ('categoria', 'conta', 'favorecido', 'descricao_fatura', 'acao_despesa', 'recorrencia'));
  END IF;
END $$;
