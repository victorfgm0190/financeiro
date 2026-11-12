-- Correção de dados: categoria POR LADO nas transferências Lumen Tech (CNPJ) → Victor (CPF).
-- Base: revisão de 11/11/2026 (relatório local, não versionado). Pedido do Victor em 11/11/2026.
--
-- Perfis: Victor = prf_1780097966886 (CPF); Lumen Tech = prf_1780097998847 (CNPJ).
-- Escopo: lancamentos (type='transfer') e agendamentos (transaction_type='transfer') com a conta de
-- ORIGEM no perfil Lumen e a de DESTINO no perfil Victor, EXCETO destino na conta Pharma
-- (acc_1780099484563) — essas só são listadas (consulta 6), nada muda nelas.
--
-- Regra pela descrição normalizada (minúsculas, sem acento, só letras/números):
--   a) contém "distribuicao de lucros" → Victor = Distribuicao de Lucros (cat_rem_dlc), Lumen = Dividendos
--   b) contém "pro labore"             → Victor = Pró-labore (cat_rem_plb, criada no passo 1),
--                                        Lumen  = Pro labore (cat_1780977675127)
--   c) o resto                         → Victor = Trabalhos Extras (cat_rem_tex), Lumen = Dividendos
--   Dividendos do lado Lumen = cat_1780977754290 (a despesa "Dividendos" do grupo Lumen, a já usada).
--   Lado Victor: a regra vale mesmo se já houver categoria.
--   Lado Lumen: só onde está vazio — "vazio" = o que o app mostra hoje (categoriasDosLados em
--   src/lib/transferenciaPerfis.js: as colunas novas se alguma estiver preenchida, senão a antiga
--   categoria_cnpj_id). Quem já tem categoria continua com ela, agora gravada em categoria_origem_id
--   (sem isso, preencher só o destino apagaria o lado Lumen da tela).
--
-- Gravação = a mesma do app (categoriasEntrePerfis): categoria_origem_id / categoria_destino_id e, por
-- ser CNPJ→CPF, também categoria_cnpj_id (= origem) e categoria_cpf_id (= destino). Nenhum outro campo
-- muda. Ajustes por ocorrência dos agendamentos (overrides, JSON) não são tocados.
-- Histórico: uma linha por campo alterado em historico_alteracoes, lote 'backfill_2026-11-11_lumen_victor',
-- autor 'sistema', escopo 'parcela' (lançamento) / 'serie' (agendamento), serie_key como serieKeyDe().
--
-- Idempotente: a categoria nova entra com ON CONFLICT DO NOTHING; só linhas com alguma coluna diferente
-- do alvo mudam (e só elas geram histórico). Rodar de novo não muda nada.
--
-- Ordem: 0 (conferência) → 2 (dry-run) → 3 (antes, guardar) → 4 (aplicar, uma transação) → 5 e 6.
-- App fechado durante o passo 4. Reverter: passo 7 (usa valor_anterior do histórico do lote).

-- ── 0. CONFERÊNCIA ──────────────────────────────────────────────────────────────────────────────────
SELECT (SELECT COUNT(*) FROM perfis WHERE id IN ('prf_1780097966886', 'prf_1780097998847')) AS perfis_2,
       (SELECT COUNT(*) FROM contas WHERE id IN ('acc_cora', 'acc_1788795862566')
                                      AND profile_id = 'prf_1780097998847') AS contas_lumen_2,
       (SELECT COUNT(*) FROM categorias WHERE id IN ('cat_rem_dlc', 'cat_rem_tex', 'cat_1780977675127',
                                                     'cat_1780977754290')) AS categorias_4;

