-- Backup completo do ambiente — área de preparo da restauração (api/_backup.js).
-- O arquivo do backup chega em partes (a Vercel limita cada envio a ~4,5 MB); cada parte fica aqui até
-- a restauração aplicar tudo numa transação só. A própria restauração apaga o lote; restos de uma
-- restauração abandonada (mais de 1 dia) são apagados no próximo envio.
-- ADITIVA: só cria a tabela. O código antigo não a usa. Fica FORA do backup (src/lib/backupFormato.js).
CREATE TABLE IF NOT EXISTS backup_preparo (
  id        TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  lote_id   TEXT NOT NULL,
  tabela    TEXT NOT NULL,
  parte     INTEGER NOT NULL,
  linhas    INTEGER NOT NULL,
  dados     TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lote_id, tabela, parte)
);
CREATE INDEX IF NOT EXISTS idx_backup_preparo_criado ON backup_preparo (criado_em);
