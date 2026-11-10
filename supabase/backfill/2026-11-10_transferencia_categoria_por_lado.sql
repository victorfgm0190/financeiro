-- Backfill das colunas categoria_origem_id / categoria_destino_id (migração
-- 2026-11-10_transferencia_categoria_por_lado.sql) a partir das antigas categoria_cnpj_id / categoria_cpf_id.
-- Só transferências entre perfis de TIPOS DIFERENTES (CPF↔CNPJ): a regra é exata — cada lado recebe a
-- coluna do tipo do seu perfil (PJ → categoria_cnpj_id; os demais → categoria_cpf_id), a mesma que o app
-- lia antes. Só linhas com as duas colunas novas vazias: rodar de novo não muda nada.
-- Mesmo tipo (CPF→CPF, CNPJ→CNPJ): NÃO preenche (as antigas não dizem qual lado é qual) — ver a consulta 3.
-- Ajustes por ocorrência dos agendamentos (overrides, JSON) não são tocados: o app lê as chaves antigas
-- deles pelo tipo de cada lado.
--
-- Ordem: rode 1 e 3 (prévia), confira, e só então 2, numa transação. App fechado durante o UPDATE.

-- ── 1. PRÉVIA: quantas linhas cada UPDATE vai preencher ────────────────────────────────────────────
SELECT 'lancamentos' AS tabela, COUNT(*) AS vai_preencher
  FROM lancamentos l
  JOIN contas cf ON cf.id = l.account_id   JOIN perfis pf ON pf.id = cf.profile_id
  JOIN contas ct ON ct.id = l.to_account_id JOIN perfis pt ON pt.id = ct.profile_id
 WHERE l.type = 'transfer' AND cf.profile_id <> ct.profile_id
   AND (pf.type = 'pj') <> (pt.type = 'pj')
   AND l.categoria_origem_id IS NULL AND l.categoria_destino_id IS NULL
   AND (l.categoria_cnpj_id IS NOT NULL OR l.categoria_cpf_id IS NOT NULL)
UNION ALL
SELECT 'agendamentos', COUNT(*)
  FROM agendamentos a
  JOIN contas cf ON cf.id = a.account_id   JOIN perfis pf ON pf.id = cf.profile_id
  JOIN contas ct ON ct.id = a.to_account_id JOIN perfis pt ON pt.id = ct.profile_id
 WHERE a.transaction_type = 'transfer' AND cf.profile_id <> ct.profile_id
   AND (pf.type = 'pj') <> (pt.type = 'pj')
   AND a.categoria_origem_id IS NULL AND a.categoria_destino_id IS NULL
   AND (a.categoria_cnpj_id IS NOT NULL OR a.categoria_cpf_id IS NOT NULL);

-- ── 2. UPDATE (só depois de conferir a prévia) ─────────────────────────────────────────────────────
BEGIN;
UPDATE lancamentos l
   SET categoria_origem_id  = CASE WHEN pf.type = 'pj' THEN l.categoria_cnpj_id ELSE l.categoria_cpf_id END,
       categoria_destino_id = CASE WHEN pt.type = 'pj' THEN l.categoria_cnpj_id ELSE l.categoria_cpf_id END
  FROM contas cf, perfis pf, contas ct, perfis pt
 WHERE cf.id = l.account_id AND pf.id = cf.profile_id AND ct.id = l.to_account_id AND pt.id = ct.profile_id
   AND l.type = 'transfer' AND cf.profile_id <> ct.profile_id
   AND (pf.type = 'pj') <> (pt.type = 'pj')
   AND l.categoria_origem_id IS NULL AND l.categoria_destino_id IS NULL
   AND (l.categoria_cnpj_id IS NOT NULL OR l.categoria_cpf_id IS NOT NULL);
UPDATE agendamentos a
   SET categoria_origem_id  = CASE WHEN pf.type = 'pj' THEN a.categoria_cnpj_id ELSE a.categoria_cpf_id END,
       categoria_destino_id = CASE WHEN pt.type = 'pj' THEN a.categoria_cnpj_id ELSE a.categoria_cpf_id END
  FROM contas cf, perfis pf, contas ct, perfis pt
 WHERE cf.id = a.account_id AND pf.id = cf.profile_id AND ct.id = a.to_account_id AND pt.id = ct.profile_id
   AND a.transaction_type = 'transfer' AND cf.profile_id <> ct.profile_id
   AND (pf.type = 'pj') <> (pt.type = 'pj')
   AND a.categoria_origem_id IS NULL AND a.categoria_destino_id IS NULL
   AND (a.categoria_cnpj_id IS NOT NULL OR a.categoria_cpf_id IS NOT NULL);
COMMIT;

-- ── 3. Mesmo tipo com categoria antiga (NÃO preenchidas: revisar à mão) ────────────────────────────
SELECT 'lancamentos' AS tabela, l.id, l.date, pf.type AS de, pt.type AS para
  FROM lancamentos l
  JOIN contas cf ON cf.id = l.account_id   JOIN perfis pf ON pf.id = cf.profile_id
  JOIN contas ct ON ct.id = l.to_account_id JOIN perfis pt ON pt.id = ct.profile_id
 WHERE l.type = 'transfer' AND cf.profile_id <> ct.profile_id AND (pf.type = 'pj') = (pt.type = 'pj')
   AND (l.categoria_cnpj_id IS NOT NULL OR l.categoria_cpf_id IS NOT NULL)
UNION ALL
SELECT 'agendamentos', a.id, a.start_date, pf.type, pt.type
  FROM agendamentos a
  JOIN contas cf ON cf.id = a.account_id   JOIN perfis pf ON pf.id = cf.profile_id
  JOIN contas ct ON ct.id = a.to_account_id JOIN perfis pt ON pt.id = ct.profile_id
 WHERE a.transaction_type = 'transfer' AND cf.profile_id <> ct.profile_id AND (pf.type = 'pj') = (pt.type = 'pj')
   AND (a.categoria_cnpj_id IS NOT NULL OR a.categoria_cpf_id IS NOT NULL);
