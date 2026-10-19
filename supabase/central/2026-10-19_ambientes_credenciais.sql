-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- USUÁRIO POSTGRES PRÓPRIO DE CADA AMBIENTE (R7 — docs/grafity-2026-10.md §5.5)
-- Aplicar com: node --env-file=.env.local scripts/migrar-central.js
--
-- db_usuario: o papel <database>_app (api/_usuarioBanco.js). db_senha_cifrada: a senha dele em
-- AES-256-GCM (api/_cifraDb.js), chave FINUP_DB_KEY só na Vercel / .env.local. NULL = ambiente ainda
-- sem usuário próprio (o /api usa o neondb_owner, api/_conexao.js). Nunca selecionar estas colunas
-- junto com o ambiente que vai para cache ou resposta (api/_central.js SQL_AMBIENTE não as inclui).
-- ════════════════════════════════════════════════════════════════════════════════════════════════
ALTER TABLE ambientes ADD COLUMN IF NOT EXISTS db_usuario TEXT;
ALTER TABLE ambientes ADD COLUMN IF NOT EXISTS db_senha_cifrada TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_ambientes_db_usuario') THEN
    ALTER TABLE ambientes ADD CONSTRAINT ck_ambientes_db_usuario
      CHECK (db_usuario IS NULL OR (db_usuario = database_name || '_app' AND db_senha_cifrada IS NOT NULL));
  END IF;
END $$;
