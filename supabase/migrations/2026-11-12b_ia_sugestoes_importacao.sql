-- Sugestões do Assistente na Importar Fatura (Etapa 6c): opção do CLIENTE em Configurações › Geral.
-- Vazio = desligada. Só aparece e só vale com o recurso liberado pelo administrador da plataforma
-- (ambientes.modulos no central). Idempotente. Não altera nenhum dado existente.
ALTER TABLE configuracoes ADD COLUMN IF NOT EXISTS ia_sugestoes_importacao BOOLEAN;
