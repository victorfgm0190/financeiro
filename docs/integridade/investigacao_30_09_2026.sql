-- ============================================================================
-- Investigação do caso de 30/09/2026 (Fatura 10/2026 Itaupers, R$ 358,62) — SOMENTE LEITURA.
-- Rode cada bloco no Neon SQL Editor e me devolva o resultado.
-- ============================================================================

-- 1) Os dois gastos e todos os campos que decidem numeração, fatura e etapa A.
SELECT id, description, payee, notes, amount, date, date_cartao, fatura_month_year, fatura_ref,
       installment_num, installment_total, installment_occurrence, installment_key, serie_id,
       origin, parent_tx_id, grupo_gerencial, created_at
  FROM lancamentos
 WHERE id IN ('tx_1789736376094_z41mpw3eroa', 'tx_1789736376094_kvw8u5eevwc');

-- 2) A série inteira de cada compra (mesma descrição-base e valor, no mesmo cartão),
--    com a etapa A de cada parcela ao lado. Mostra qual numeração está certa por fatura.
SELECT l.id, l.description, l.payee, l.amount, l.date_cartao, l.date,
       COALESCE(l.fatura_month_year, l.fatura_ref) AS fatura,
       l.installment_num || '/' || l.installment_total AS parcela_colunas,
       l.serie_id, l.origin, l.created_at,
       (SELECT string_agg(e.id || ' R$' || e.amount || ' ' || COALESCE(e.fatura_ref, '—'), ' ; ')
          FROM lancamentos e
         WHERE e.type = 'transfer'
           AND (e.source_expense_id = l.id OR e.id = 'tx_gerA_' || l.id OR e.parent_tx_id = l.id)) AS etapas_a
  FROM lancamentos l
 WHERE l.type = 'expense'
   AND (l.description ILIKE 'Jim.com%60278703%' OR l.description ILIKE 'Farmacias Sao Joao%')
 ORDER BY l.description ~* 'farm', COALESCE(l.fatura_month_year, l.fatura_ref), l.created_at;

-- 3) O que mais foi criado no mesmo lote (mesmo timestamp no id → mesma importação).
--    Se aparecer um "Jim.com… 1/3" aqui, os 3/3 são as parcelas futuras GERADAS a partir dele
--    (herdam o payee da linha base) — e a pergunta vira: onde foi parar esse 1/3?
SELECT id, description, payee, amount, date, date_cartao, fatura_month_year, installment_num, installment_total,
       origin, grupo_gerencial
  FROM lancamentos
 WHERE id LIKE 'tx_1789736376094_%'
 ORDER BY id;

-- 4) Cartão e ciclo financeiro: decidem se a fatura 10/2026 era "ciclo atual" ou "futuro"
--    para o reconcileFaturaState (etapa A só é materializada no ciclo atual).
SELECT id, name, apelido, closing_day, due_day FROM contas WHERE type = 'credit' AND (apelido ILIKE 'itaupers%' OR name ILIKE '%person%');
SELECT * FROM configuracoes WHERE id = 1;

-- 5) Agendamentos geridos da fatura 10/2026 do cartão (devolução / resgates / pagamento).
SELECT s.id, s.tipo, s.amount, s.registered, s.confirmado, s.source_expense_ids
  FROM agendamentos s
  JOIN contas c ON c.id = s.card_id
 WHERE s.fatura_mes_ano = '2026-10' AND (c.apelido ILIKE 'itaupers%' OR c.name ILIKE '%person%')
 ORDER BY s.tipo, s.id;
