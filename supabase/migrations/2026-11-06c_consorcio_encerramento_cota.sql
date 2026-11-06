-- Encerramento por cota, conforme o contrato ou a administradora. Opcionais: sem eles, a tela estima
-- o encerramento por adesão + prazo e mostra o rótulo "estimado".
ALTER TABLE consorcio_cotas ADD COLUMN IF NOT EXISTS previsao_encerramento TEXT;
ALTER TABLE consorcio_cotas ADD COLUMN IF NOT EXISTS data_ultima_parcela TEXT;
