-- ============================================================
-- NÍVEIS DE ACESSO — evolução da tabela usuarios da Etapa 1 (2026-10-14_usuarios.sql)
-- Idempotente: pode rodar mais de uma vez.
--
-- Mapeamento com os nomes já existentes (mantidos para não quebrar o que está no ar):
--   usuario       → coluna username (já minúscula, UNIQUE)
--   ultimo_acesso → coluna ultimo_login
--   criado_em     → coluna created_at      atualizado_em → coluna updated_at
-- O nível passa a morar em usuarios.nivel; membros.papel fica só como legado (vínculo com a
-- organização), sem uso nas permissões.
-- ============================================================

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS nivel TEXT NOT NULL DEFAULT 'consulta';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS permissoes JSONB DEFAULT '{}'::jsonb;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS perfis_permitidos JSONB DEFAULT '"todos"'::jsonb;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS trocar_senha BOOLEAN DEFAULT false;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS criado_por TEXT;
ALTER TABLE usuarios ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE usuarios ALTER COLUMN updated_at SET DEFAULT now();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_nivel_check') THEN
    ALTER TABLE usuarios ADD CONSTRAINT usuarios_nivel_check
      CHECK (nivel IN ('admin', 'operador', 'consulta', 'personalizado'));
  END IF;
END $$;

-- Nível a partir do papel antigo (só para quem ainda não foi migrado: nivel no padrão 'consulta'
-- e papel diferente de leitura).
UPDATE usuarios u SET nivel = CASE m.papel WHEN 'admin' THEN 'admin' WHEN 'usuario' THEN 'operador' ELSE 'consulta' END
  FROM membros m
 WHERE m.usuario_id = u.id AND u.nivel = 'consulta' AND m.papel IN ('admin', 'usuario');

-- O dono do sistema é sempre administrador.
UPDATE usuarios SET nivel = 'admin' WHERE username = 'vmoreira' AND nivel <> 'admin';

-- E-mail guardado em minúsculo; nome e e-mail obrigatórios daqui em diante.
UPDATE usuarios SET email = lower(email) WHERE email <> lower(email);
UPDATE usuarios SET nome = username WHERE nome IS NULL OR btrim(nome) = '';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM usuarios WHERE email IS NULL) THEN
    ALTER TABLE usuarios ALTER COLUMN email SET NOT NULL;
  END IF;
END $$;
ALTER TABLE usuarios ALTER COLUMN nome SET NOT NULL;
