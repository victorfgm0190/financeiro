-- Deixa os ambientes iguais: tabelas de ajuda que nasciam na primeira chamada de /api/boas-vindas e os
-- índices de ia_* que faltavam em ambientes criados antes de entrarem na estrutura base.
-- Idempotente. Não altera nenhum dado existente: só cria o que falta.
CREATE TABLE IF NOT EXISTS boas_vindas_usuario (
  user_id TEXT PRIMARY KEY,
  tour_visto_em TIMESTAMPTZ,
  checklist_oculto_em TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE boas_vindas_usuario ADD COLUMN IF NOT EXISTS guias_ligados BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE boas_vindas_usuario ADD COLUMN IF NOT EXISTS ajuda_campos BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE boas_vindas_usuario ADD COLUMN IF NOT EXISTS jornada_ligada BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE boas_vindas_usuario ADD COLUMN IF NOT EXISTS progresso JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS guia_telas_ocultas (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  tela_id TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, tela_id)
);

-- Um IF por tabela: uma condição só seria analisada inteira, e falharia em banco sem alguma delas.
DO $$
BEGIN
  IF to_regclass('ia_pre_lancamentos') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_ia_pre_lanc_status ON ia_pre_lancamentos (status);
  END IF;
  IF to_regclass('ia_uso') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_ia_uso_created ON ia_uso (created_at);
  END IF;
  IF to_regclass('ia_apelidos') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_ia_apelidos_tipo_termo ON ia_apelidos (tipo, termo);
  END IF;
END $$;
