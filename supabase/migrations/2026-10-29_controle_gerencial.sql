-- CONTROLE GERENCIAL OPCIONAL (chave do ambiente, Configurações › Cadastros › Controle gerencial).
-- Ambiente existente: LIGADO se o gerencial está em uso (lançamento/agendamento com grupo
-- gerencial G/numerado, ou subconta gerencial); senão DESLIGADO. Cliente novo: o kit básico
-- (api/_kitBasico.js) cria a linha de configuracoes já com controle_gerencial = false — a migração
-- roda antes do kit e NÃO cria a linha (o kit usa ON CONFLICT DO NOTHING).
-- Só preenche quando ainda está vazio (rodar de novo não desfaz a escolha do usuário).
ALTER TABLE configuracoes ADD COLUMN IF NOT EXISTS controle_gerencial BOOLEAN;
UPDATE configuracoes SET controle_gerencial = (
     EXISTS (SELECT 1 FROM lancamentos l JOIN reservas_funcoes g ON g.id = l.grupo_gerencial
              WHERE g.number IS DISTINCT FROM '"D"'::jsonb)
  OR EXISTS (SELECT 1 FROM agendamentos a JOIN reservas_funcoes g ON g.id = a.grupo_gerencial
              WHERE g.number IS DISTINCT FROM '"D"'::jsonb)
  OR EXISTS (SELECT 1 FROM contas WHERE type = 'gerencial' OR is_gerencial)
) WHERE id = 1 AND controle_gerencial IS NULL;