-- ── 1+2. ALVO (view temporária usada pelo dry-run e pela aplicação) ─────────────────────────────────
CREATE OR REPLACE TEMP VIEW lv_alvo AS
WITH base AS (
  SELECT 'lancamento'::text AS entidade, l.id, l.description, l.categoria_origem_id AS o,
         l.categoria_destino_id AS d, l.categoria_cnpj_id AS cnpj, l.categoria_cpf_id AS cpf,
         CASE WHEN l.serie_id IS NOT NULL THEN 'serie|' || l.serie_id
              WHEN l.installment_total IS NOT NULL THEN 'parcelado|' || COALESCE(l.parent_tx_id, l.id)
         END AS serie_key
    FROM lancamentos l
    JOIN contas cf ON cf.id = l.account_id    AND cf.profile_id = 'prf_1780097998847'
    JOIN contas ct ON ct.id = l.to_account_id AND ct.profile_id = 'prf_1780097966886'
   WHERE l.type = 'transfer' AND l.to_account_id <> 'acc_1780099484563'
  UNION ALL
  SELECT 'agendamento', a.id, a.description, a.categoria_origem_id, a.categoria_destino_id,
         a.categoria_cnpj_id, a.categoria_cpf_id, 'agendamento|' || a.id
    FROM agendamentos a
    JOIN contas cf ON cf.id = a.account_id    AND cf.profile_id = 'prf_1780097998847'
    JOIN contas ct ON ct.id = a.to_account_id AND ct.profile_id = 'prf_1780097966886'
   WHERE a.transaction_type = 'transfer' AND a.to_account_id <> 'acc_1780099484563'
), norm AS (
  SELECT b.*,
         TRIM(REGEXP_REPLACE(TRANSLATE(LOWER(COALESCE(b.description, '')),
              'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), '[^a-z0-9]+', ' ', 'g')) AS desc_norm,
         CASE WHEN b.o IS NOT NULL OR b.d IS NOT NULL THEN b.o ELSE b.cnpj END AS lumen_atual
    FROM base b
), regra AS (
  SELECT n.*,
         CASE WHEN n.desc_norm LIKE '%distribuicao de lucros%' THEN 'a'
              WHEN n.desc_norm LIKE '%pro labore%' THEN 'b' ELSE 'c' END AS regra
    FROM norm n
)
SELECT r.entidade, r.id, r.description, r.serie_key, r.regra, r.o, r.d, r.cnpj, r.cpf, r.lumen_atual,
       COALESCE(r.lumen_atual, CASE r.regra WHEN 'b' THEN 'cat_1780977675127' ELSE 'cat_1780977754290' END) AS novo_o,
       CASE r.regra WHEN 'a' THEN 'cat_rem_dlc' WHEN 'b' THEN 'cat_rem_plb' ELSE 'cat_rem_tex' END AS novo_d
  FROM regra r;

-- ── 2. DRY-RUN: quantos mudam, por regra e por lado ─────────────────────────────────────────────────
SELECT entidade, regra, COUNT(*) AS no_escopo,
       COUNT(*) FILTER (WHERE d IS DISTINCT FROM novo_d OR cpf IS DISTINCT FROM novo_d) AS muda_lado_victor,
       COUNT(*) FILTER (WHERE lumen_atual IS NULL) AS preenche_lado_lumen,
       COUNT(*) FILTER (WHERE lumen_atual IS NOT NULL
                          AND (o IS DISTINCT FROM novo_o OR cnpj IS DISTINCT FROM novo_o)) AS so_regrava_lumen_igual
  FROM lv_alvo GROUP BY 1, 2 ORDER BY 1, 2;

-- ── 3. ANTES (guardar o resultado fora do banco antes de aplicar) ───────────────────────────────────
SELECT entidade, id, o AS categoria_origem_id, d AS categoria_destino_id,
       cnpj AS categoria_cnpj_id, cpf AS categoria_cpf_id
  FROM lv_alvo
 WHERE o IS DISTINCT FROM novo_o OR d IS DISTINCT FROM novo_d
    OR cnpj IS DISTINCT FROM novo_o OR cpf IS DISTINCT FROM novo_d
 ORDER BY 1, 2;

-- ── 4. APLICAR (uma transação) ──────────────────────────────────────────────────────────────────────
BEGIN;

-- 4.1 Categoria nova: receita "Pró-labore", grupo Remunerações, todos os perfis (perfil_ids NULL),
--     no padrão cat_rem_* e com a cor do grupo. Não mexe na "Pro labore" de despesa da Lumen.
INSERT INTO categorias (id, name, type, color, icon, category_group, perfil_ids, gera_espelho)
VALUES ('cat_rem_plb', 'Pró-labore', 'income', '#f97316', '💼', 'Remunerações', NULL, false)
ON CONFLICT (id) DO NOTHING;

-- 4.2 Retrato das linhas que mudam (fixo: a view é viva e mudaria depois do UPDATE).
CREATE TEMP TABLE lv_mud ON COMMIT DROP AS
SELECT * FROM lv_alvo
 WHERE o IS DISTINCT FROM novo_o OR d IS DISTINCT FROM novo_d
    OR cnpj IS DISTINCT FROM novo_o OR cpf IS DISTINCT FROM novo_d;

-- 4.3 Histórico: uma linha por campo que muda.
INSERT INTO historico_alteracoes (entidade, entidade_id, serie_key, lote_id, escopo, campo,
                                  valor_anterior, valor_novo, motivo, autor)
SELECT m.entidade, m.id, m.serie_key, 'backfill_2026-11-11_lumen_victor',
       CASE m.entidade WHEN 'agendamento' THEN 'serie' ELSE 'parcela' END,
       c.campo, to_jsonb(c.de), to_jsonb(c.para),
       'Correção de dados: categoria de cada lado nas transferências Lumen Tech → Victor', 'sistema'
  FROM lv_mud m
 CROSS JOIN LATERAL (VALUES ('categoriaOrigemId', m.o, m.novo_o), ('categoriaDestinoId', m.d, m.novo_d),
                            ('categoriaCnpjId', m.cnpj, m.novo_o), ('categoriaCpfId', m.cpf, m.novo_d)
                    ) AS c(campo, de, para)
 WHERE c.de IS DISTINCT FROM c.para;

-- 4.4 Só as 4 colunas de categoria.
UPDATE lancamentos l
   SET categoria_origem_id = m.novo_o, categoria_destino_id = m.novo_d,
       categoria_cnpj_id = m.novo_o, categoria_cpf_id = m.novo_d
  FROM lv_mud m WHERE m.entidade = 'lancamento' AND l.id = m.id;
UPDATE agendamentos a
   SET categoria_origem_id = m.novo_o, categoria_destino_id = m.novo_d,
       categoria_cnpj_id = m.novo_o, categoria_cpf_id = m.novo_d
  FROM lv_mud m WHERE m.entidade = 'agendamento' AND a.id = m.id;

COMMIT;

-- ── 5. CONFERÊNCIA DEPOIS ───────────────────────────────────────────────────────────────────────────
-- Nenhuma linha do escopo pode ficar fora do alvo nem sem categoria no lado Victor (esperado: 0).
SELECT COUNT(*) AS fora_do_alvo FROM lv_alvo
 WHERE o IS DISTINCT FROM novo_o OR d IS DISTINCT FROM novo_d
    OR cnpj IS DISTINCT FROM novo_o OR cpf IS DISTINCT FROM novo_d OR d IS NULL;
-- Agrupado por lado.
SELECT v.entidade, 'Victor' AS lado, c.name AS categoria, COUNT(*) FROM lv_alvo v
  LEFT JOIN categorias c ON c.id = v.d GROUP BY 1, 2, 3
UNION ALL
SELECT v.entidade, 'Lumen', c.name, COUNT(*) FROM lv_alvo v
  LEFT JOIN categorias c ON c.id = v.o GROUP BY 1, 2, 3
 ORDER BY 1, 2, 3;

-- ── 6. CONTA PHARMA (só listar, nada muda) ──────────────────────────────────────────────────────────
SELECT 'lancamento' AS entidade, l.id, l.date, l.description, l.amount, l.account_id,
       l.categoria_origem_id, l.categoria_destino_id, l.categoria_cnpj_id, l.categoria_cpf_id, l.reconciled
  FROM lancamentos l JOIN contas cf ON cf.id = l.account_id AND cf.profile_id = 'prf_1780097998847'
 WHERE l.type = 'transfer' AND l.to_account_id = 'acc_1780099484563'
UNION ALL
SELECT 'agendamento', a.id, a.start_date, a.description, a.amount, a.account_id,
       a.categoria_origem_id, a.categoria_destino_id, a.categoria_cnpj_id, a.categoria_cpf_id, NULL
  FROM agendamentos a JOIN contas cf ON cf.id = a.account_id AND cf.profile_id = 'prf_1780097998847'
 WHERE a.transaction_type = 'transfer' AND a.to_account_id = 'acc_1780099484563'
 ORDER BY 1, 3;
-- Mesma data e valor, Itaú (acc_1780091830523) → Pharma: possível duplicidade/caminho diferente.
SELECT p.id AS lumen_pharma, i.id AS itau_pharma, i.date, i.amount, i.description, i.reconciled
  FROM lancamentos p
  JOIN contas cf ON cf.id = p.account_id AND cf.profile_id = 'prf_1780097998847'
  JOIN lancamentos i ON i.account_id = 'acc_1780091830523' AND i.to_account_id = 'acc_1780099484563'
                    AND i.type = 'transfer' AND i.date = p.date AND i.amount = p.amount
 WHERE p.type = 'transfer' AND p.to_account_id = 'acc_1780099484563';

-- ── 7. REVERTER (só se precisar; volta cada coluna ao valor_anterior gravado no histórico do lote) ──
-- BEGIN;
-- CREATE TEMP TABLE lv_rev ON COMMIT DROP AS
-- SELECT entidade, entidade_id,
--        bool_or(campo = 'categoriaOrigemId')  AS t_o,    MAX(valor_anterior #>> '{}') FILTER (WHERE campo = 'categoriaOrigemId')  AS v_o,
--        bool_or(campo = 'categoriaDestinoId') AS t_d,    MAX(valor_anterior #>> '{}') FILTER (WHERE campo = 'categoriaDestinoId') AS v_d,
--        bool_or(campo = 'categoriaCnpjId')    AS t_cnpj, MAX(valor_anterior #>> '{}') FILTER (WHERE campo = 'categoriaCnpjId')    AS v_cnpj,
--        bool_or(campo = 'categoriaCpfId')     AS t_cpf,  MAX(valor_anterior #>> '{}') FILTER (WHERE campo = 'categoriaCpfId')     AS v_cpf
--   FROM historico_alteracoes WHERE lote_id = 'backfill_2026-11-11_lumen_victor' GROUP BY 1, 2;
-- UPDATE lancamentos l SET
--   categoria_origem_id  = CASE WHEN r.t_o    THEN r.v_o    ELSE l.categoria_origem_id  END,
--   categoria_destino_id = CASE WHEN r.t_d    THEN r.v_d    ELSE l.categoria_destino_id END,
--   categoria_cnpj_id    = CASE WHEN r.t_cnpj THEN r.v_cnpj ELSE l.categoria_cnpj_id    END,
--   categoria_cpf_id     = CASE WHEN r.t_cpf  THEN r.v_cpf  ELSE l.categoria_cpf_id     END
--   FROM lv_rev r WHERE r.entidade = 'lancamento' AND l.id = r.entidade_id;
-- UPDATE agendamentos a SET
--   categoria_origem_id  = CASE WHEN r.t_o    THEN r.v_o    ELSE a.categoria_origem_id  END,
--   categoria_destino_id = CASE WHEN r.t_d    THEN r.v_d    ELSE a.categoria_destino_id END,
--   categoria_cnpj_id    = CASE WHEN r.t_cnpj THEN r.v_cnpj ELSE a.categoria_cnpj_id    END,
--   categoria_cpf_id     = CASE WHEN r.t_cpf  THEN r.v_cpf  ELSE a.categoria_cpf_id     END
--   FROM lv_rev r WHERE r.entidade = 'agendamento' AND a.id = r.entidade_id;
-- DELETE FROM historico_alteracoes WHERE lote_id = 'backfill_2026-11-11_lumen_victor';
-- -- A categoria nova só sai se ninguém mais a usa:
-- DELETE FROM categorias WHERE id = 'cat_rem_plb'
--    AND NOT EXISTS (SELECT 1 FROM lancamentos  WHERE 'cat_rem_plb' IN (category_id, categoria_origem_id, categoria_destino_id, categoria_cnpj_id, categoria_cpf_id))
--    AND NOT EXISTS (SELECT 1 FROM agendamentos WHERE 'cat_rem_plb' IN (category_id, categoria_origem_id, categoria_destino_id, categoria_cnpj_id, categoria_cpf_id));
-- COMMIT;
-- O "antes" de cada ambiente também é salvo fora do repositório (docs/privado/), antes do passo 4.
