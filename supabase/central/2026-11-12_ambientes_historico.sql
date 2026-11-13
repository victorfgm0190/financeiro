-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- HISTÓRICO POR AMBIENTE (quem e quando) — recursos contratados liberados/retirados pelo administrador
-- da plataforma (ambientes.modulos, src/lib/recursosCliente.js). O plataforma_historico exige um
-- cliente; o ambiente principal (e qualquer ambiente sem cliente_id) registra aqui. Ambiente com
-- cliente registra nos dois. Aditiva. Aplicar com: node --env-file=.env.local scripts/migrar-central.js
-- ════════════════════════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ambientes_historico (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  ambiente_id TEXT NOT NULL REFERENCES ambientes(id) ON DELETE CASCADE,
  evento TEXT NOT NULL,
  detalhe TEXT,
  autor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ambientes_historico_ambiente ON ambientes_historico (ambiente_id, created_at);
