-- "Considerar no Fluxo de Caixa principal?" POR AGENDAMENTO (src/lib/fluxoPrincipal.js).
-- NULL = regra de hoje (pela conta FC); true = despesa/receita em conta não FC entra no fluxo
-- principal; false = transferência entre conta FC e conta não FC não entra. Só agendamentos:
-- lançamentos e saldos atuais não mudam. Nenhum dado é alterado (todos ficam NULL).
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS considerar_fluxo_principal BOOLEAN;
