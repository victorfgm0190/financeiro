-- ============================================================================================
-- DIAGNÓSTICO / LIMPEZA — Etapas A (tx_gerA_) criadas para PARCELAS 2..N
-- ⚠️  NÃO EXECUTAR AUTOMATICAMENTE. Rode os SELECTs, revise os IDs e só então remova manualmente.
--
-- Contexto: o commit 1cf4871 passou a criar etapa A imediata para lançamentos G À VISTA em
-- faturas futuras. Parcelas 2..N de uma série NÃO deveriam receber etapa A imediata (vão para o
-- Executar Gerenciais). A correção no código (reconcileFaturaState) exclui parcelas identificadas
-- por installment_num > 1, parent_tx_id IS NOT NULL ou origin = 'parcela'.
--
-- IMPORTANTE (achado na base real): as etapas A erradas para faturas FUTURAS (ago/set/...) têm
-- despesa de origem com installment_num = NULL, parent_tx_id = NULL e origin = 'manual', e a
-- descrição NÃO tem o marcador "NN/MM" (parcelas malformadas, importadas sem o sufixo). Por isso
-- a QUERY 1 (critério do enunciado) NÃO encontra essas — use também a QUERY 2 (heurística por irmã).
-- A etapa A tem id 'tx_gerA_<id_da_despesa>'; substring(a.id from 9) remove o prefixo 'tx_gerA_'.
-- ============================================================================================


-- ── QUERY 1 — Parcelas 2..N IDENTIFICADAS por coluna (installment_num>1 / parent_tx_id / origin)
-- Pega séries com marcador detectado (installment_num>1) e parcelas criadas por criarParcelasGerencial.
SELECT a.id            AS etapa_a_id,
       a.date          AS etapa_a_date,
       a.amount,
       e.id            AS despesa_id,
       e.installment_num,
       e.parent_tx_id,
       e.origin,
       e.fatura_month_year,
       e.description
FROM lancamentos a
JOIN lancamentos e ON e.id = substring(a.id FROM 9)
WHERE a.id LIKE 'tx_gerA_%'
  AND a.type = 'transfer'
  AND (e.installment_num > 1 OR e.parent_tx_id IS NOT NULL OR e.origin = 'parcela')
ORDER BY a.date, a.id;


-- ── QUERY 2 — Parcelas 2..N MALFORMADAS (sem marcador / installment_num NULL) — heurística
-- A despesa de origem não tem marcador nem installment_num, MAS existe uma "irmã" no MESMO cartão
-- cuja descrição começa com a mesma base e termina com "NN/MM" (ou seja, é a mesma série). São as
-- etapas A erradas em faturas futuras que a QUERY 1 não pega. Revise antes de remover.
SELECT a.id            AS etapa_a_id,
       a.date          AS etapa_a_date,
       a.amount,
       e.id            AS despesa_id,
       e.fatura_month_year,
       e.description
FROM lancamentos a
JOIN lancamentos e ON e.id = substring(a.id FROM 9)
WHERE a.id LIKE 'tx_gerA_%'
  AND a.type = 'transfer'
  AND e.type = 'expense'
  AND e.installment_num IS NULL
  AND e.description !~ '\d{1,2}/\d{1,2}'            -- a própria descrição NÃO tem marcador
  AND EXISTS (
        SELECT 1 FROM lancamentos s
        WHERE s.account_id = e.account_id
          AND s.id <> e.id
          AND s.installment_num IS NOT NULL
          AND s.description LIKE e.description || '%'   -- irmã começa com a mesma base ('*' é literal no LIKE)
          AND s.description ~ '\d{1,2}/\d{1,2}\s*$'     -- e termina com marcador "NN/MM"
      )
ORDER BY a.date, a.id;


-- ── QUERY 3 — (apoio) Só os IDs das etapas A das QUERY 1 + QUERY 2, para montar o DELETE manual.
SELECT a.id AS etapa_a_id_para_remover
FROM lancamentos a
JOIN lancamentos e ON e.id = substring(a.id FROM 9)
WHERE a.id LIKE 'tx_gerA_%' AND a.type = 'transfer'
  AND (
        e.installment_num > 1 OR e.parent_tx_id IS NOT NULL OR e.origin = 'parcela'
        OR (
          e.installment_num IS NULL AND e.description !~ '\d{1,2}/\d{1,2}'
          AND EXISTS (
            SELECT 1 FROM lancamentos s
            WHERE s.account_id = e.account_id AND s.id <> e.id
              AND s.installment_num IS NOT NULL
              AND s.description LIKE e.description || '%'
              AND s.description ~ '\d{1,2}/\d{1,2}\s*$'
          )
        )
      )
ORDER BY a.date;


-- ── REMOÇÃO MANUAL (modelo — descomente e revise os IDs antes) ──────────────────────────────
-- Atenção: parcelas 2..N do CICLO ATUAL podem ter etapa A LEGÍTIMA. Confira etapa_a_date /
-- fatura_month_year e remova só as de faturas FUTURAS (ou conforme sua revisão). Após remover,
-- recalcule o saldo da subconta Ger. (botão Recalcular / reconciliar gerencial no app).
--
-- DELETE FROM lancamentos WHERE id IN (
--   'tx_gerA_...',   -- cole aqui os IDs revisados das QUERY 1/2/3
--   'tx_gerA_...'
-- );
