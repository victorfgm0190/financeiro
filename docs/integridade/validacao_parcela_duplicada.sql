-- ============================================================================
-- Validação da regra PARCELA_DUPLICADA — SOMENTE LEITURA (só SELECT).
-- Reproduz em SQL a mesma lógica de src/lib/integridade/regras.js para conferir
-- que o motor e o banco encontram os MESMOS casos.
--
-- Como usar: ajuste o `desde` abaixo (padrão do motor = 3 meses antes do mês
-- corrente; em 30/09/2026 → '2026-06') e rode no Neon SQL Editor.
-- Cada linha = uma parcela SOBRANDO (origem_id da pendência), ao lado da que fica.
--
-- Critério (idêntico ao motor):
--   • gasto de cartão: type='expense', conta (card_id ou account_id) com type='credit',
--     fora de automação (reserva_auto / origin gerencial/invest/patrimônio) e de espelho;
--   • fatura: fatura_month_year → fatura_ref (MM/AAAA) → data × dia de fechamento;
--   • parcela N/M: colunas installment_num/total, senão o "N/M" da descrição;
--   • compra = serie_id, ou cartão | base normalizada | M | centavos | início da série
--     (fatura − (N−1) meses) | ocorrência (#2… das gêmeas legítimas);
--   • duplicata = mesma compra + mesmo N exibido + mesmo N REAL. N real = o da
--     descrição original do banco, que a importação grava em PAYEE (favorecido — a
--     linha cinza sob a descrição na fatura), quando ela traz "N/M" da mesma base;
--     se a original diz outra parcela, é compra nova → NÃO é duplicata. Exceção:
--     favorecido com N MENOR e mesmo M é herdado da linha que gerou a parcela
--     futura (importação copia o payee da base) → vale o N exibido;
--   • a que FICA é a confirmada (com date_cartao) mais antiga; as outras sobram.
-- ============================================================================
WITH params AS (
  SELECT '2026-06'::text AS desde
),
padrao AS (
  SELECT '(?<![0-9])([0-9]{1,2})/([0-9]{1,2})(?![0-9])'::text AS re
),
gastos AS (
  SELECT l.*,
         COALESCE(cc.id, ca.id)                                  AS cartao_id,
         COALESCE(NULLIF(COALESCE(cc.closing_day, ca.closing_day), 0), 14) AS fechamento
    FROM lancamentos l
    LEFT JOIN contas cc ON cc.id = l.card_id    AND cc.type = 'credit'
    LEFT JOIN contas ca ON ca.id = l.account_id AND ca.type = 'credit'
   WHERE l.type = 'expense'
     AND COALESCE(cc.id, ca.id) IS NOT NULL
     AND NOT COALESCE(l.reserva_auto, false)
     AND NOT COALESCE(l.is_espelho, false)
     AND COALESCE(l.origin, 'manual') NOT IN
         ('gerencial_auto', 'auto-provisao', 'invest_auto', 'investAuto', 'patrimonio_auto', 'patrimonioAuto')
),
com_fatura AS (
  SELECT g.*,
         CASE
           WHEN g.fatura_month_year ~ '^\d{4}-\d{2}$' THEN g.fatura_month_year
           WHEN g.fatura_ref ~ '^\d{2}/\d{4}$' THEN SUBSTRING(g.fatura_ref, 4, 4) || '-' || SUBSTRING(g.fatura_ref, 1, 2)
           WHEN g.date ~ '^\d{4}-\d{2}-\d{2}' THEN
             TO_CHAR(
               DATE_TRUNC('month', SUBSTRING(g.date, 1, 10)::date)
               + CASE WHEN EXTRACT(DAY FROM SUBSTRING(g.date, 1, 10)::date) <= g.fechamento
                      THEN INTERVAL '0 month' ELSE INTERVAL '1 month' END,
               'YYYY-MM')
         END AS fatura,
         regexp_match(g.description, (SELECT re FROM padrao)) AS m_desc,
         regexp_match(COALESCE(g.payee, ''), (SELECT re FROM padrao)) AS m_orig
    FROM gastos g
),
det AS (
  SELECT c.*,
         -- "N/M" da descrição só vale se for parcela válida (1 ≤ N ≤ M, 2 ≤ M ≤ 99)
         CASE WHEN c.m_desc IS NOT NULL AND c.m_desc[1]::int >= 1 AND c.m_desc[2]::int >= 2
                   AND c.m_desc[1]::int <= c.m_desc[2]::int AND c.m_desc[2]::int <= 99
              THEN c.m_desc END AS md,
         CASE WHEN c.m_orig IS NOT NULL AND c.m_orig[1]::int >= 1 AND c.m_orig[2]::int >= 2
                   AND c.m_orig[1]::int <= c.m_orig[2]::int AND c.m_orig[2]::int <= 99
              THEN c.m_orig END AS mo
    FROM com_fatura c
   WHERE c.fatura IS NOT NULL
),
parcelas AS (
  SELECT d.*,
         COALESCE(d.installment_num,   d.md[1]::int) AS num,
         COALESCE(d.installment_total, d.md[2]::int) AS total,
         lower(regexp_replace(regexp_replace(
           CASE WHEN d.md IS NOT NULL THEN regexp_replace(d.description, (SELECT re FROM padrao), '')
                ELSE COALESCE(d.description, '') END,
           '^\s+|\s+$', '', 'g'), '\s+', ' ', 'g')) AS base,
         lower(regexp_replace(regexp_replace(
           regexp_replace(COALESCE(d.payee, ''), (SELECT re FROM padrao), ''),
           '^\s+|\s+$', '', 'g'), '\s+', ' ', 'g')) AS base_orig
    FROM det d
),
identidade AS (
  SELECT p.*,
         CASE WHEN p.mo IS NOT NULL AND (p.base_orig = '' OR p.base_orig = p.base)
                   AND NOT (p.mo[1]::int < p.num AND p.mo[2]::int = p.total)
              THEN p.mo[1]::int ELSE p.num END AS num_real,
         p.cartao_id || '|' || p.base || '|' || p.total || '|' || ROUND(p.amount * 100)::bigint || '|' ||
           TO_CHAR((p.fatura || '-01')::date - ((p.num - 1) || ' month')::interval, 'YYYY-MM') ||
           CASE WHEN COALESCE(p.installment_occurrence, 1) > 1 THEN '#' || p.installment_occurrence ELSE '' END
           AS chave_inicio
    FROM parcelas p
   WHERE p.num IS NOT NULL AND p.total IS NOT NULL
),
grupos AS (
  SELECT i.*,
         COALESCE('serie:' || i.serie_id, 'compra:' || i.chave_inicio) || '|' || i.chave_inicio
           || '|' || i.num || '|' || i.num_real AS grupo,
         ROW_NUMBER() OVER (
           PARTITION BY COALESCE('serie:' || i.serie_id, 'compra:' || i.chave_inicio), i.chave_inicio, i.num, i.num_real
           ORDER BY (i.date_cartao IS NOT NULL) DESC, i.created_at ASC, i.id ASC) AS ordem,
         COUNT(*) OVER (
           PARTITION BY COALESCE('serie:' || i.serie_id, 'compra:' || i.chave_inicio), i.chave_inicio, i.num, i.num_real) AS qtd
    FROM identidade i
)
SELECT s.id              AS origem_id_sobra,
       o.id              AS id_que_fica,
       s.cartao_id,
       s.fatura,
       s.description     AS descricao,
       s.num || '/' || s.total AS parcela,
       s.num_real        AS parcela_real,
       s.amount          AS valor,
       s.date_cartao     AS data_cartao_sobra,
       o.date_cartao     AS data_cartao_fica,
       s.payee           AS favorecido_descricao_original,
       s.qtd
  FROM grupos s
  JOIN grupos o ON o.grupo = s.grupo AND o.ordem = 1
 WHERE s.ordem > 1
   AND o.fatura >= (SELECT desde FROM params)
 ORDER BY s.cartao_id, s.fatura, s.description, s.id;
