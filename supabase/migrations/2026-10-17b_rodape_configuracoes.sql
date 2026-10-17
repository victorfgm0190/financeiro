-- ============================================================
-- RODAPÉ da barra lateral por ambiente (Etapa 2, Parte B). Colunas novas, VAZIAS: nenhuma linha é
-- alterada. Vazio no ambiente principal ('vm') = o texto de sempre ("Gislaine & Victor Moreira" /
-- "Transformando conhecimento em resultados."); nos clientes o kit básico grava o nome do cliente.
-- Idempotente.
-- ============================================================

ALTER TABLE configuracoes ADD COLUMN IF NOT EXISTS rodape_titulo TEXT;
ALTER TABLE configuracoes ADD COLUMN IF NOT EXISTS rodape_frase TEXT;
