-- FINANCIAMENTO — quitação com desconto por antecipação: o banco cobrou juros menores porque a
-- parcela foi paga antes do vencimento. A diferença fica registrada na parcela (informativo, sem
-- lançamento) e a parcela é PAGA — não "juros em falta". Só a coluna; nenhum dado é alterado
-- aqui (a correção das parcelas já pagas é um script à parte, com prévia e OK do usuário).
ALTER TABLE financing_installments ADD COLUMN IF NOT EXISTS desconto_antecipacao NUMERIC NOT NULL DEFAULT 0;
