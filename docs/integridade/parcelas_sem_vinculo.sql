-- SOMENTE LEITURA — extensão do problema "parcela sem vínculo" (PARCELA_SEM_VINCULO).
--
-- Lista todo lançamento de cartão com "N/M" na descrição (ou só no favorecido, quando a base dele é a
-- própria descrição) e serie_id NULL, com a(s) série(s) candidata(s) de cada um — o mesmo critério
-- do Motor de Integridade (src/lib/integridade/regras.js, seriesDoContexto):
--   mesmo cartão + base normalizada da descrição + mesmo valor (centavos) + mesmo total M, e a
--   posição pela fatura (fatura − início da série + 1) cai num BURACO da série.
-- conflito = o número da descrição ≠ a posição pela fatura (caso Aramis: diz 1/4, é a 2/4).
-- Sem candidata, a linha sai com serie_candidata NULL (só informativo no motor).
--
-- Fatura do lançamento: fatura_month_year; sem ela, o mês de `date` (aproximação — o motor ainda
-- usa o dia de fechamento do cartão nesse caso raro).

WITH base AS (
  SELECT l.id, l.account_id, c.apelido AS cartao, l.description, l.payee, l.amount, l.origin,
         l.created_at, l.serie_id, l.installment_num, l.installment_total, l.installment_key,
         COALESCE(l.fatura_month_year, left(l.date::text, 7)) AS fatura,
         round(l.amount * 100)::bigint AS cents,
         regexp_match(l.description, '(^|[^0-9])([0-9]{1,2})/([0-9]{1,2})([^0-9]|$)') AS md,
         regexp_match(l.payee,       '(^|[^0-9])([0-9]{1,2})/([0-9]{1,2})([^0-9]|$)') AS mp
    FROM lancamentos l
    JOIN contas c ON c.id = l.account_id AND c.type = 'credit'
   WHERE l.type = 'expense'
),
parc AS (
  SELECT b.*,
         -- base normalizada = descrição sem o "N/M", espaços colapsados, minúsculas
         lower(trim(regexp_replace(
           CASE WHEN md IS NOT NULL
                THEN regexp_replace(description, '(^|[^0-9])[0-9]{1,2}/[0-9]{1,2}([^0-9]|$)', '\1\2')
                ELSE description END,
           '\s+', ' ', 'g'))) AS base_norm,
         lower(trim(regexp_replace(
           regexp_replace(COALESCE(payee, ''), '(^|[^0-9])[0-9]{1,2}/[0-9]{1,2}([^0-9]|$)', '\1\2'),
           '\s+', ' ', 'g'))) AS base_favorecido,
         COALESCE(installment_num,   (md)[2]::int, (mp)[2]::int) AS num,
         COALESCE(installment_total, (md)[3]::int, (mp)[3]::int) AS total,
         (md IS NULL AND installment_num IS NULL) AS via_favorecido
    FROM base b
   WHERE md IS NOT NULL OR mp IS NOT NULL OR installment_num IS NOT NULL
),
parc_ok AS (
  SELECT p.*,
         -- início da série desta parcela (fatura − (num − 1) meses), em YYYY-MM
         to_char(to_date(fatura, 'YYYY-MM') - make_interval(months => num - 1), 'YYYY-MM') AS inicio
    FROM parc p
   WHERE num BETWEEN 1 AND total AND total >= 2
     AND (NOT via_favorecido OR base_favorecido = base_norm)
),
series AS (
  SELECT serie_id, account_id, base_norm, total, cents,
         mode() WITHIN GROUP (ORDER BY inicio) AS inicio,
         array_agg(num ORDER BY num) AS nums,
         array_agg(id ORDER BY num) AS ids
    FROM parc_ok
   WHERE serie_id IS NOT NULL
   GROUP BY serie_id, account_id, base_norm, total, cents
),
soltos AS (
  SELECT * FROM parc_ok WHERE serie_id IS NULL
),
casamento AS (
  SELECT s.id, se.serie_id, se.nums, se.inicio AS inicio_serie,
         ( (split_part(s.fatura, '-', 1)::int * 12 + split_part(s.fatura, '-', 2)::int)
         - (split_part(se.inicio, '-', 1)::int * 12 + split_part(se.inicio, '-', 2)::int) ) + 1 AS posicao
    FROM soltos s
    JOIN series se
      ON se.account_id = s.account_id AND se.base_norm = s.base_norm
     AND se.total = s.total AND se.cents = s.cents
)
SELECT s.cartao, s.id, s.description, s.payee, s.amount, s.fatura,
       s.num || '/' || s.total                         AS parcela_descricao,
       s.origin, s.created_at, s.via_favorecido,
       c.serie_id                                      AS serie_candidata,
       c.posicao || '/' || s.total                     AS posicao_pela_fatura,
       (c.posicao <> s.num)                            AS conflito,
       c.nums                                          AS parcelas_na_serie,
       count(c.serie_id) OVER (PARTITION BY s.id)      AS qtd_candidatas,
       CASE
         WHEN c.serie_id IS NULL THEN 'sem candidata (informativo)'
         WHEN count(c.serie_id) OVER (PARTITION BY s.id) > 1 THEN 'aprovar (mais de uma série)'
         WHEN c.posicao <> s.num THEN 'aprovar (descrição × posição)'
         ELSE 'auto'
       END                                             AS correcao
  FROM soltos s
  LEFT JOIN casamento c
    ON c.id = s.id
   AND c.posicao BETWEEN 1 AND s.total
   AND NOT (c.posicao = ANY (c.nums))
 ORDER BY s.cartao, s.base_norm, s.fatura, s.id;

-- Resumo por tipo de correção:
-- (rode a consulta acima como subconsulta)
-- SELECT correcao, count(*) FROM ( <consulta acima> ) x GROUP BY correcao ORDER BY 2 DESC;
