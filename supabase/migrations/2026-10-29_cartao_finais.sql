-- FINAIS DO CARTÃO: lista dos 4 últimos dígitos (titular e adicionais) de um cartão de crédito,
-- editável em Editar Conta. O Assistente IA usa para resolver "final 4541" no cartão certo.
ALTER TABLE contas ADD COLUMN IF NOT EXISTS cartao_finais JSONB NOT NULL DEFAULT '[]'::jsonb;
