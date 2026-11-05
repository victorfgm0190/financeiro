-- Efetivação de Provisão com vínculo e "Desfazer efetivação" (src/lib/efetivacaoProvisao.js).
-- Na PROVISÃO: as efetivações feitas por ela, da mais antiga à mais recente. Cada item guarda a
-- ocorrência efetivada, a data real, os agendamentos criados (despesa e resgate da reserva) e a cópia
-- do estado anterior da provisão (valor, data, âncora da série, dia de vencimento fixo).
-- [] = nenhuma. Efetivações feitas antes desta coluna NÃO são reconstruídas: nenhum dado é alterado.
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS efetivacoes JSONB NOT NULL DEFAULT '[]'::jsonb;
