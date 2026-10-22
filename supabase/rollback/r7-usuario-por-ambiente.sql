-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK do R7 (usuário Postgres próprio por ambiente) — docs/grafity-2026-10.md §5.5
-- O mesmo que `node --env-file=.env.local scripts/db-usuario-ambiente.js rollback <database>`.
-- Rodar como neondb_owner. Trocar X pelo database (ex.: cliente_teste1) e X_app pelo papel.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- 0) PRIMEIRO o app volta ao neondb_owner (≤ 30 s de cache por instância; pools novos já usam o fallback).
--    No banco CENTRAL (finup_central):
UPDATE ambientes SET db_usuario = NULL, db_senha_cifrada = NULL, updated_at = now() WHERE database_name = 'X';
--    Para o próprio central (Fase 3): antes de tudo, CENTRAL_DATABASE_URL de volta para o neondb_owner na Vercel.

-- 1) Conectado no banco X:
BEGIN;
ALTER DATABASE X OWNER TO neondb_owner;   -- já é dele no desenho atual; vale para bancos do desenho antigo
REASSIGN OWNED BY X_app TO neondb_owner;   -- seguro AQUI: X_app só possui as tabelas do próprio banco
GRANT CONNECT ON DATABASE X TO PUBLIC;
DROP OWNED BY X_app;                       -- privilégios restantes (CONNECT, USAGE/CREATE no schema public)
DROP ROLE X_app;
COMMIT;

-- 2) Se for desfazer também o fechamento dos outros bancos (Fase 2 revogou PUBLIC em neondb e
--    finup_central), conectado em cada um:
-- GRANT CONNECT ON DATABASE neondb TO PUBLIC;
-- GRANT CONNECT ON DATABASE finup_central TO PUBLIC;

-- NUNCA usar REASSIGN OWNED BY neondb_owner: ele também transfere os databases (neondb,
-- finup_central) que pertencem ao neondb_owner.
