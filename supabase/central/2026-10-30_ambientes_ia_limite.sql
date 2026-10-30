-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- LIMITE DIÁRIO DO ASSISTENTE IA por cliente (por usuário, por dia). Aplicar com:
--   node --env-file=.env.local scripts/migrar-central.js
-- Padrão 100 pedidos/dia, dos quais até 30 com imagem. Editado no Controle de Clientes. Sem estas
-- colunas o /api/assistente usa o padrão (src/lib/assistente/limiteIa.js).
-- ════════════════════════════════════════════════════════════════════════════════════════════════
ALTER TABLE ambientes ADD COLUMN IF NOT EXISTS ia_limite_diario INTEGER NOT NULL DEFAULT 100;
ALTER TABLE ambientes ADD COLUMN IF NOT EXISTS ia_limite_imagem INTEGER NOT NULL DEFAULT 30;
