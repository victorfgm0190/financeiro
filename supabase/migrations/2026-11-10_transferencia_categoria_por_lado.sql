-- Transferência entre perfis: categoria por LADO (perfil da conta de origem / perfil da conta de destino).
-- As colunas antigas categoria_cnpj_id / categoria_cpf_id (por tipo de perfil) não distinguem os dois lados
-- quando os perfis são do mesmo tipo (CPF→CPF, CNPJ→CNPJ). Elas continuam existindo e sendo gravadas quando
-- os tipos são diferentes (compatibilidade). Aditiva e idempotente: não altera nenhum dado existente.
-- O preenchimento das colunas novas a partir das antigas (backfill) é um passo separado, com prévia:
-- supabase/backfill/2026-11-10_transferencia_categoria_por_lado.sql.
ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS categoria_origem_id TEXT;
ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS categoria_destino_id TEXT;
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS categoria_origem_id TEXT;
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS categoria_destino_id TEXT;
