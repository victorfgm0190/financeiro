-- ATUALIZAR AO VOLTAR PARA O APP: `updated_at` em todas as tabelas que o /api/load traz, mantido por
-- trigger. O /api/last-change compara MAX(updated_at) + COUNT(*) por tabela (a contagem pega as
-- exclusões, que não mexem no MAX) e o app só recarrega quando a assinatura muda.
--
-- O trigger NÃO toca a linha quando nada mudou além do próprio updated_at: o /api/load roda
-- UPDATEs de manutenção a cada abertura (ex.: contas.is_reserva) e, sem essa guarda, toda abertura
-- de qualquer aparelho pareceria "dado novo" para os outros.
--
-- Linhas existentes recebem now() no ADD COLUMN (DEFAULT). Nenhum dado de negócio muda.
-- cartoes e configuracoes já têm a coluna (só ganham o trigger).

CREATE OR REPLACE FUNCTION finup_tocar_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) - 'updated_at') = (to_jsonb(OLD) - 'updated_at') THEN
    RETURN NEW;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'contas', 'cartoes', 'lancamentos', 'agendamentos', 'categorias', 'orcamento',
    'regras_classificacao', 'reservas_funcoes', 'reservas', 'favorecidos', 'configuracoes',
    'envelopes', 'grupos_conta', 'perfis', 'card_imports', 'gerencial_rules', 'reserve_functions',
    'lancamento_rateios', 'schedule_reserva_funcoes', 'favorecido_alias', 'tipos_documento'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE; -- tabela opcional ausente neste banco
    END IF;
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_finup_updated_at ON %I', t);
    EXECUTE format('CREATE TRIGGER trg_finup_updated_at BEFORE INSERT OR UPDATE ON %I
                    FOR EACH ROW EXECUTE FUNCTION finup_tocar_updated_at()', t);
  END LOOP;
END
$$;
