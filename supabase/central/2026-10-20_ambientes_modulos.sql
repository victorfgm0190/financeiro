-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- MÓDULOS POR AMBIENTE (plano comercial). Aplicar com: node --env-file=.env.local scripts/migrar-central.js
--
-- modulos: { "<modulo>": true } — módulos opcionais ligados para o ambiente (hoje: "contratos").
-- Vai no token do login e em req.ambiente (api/_central.js SQL_AMBIENTE); src/lib/permissoes.js
-- (MODULOS_DE_PLANO) esconde e bloqueia o módulo desligado. Ambiente novo nasce sem nenhum.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
ALTER TABLE ambientes ADD COLUMN IF NOT EXISTS modulos JSONB NOT NULL DEFAULT '{}'::jsonb;
