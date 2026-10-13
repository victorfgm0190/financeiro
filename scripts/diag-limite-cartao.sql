-- Diagnóstico do "Limite Disponível" / "Dívida Total" de um cartão (SOMENTE SELECT).
-- Uma linha por fatura (YYYY-MM). A chave da fatura é fatura_month_year; sem ela, deriva da
-- date pelo closing_day (mesma regra do txBillKey do CreditCardPanel). Os lançamentos do
-- cartão casam por account_id (card_id costuma vir NULL).
-- Troque o filtro do cartão em `card` se o nome/apelido for outro.

WITH card AS (
  SELECT id, name, closing_day, credit_limit, credit_debt
  FROM contas
  WHERE type = 'credit' AND (name ILIKE '%itaupers%' OR apelido ILIKE '%itaupers%')
),
tx AS (
  SELECT l.*,
    COALESCE(l.fatura_month_year, to_char(
      CASE WHEN EXTRACT(DAY FROM l.date::date) <= COALESCE(c.closing_day, 1)
           THEN l.date::date ELSE l.date::date + INTERVAL '1 month' END, 'YYYY-MM')) AS fat,
    -- Projeção de parcela 2..N (ainda não confirmada pela importação): sem date_cartao.
    ((COALESCE(l.installment_num, 0) > 1 OR l.parent_tx_id IS NOT NULL
      OR l.origin IN ('parcela_gerada', 'parcela')) AND l.date_cartao IS NULL) AS projecao
  FROM lancamentos l JOIN card c ON l.account_id = c.id
  WHERE l.type IN ('expense', 'income')
),
lanc AS (
  SELECT fat,
    SUM(amount) FILTER (WHERE type = 'expense' AND NOT projecao AND origin <> 'agendamento_auto') AS desp_reais,
    SUM(amount) FILTER (WHERE type = 'expense' AND projecao)                                    AS desp_parc_futuras,
    SUM(amount) FILTER (WHERE type = 'expense' AND origin = 'agendamento_auto' AND NOT projecao) AS desp_de_agendamento,
    SUM(amount) FILTER (WHERE type = 'income')                                                  AS estornos,
    COUNT(*)                                                                                    AS qtd
  FROM tx GROUP BY fat
),
pag AS (
  -- credit_payment do cartão (fatura_month_year; senão o mês da data) + transferência vinculada.
  SELECT COALESCE(l.fatura_month_year, substr(l.date::text, 1, 7)) AS fat, SUM(l.amount) AS pago_real
  FROM lancamentos l JOIN card c ON l.account_id = c.id
  WHERE l.type = 'credit_payment'
  GROUP BY 1
  UNION ALL
  SELECT l.fatura_month_year, SUM(l.amount)
  FROM lancamentos l JOIN card c ON l.to_account_id = c.id
  WHERE l.type = 'transfer' AND l.fatura_month_year IS NOT NULL
  GROUP BY 1
),
pag_fat AS (SELECT fat, SUM(pago_real) AS pago_real FROM pag GROUP BY fat),
pag_ag AS (
  -- Pagamento "abstrato": agendamento pagamento_fatura com ocorrências registradas.
  SELECT s.fatura_mes_ano AS fat,
    SUM(jsonb_array_length(COALESCE(s.registered, '[]'::jsonb)) * s.amount) AS pago_agendado
  FROM agendamentos s JOIN card c ON s.card_id = c.id
  WHERE s.tipo = 'pagamento_fatura'
  GROUP BY 1
),
fech AS (SELECT faturas_fechadas FROM configuracoes WHERE id = 1),
base AS (
  SELECT f.fat,
    COALESCE(l.qtd, 0) AS qtd,
    COALESCE(l.desp_reais, 0) AS desp_reais,
    COALESCE(l.desp_parc_futuras, 0) AS desp_parc_futuras,
    COALESCE(l.desp_de_agendamento, 0) AS desp_de_agendamento,
    COALESCE(l.estornos, 0) AS estornos,
    COALESCE(p.pago_real, 0) AS pago_real,
    COALESCE(a.pago_agendado, 0) AS pago_agendado,
    (SELECT faturas_fechadas ? ((SELECT id FROM card) || '_' || f.fat) FROM fech) AS fechada
  FROM (SELECT fat FROM lanc UNION SELECT fat FROM pag_fat UNION SELECT fat FROM pag_ag) f
  LEFT JOIN lanc l USING (fat) LEFT JOIN pag_fat p USING (fat) LEFT JOIN pag_ag a USING (fat)
)
SELECT fat AS fatura, qtd,
  round(desp_reais, 2) AS desp_reais,
  round(desp_parc_futuras, 2) AS parc_futuras,
  round(desp_de_agendamento, 2) AS de_agendamento,
  round(estornos, 2) AS estornos,
  round(desp_reais + desp_parc_futuras + desp_de_agendamento - estornos, 2) AS total_fatura,
  round(pago_real, 2) AS pago_real,
  round(pago_agendado, 2) AS pago_agendado,
  -- Mesma prevalência do painel: havendo pagamento real, ignora o agendado.
  round(GREATEST(0, (desp_reais + desp_parc_futuras + desp_de_agendamento - estornos)
    - CASE WHEN pago_real > 0 THEN pago_real ELSE pago_agendado END), 2) AS em_aberto,
  CASE
    WHEN (desp_reais + desp_parc_futuras + desp_de_agendamento - estornos) <= 0 THEN 'vazia'
    WHEN CASE WHEN pago_real > 0 THEN pago_real ELSE pago_agendado END
         >= (desp_reais + desp_parc_futuras + desp_de_agendamento - estornos) - 0.005 THEN 'paga'
    WHEN CASE WHEN pago_real > 0 THEN pago_real ELSE pago_agendado END > 0 THEN 'parcial'
    ELSE 'aberta'
  END AS status,
  fechada
FROM base
ORDER BY fat;

-- Totais de conferência (rode separado): credit_debt gravado x soma bruta dos lançamentos.
-- SELECT c.credit_limit, c.credit_debt,
--   SUM(l.amount) FILTER (WHERE l.type = 'expense')        AS despesas,
--   SUM(l.amount) FILTER (WHERE l.type = 'income')         AS estornos,
--   SUM(l.amount) FILTER (WHERE l.type = 'credit_payment') AS credit_payments,
--   (SELECT SUM(amount) FROM lancamentos t WHERE t.type = 'transfer' AND t.to_account_id = c.id
--      AND t.fatura_month_year IS NOT NULL)                AS transf_vinculadas,
--   (SELECT SUM(amount) FROM lancamentos t WHERE t.type = 'transfer' AND t.to_account_id = c.id
--      AND t.fatura_month_year IS NULL)                    AS transf_sem_fatura
-- FROM contas c LEFT JOIN lancamentos l ON l.account_id = c.id
-- WHERE c.type = 'credit' AND (c.name ILIKE '%itaupers%' OR c.apelido ILIKE '%itaupers%')
-- GROUP BY c.id, c.credit_limit, c.credit_debt;
